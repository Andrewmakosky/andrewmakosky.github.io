/**
 * Creative Snow by Cowbay — inspection report email sender and archive.
 *
 * Paste this into a Google Apps Script project and deploy it as a Web app
 * (see "Automatic emailing" in README.md). The checklist app posts each
 * finished report here. This script:
 *   - emails it with the PDF attached, from the Google account that deploys it;
 *   - saves the PDF in a Google Drive folder and logs it in a Google Sheet;
 *   - lets the app list saved reports (and open their PDFs) on any device,
 *     for people who know VIEW_PASSCODE.
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

// Passcode for viewing all saved reports in the app's "Sent reports" tab.
// Reports include license photos and phone numbers, so pick something that
// isn't easy to guess. Leave blank to turn shared viewing off.
var VIEW_PASSCODE = "";

// Names of the Drive folder and Sheet created by setup().
var FOLDER_NAME = "Inspection Reports";
var SHEET_NAME = "Inspection Reports Log";

// Bumped when the script changes, so the app can tell which version is live.
var SCRIPT_VERSION = 3;

var LOG_HEADERS = ["Submitted", "Unit", "Company", "Vehicle type", "Result", "Inspector", "Subject", "PDF link", "File ID", "Kind"];

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
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
      archiveReport(pdf, subject, d.meta || {});
      archived = true;
    } catch (archiveErr) {
      console.error("Archive failed: " + archiveErr);
    }
    return json({ ok: true, extraSent: extras.length, archived: archived, version: SCRIPT_VERSION });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

// GET with no action: status check. action=list / action=pdf need the passcode.
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "list" || p.action === "pdf") {
    if (!VIEW_PASSCODE) return json({ ok: false, error: "Shared reports are turned off (no VIEW_PASSCODE set)." });
    if (p.passcode !== VIEW_PASSCODE) return json({ ok: false, error: "Wrong passcode." });
    try {
      return p.action === "list" ? json({ ok: true, reports: listReports() }) : json(getPdf(p.id));
    } catch (err) {
      return json({ ok: false, error: String(err && err.message || err) });
    }
  }
  return json({
    ok: true,
    message: "Inspection email sender is running.",
    sendsTo: REPORT_TO,
    version: SCRIPT_VERSION,
    sharing: !!VIEW_PASSCODE,
  });
}

// Run once from the editor: creates the folder and sheet, and grants access.
function setup() {
  var folder = getFolder();
  var sheet = getSheet();
  Logger.log("Reports folder: " + folder.getUrl());
  Logger.log("Reports log: " + sheet.getParent().getUrl());
}

function archiveReport(pdf, subject, meta) {
  var file = getFolder().createFile(pdf);
  getSheet().appendRow([
    meta.createdAt ? new Date(meta.createdAt) : new Date(),
    String(meta.unit || ""),
    String(meta.company || ""),
    String(meta.vehicleType || ""),
    String(meta.result || ""),
    String(meta.inspector || ""),
    subject,
    file.getUrl(),
    file.getId(),
    String(meta.kind || ""),
  ]);
}

function listReports() {
  var sheet = getSheet();
  var rows = sheet.getLastRow() - 1;
  if (rows < 1) return [];
  var first = Math.max(2, sheet.getLastRow() - 499);   // newest 500
  var values = sheet.getRange(first, 1, sheet.getLastRow() - first + 1, LOG_HEADERS.length).getValues();
  return values.reverse().map(function (r) {
    return {
      createdAt: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      unit: r[1], company: r[2], vehicleType: r[3], result: r[4],
      inspector: r[5], subject: r[6], id: r[8], kind: r[9],
    };
  });
}

function getPdf(id) {
  var file = DriveApp.getFileById(String(id || ""));
  // Only hand out files that live in the reports folder.
  var inFolder = false;
  var parents = file.getParents();
  var folderId = getFolder().getId();
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  if (!inFolder) throw new Error("Not a saved report.");
  return {
    ok: true,
    filename: file.getName(),
    pdfBase64: Utilities.base64Encode(file.getBlob().getBytes()),
  };
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
    try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (e) { /* recreate below */ }
  }
  var ss = SpreadsheetApp.create(SHEET_NAME);
  var sheet = ss.getSheets()[0];
  sheet.appendRow(LOG_HEADERS);
  sheet.setFrozenRows(1);
  DriveApp.getFileById(ss.getId()).moveTo(getFolder());
  props.setProperty("sheetId", ss.getId());
  return sheet;
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
