/**
 * Creative Snow by Cowbay — inspection report email sender.
 *
 * Paste this into a Google Apps Script project and deploy it as a Web app
 * (see "Automatic emailing" in README.md). The checklist app posts each
 * finished report here, and this script emails it with the PDF attached
 * from the Google account that deploys it.
 */

// Reports can only ever be sent to these addresses, so nobody can use the
// script to email anyone else. Separate multiple addresses with commas.
var REPORT_TO = "andrew.makosky@cowbaycontracting.com";

var SENDER_NAME = "Creative Snow Inspections";

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (!d.pdfBase64 || !d.subject) throw new Error("Missing report");
    var pdf = Utilities.newBlob(
      Utilities.base64Decode(d.pdfBase64),
      "application/pdf",
      String(d.filename || "Inspection.pdf").replace(/[^\w.\-]+/g, "_")
    );
    MailApp.sendEmail({
      to: REPORT_TO,
      subject: String(d.subject).slice(0, 250),
      body: String(d.body || "Inspection report attached."),
      name: SENDER_NAME,
      attachments: [pdf],
    });
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

// Lets you open the Web app URL in a browser to check it's deployed.
function doGet() {
  return json({ ok: true, message: "Inspection email sender is running." });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
