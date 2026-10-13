/**
 * Creative Snow by Cowbay — inspection report email sender.
 *
 * Paste this into a Google Apps Script project and deploy it as a Web app
 * (see "Automatic emailing" in README.md). The checklist app posts each
 * finished report here, and this script emails it with the PDF attached
 * from the Google account that deploys it.
 */

// Every report goes to these addresses. Separate multiple addresses with commas.
var REPORT_TO = "andrew.makosky@cowbaycontracting.com, patricia.vallejo@cowbaycontracting.com, mark.dalonzo@cowbaycontracting.com, brian.dalonzo@cowbaycontracting.com, ddalonzo@cowbaycontracting.com";

var SENDER_NAME = "Creative Snow Inspections";

// Drivers can also send a report to a few one-time contacts. Those get their
// own copy (so they don't see the addresses above), and the office copy says
// who else it went to, so anything sent outside is always visible here.
var MAX_EXTRA = 3;

// Bumped when the script changes, so the app can tell which version is live.
var SCRIPT_VERSION = 2;

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
    return json({ ok: true, extraSent: extras.length, version: SCRIPT_VERSION });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

// Open the Web app URL in a browser to check it's deployed and see who the
// live version emails. If sendsTo is out of date, deploy a New version.
function doGet() {
  return json({ ok: true, message: "Inspection email sender is running.", sendsTo: REPORT_TO, version: SCRIPT_VERSION });
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
