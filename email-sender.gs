/**
 * Creative Snow by Cowbay — inspection report email sender and archive.
 *
 * Paste this into a Google Apps Script project and deploy it as a Web app
 * (see "Automatic emailing" in README.md). The checklist app posts each
 * finished report here. This script:
 *   - emails it with the PDF attached, from the Google account that deploys it;
 *   - saves the PDF (and the form answers, so it can be edited later) in a
 *     Google Drive folder and logs it in a Google Sheet;
 *   - lets the app list, open, resend, edit and delete saved reports on any
 *     device, for people who know VIEW_PASSCODE.
 *
 * After pasting a new version, run setup() once from the editor (to grant
 * Drive and Sheets access), then Deploy > Manage deployments > edit >
 * Version: New version > Deploy.
 */

// Every report goes to these addresses. Separate multiple addresses with commas.
var REPORT_TO = "andrew.makosky@cowbaycontracting.com, patricia.vallejo@cowbaycontracting.com, mark.dalonzo@cowbaycontracting.com, brian.dalonzo@cowbaycontracting.com, ddalonzo@cowbaycontracting.com";

var SENDER_NAME = "Creative Snow Inspections";

// Drivers can also send a report to a few one-time contacts. Those get their
// own copy (so they don't see the addresses above), and the office copy says
// who else it went to, so anything sent outside is always visible here.
var MAX_EXTRA = 3;

// Passcode for viewing and managing saved reports in the app's "Sent reports"
// tab. Reports include license photos and phone numbers, so pick something
// that isn't easy to guess. Leave blank to turn shared reports off.
var VIEW_PASSCODE = "";

// Names of the Drive folder and Sheet created by setup().
var FOLDER_NAME = "Inspection Reports";
var SHEET_NAME = "Inspection Reports Log";

// Bumped when the script changes, so the app can tell which version is live.
var SCRIPT_VERSION = 4;

var LOG_HEADERS = ["Submitted", "Unit", "Company", "Vehicle type", "Result", "Inspector", "Subject",
  "PDF link", "File ID", "Kind", "Report ID", "Form data file ID", "Deleted", "Originally submitted"];
var COL = { submitted: 0, unit: 1, company: 2, type: 3, result: 4, inspector: 5, subject: 6,
  link: 7, fileId: 8, kind: 9, reportId: 10, stateId: 11, deleted: 12, originalAt: 13 };

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action) return json(manage(d));
    if (!d.pdfBase64 || !d.subject) throw new Error("Missing report");
    var pdf = Utilities.newBlob(
      Utilities.base64Decode(d.pdfBase64),
      "application/pdf",
      String(d.filename || "Inspection.pdf").replace(/[^\w.\-]+/g, "_")
    );
    var subject = String(d.subject).slice(0, 250);
    var body = String(d.body || "Inspection report attached.");
    var extras = cleanEmails(d.extraTo);

    MailApp.sendEmail({
      to: REPORT_TO,
      subject: subject,
      body: body + (extras.length ? "\n\nAlso sent to: " + extras.join(", ") : ""),
      name: SENDER_NAME,
      attachments: [pdf],
    });
    if (extras.length) {
      MailApp.sendEmail({
        to: extras.join(","),
        subject: subject,
        body: body,
        name: SENDER_NAME,
        replyTo: REPORT_TO.split(",")[0].trim(),
        attachments: [pdf],
      });
    }

    // The email already went out, so a problem saving the copy doesn't fail the send.
    var archived = false;
    try {
      archiveReport(pdf, subject, d.meta || {}, d.state);
      archived = true;
    } catch (archiveErr) {
      console.error("Archive failed: " + archiveErr);
    }
    return json({ ok: true, extraSent: extras.length, archived: archived, version: SCRIPT_VERSION });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

// GET with no action: status check. Other actions need the passcode.
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action) return json(manage(p));
  return json({
    ok: true,
    message: "Inspection email sender is running.",
    sendsTo: REPORT_TO,
    version: SCRIPT_VERSION,
    sharing: !!VIEW_PASSCODE,
  });
}

// list / pdf / state (GET) and resend / delete (POST), all passcode-protected.
function manage(p) {
  if (!VIEW_PASSCODE) return { ok: false, error: "Shared reports are turned off (no VIEW_PASSCODE set)." };
  if (p.passcode !== VIEW_PASSCODE) return { ok: false, error: "Wrong passcode." };
  try {
    switch (p.action) {
      case "list": return { ok: true, version: SCRIPT_VERSION, reports: listReports() };
      case "pdf": return getPdf(p.id);
      case "state": return getState(p.id);
      case "resend": return resendReport(p.id);
      case "delete": return deleteReport(p.id);
    }
    return { ok: false, error: "Unknown action." };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

// Run once from the editor: creates the folder and sheet, and grants access.
function setup() {
  var folder = getFolder();
  var sheet = getSheet();
  Logger.log("Reports folder: " + folder.getUrl());
  Logger.log("Reports log: " + sheet.getParent().getUrl());
}

function archiveReport(pdf, subject, meta, state) {
  var folder = getFolder();
  var file = folder.createFile(pdf);
  var stateId = "";
  if (state) {
    var stateFile = folder.createFile(file.getName().replace(/\.pdf$/i, "") + ".form.json",
      JSON.stringify(state), "application/json");
    stateId = stateFile.getId();
  }
  var row = [];
  row[COL.submitted] = meta.createdAt ? new Date(meta.createdAt) : new Date();
  row[COL.unit] = String(meta.unit || "");
  row[COL.company] = String(meta.company || "");
  row[COL.type] = String(meta.vehicleType || "");
  row[COL.result] = String(meta.result || "");
  row[COL.inspector] = String(meta.inspector || "");
  row[COL.subject] = subject;
  row[COL.link] = file.getUrl();
  row[COL.fileId] = file.getId();
  row[COL.kind] = String(meta.kind || "");
  row[COL.reportId] = String(meta.reportId || file.getId());
  row[COL.stateId] = stateId;
  row[COL.deleted] = "";
  row[COL.originalAt] = meta.originalAt ? new Date(meta.originalAt) : "";
  getSheet().appendRow(row);
}

// All rows, newest first. Older logs may have fewer columns, so pad them.
function allRows() {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var width = Math.max(sheet.getLastColumn(), LOG_HEADERS.length);
  return sheet.getRange(2, 1, last - 1, width).getValues().map(function (r, i) {
    r.rowNumber = i + 2;
    return r;
  }).reverse();
}

// One entry per report: the newest version, unless the report was deleted.
function listReports() {
  var seen = {}, deleted = {}, out = [];
  allRows().forEach(function (r) {
    var id = String(r[COL.reportId] || r[COL.fileId]);
    if (r[COL.deleted]) deleted[id] = true;
    if (seen[id]) return;
    seen[id] = true;
    out.push({ r: r, id: id });
  });
  return out.filter(function (x) { return !deleted[x.id]; }).slice(0, 500).map(function (x) {
    var r = x.r;
    return {
      reportId: x.id,
      fileId: r[COL.fileId],
      createdAt: iso(r[COL.submitted]),
      originalAt: iso(r[COL.originalAt]),
      unit: r[COL.unit], company: r[COL.company], vehicleType: r[COL.type], result: r[COL.result],
      inspector: r[COL.inspector], subject: r[COL.subject], kind: r[COL.kind],
      hasState: !!r[COL.stateId],
    };
  });
}

// The newest row for a report ID (or a PDF file ID, for older entries).
function latestRow(id) {
  id = String(id || "");
  var rows = allRows();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.reportId] || rows[i][COL.fileId]) === id || String(rows[i][COL.fileId]) === id) return rows[i];
  }
  throw new Error("Report not found.");
}

function getPdf(id) {
  var file = reportFile(latestRow(id)[COL.fileId]);
  return { ok: true, filename: file.getName(), pdfBase64: Utilities.base64Encode(file.getBlob().getBytes()) };
}

function getState(id) {
  var row = latestRow(id);
  if (!row[COL.stateId]) throw new Error("This report was submitted before editing was available.");
  var file = reportFile(row[COL.stateId]);
  return { ok: true, state: JSON.parse(file.getBlob().getDataAsString()) };
}

function resendReport(id) {
  var row = latestRow(id);
  var pdf = reportFile(row[COL.fileId]).getBlob();
  MailApp.sendEmail({
    to: REPORT_TO,
    subject: String(row[COL.subject]).slice(0, 250),
    body: "Resent inspection report. The full report is attached as a PDF.",
    name: SENDER_NAME,
    attachments: [pdf],
  });
  return { ok: true };
}

// Hides the report from the app. Its files stay in the Drive folder.
function deleteReport(id) {
  var row = latestRow(id);
  var reportId = String(row[COL.reportId] || row[COL.fileId]);
  var sheet = getSheet();
  ensureHeaders(sheet);
  allRows().forEach(function (r) {
    if (String(r[COL.reportId] || r[COL.fileId]) === reportId) {
      sheet.getRange(r.rowNumber, COL.deleted + 1).setValue(new Date());
    }
  });
  return { ok: true };
}

// Only hand out files that live in the reports folder.
function reportFile(fileId) {
  var file = DriveApp.getFileById(String(fileId || ""));
  var folderId = getFolder().getId();
  var parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return file;
  throw new Error("Not a saved report.");
}

function iso(v) {
  return v instanceof Date ? v.toISOString() : (v ? String(v) : "");
}

function getFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("folderId");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ }
  }
  var folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty("folderId", folder.getId());
  return folder;
}

function getSheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("sheetId");
  if (id) {
    try {
      var existing = SpreadsheetApp.openById(id).getSheets()[0];
      ensureHeaders(existing);
      return existing;
    } catch (e) { /* recreate below */ }
  }
  var ss = SpreadsheetApp.create(SHEET_NAME);
  var sheet = ss.getSheets()[0];
  sheet.appendRow(LOG_HEADERS);
  sheet.setFrozenRows(1);
  DriveApp.getFileById(ss.getId()).moveTo(getFolder());
  props.setProperty("sheetId", ss.getId());
  return sheet;
}

// Adds the newer column headings to logs created by an older version.
function ensureHeaders(sheet) {
  if (sheet.getLastColumn() < LOG_HEADERS.length) {
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
  }
}

// Keeps only well-formed, unique addresses, at most MAX_EXTRA of them.
function cleanEmails(list) {
  if (!Array.isArray(list)) return [];
  var re = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[A-Za-z]{2,}$/;
  var out = [];
  list.forEach(function (a) {
    a = String(a).trim().toLowerCase();
    if (re.test(a) && out.indexOf(a) < 0 && out.length < MAX_EXTRA) out.push(a);
  });
  return out;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
