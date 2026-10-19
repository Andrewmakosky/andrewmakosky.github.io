# Creative Snow by Cowbay — Vehicle Checklist

A mobile app for pre-season and pre-trip vehicle and equipment inspections. Drivers fill out the checklist on their phone and attach photos. When they submit, a **PDF inspection report** is created and emailed to the office.

It's a web app hosted on GitHub Pages, so there's nothing to download from an app store.

**Live at:** https://andrewmakosky.github.io/

## How it works for drivers

1. They enter the **company**, the **operators for this vehicle** with a 📷 photo of each operator's driver's license (**+ Add another operator** for more), the vehicle type (tap **Truck** or **Machine**, then pick from the list; **Other** asks what kind), the unit #, a 📷 **vehicle photo**, the odometer, and site/route.
2. They mark each item **Pass / Fail / N/A**. A **Fail** requires a short note.
3. The 📷 button on any item adds photos (camera or photo library). There's also a photo button under **Other notes / damage**.
4. They answer "Safe to operate?", read the Cow Bay policy, enter the **name of the inspector** (remembered for next time), confirm the inspection, and tap **Submit report**.

Under **Also send to (optional)** they can add up to 3 one-time email addresses. The office still gets every report. Extra contacts get their own copy, and the office copy lists who else it went to. This needs the latest `email-sender.gs` deployed; with an older one, the app says the extra contacts were not sent the report.

Progress and photos are saved on the phone as they go, so closing the app doesn't lose anything.

### The PDF report

- A status badge: **ALL PASS**, **N FAILED ITEMS** or **OUT OF SERVICE**
- Company, vehicle, operators, inspector, date, odometer and site details, plus the vehicle photo
- A red **Problems found** box listing every failed item with its note
- The full checklist with Pass/Fail/N/A for every item, and photos under the item they belong to
- An **Operators & licenses** section with each operator's license photo
- Notes, the Cow Bay policy text, and the inspector's certification

The email subject shows the same status, e.g. `[1 FAILED ITEM] Unit P-12 inspection - <inspector> - 10/12/2026`.

## Save for later

**Save for later** (under Submit) stores the inspection on the phone, photos included, and clears the form. Saved inspections are listed at the top of **New inspection**; **Continue** reopens one exactly where it was left. Saved-for-later inspections stay on the phone that saved them.

## Sent reports tab

**All reports** lists every report submitted from any device. The Google email sender saves each PDF and its form answers in a Drive folder called **Inspection Reports**, and logs it in a Google Sheet called **Inspection Reports Log**. Viewing the list needs the passcode set in `VIEW_PASSCODE` in `email-sender.gs`; each device asks for it once.

Every report has these buttons, on any device:
- **Open PDF**
- **Share** (on phones)
- **Resend**, which re-emails it to the office list
- **Edit**, which reopens the full inspection. The inspector must tick the confirmation box again. Submitting sends an email marked **[UPDATED]**, and the list shows the newest version.
- **Delete**, which removes it from the list everywhere. Its files stay in the Drive folder.

Reports logged before script version 4 can't be edited, because their answers weren't saved.

If a report couldn't be emailed (no signal), it's shown under **Not sent yet** on the device that made it, with **Resend** to send it when there's a connection.

A search box filters by unit, company or inspector.

### Turning on the shared list (one time)
1. Paste the latest `email-sender.gs` into the Apps Script project, replacing everything.
2. Set `VIEW_PASSCODE` to a passcode of your choice and save.
3. Pick **setup** in the function dropdown and click **Run**. Allow the new Google Drive and Sheets permissions when asked. The log shows links to the new folder and sheet.
4. Click **Deploy**, then **Manage deployments**, then the ✏️ pencil, then **Version: New version**, then **Deploy**.

## How reports get emailed

There are two modes:

**Without setup (default):** after Submit, the driver taps **Email PDF report**, picks their email app (Mail, Gmail, Outlook…), and sends it to the address shown on screen. The PDF is already attached. There's also **Save PDF to phone**, plus **Email without PDF** for a text-only backup.

**With automatic emailing (recommended):** the report and PDF are emailed straight to the office as soon as the driver taps Submit. The driver doesn't need to do anything else. If the phone has no signal, the app falls back to the manual buttons so the report is never lost.

### Automatic emailing setup (one time, about 10 minutes, free)

This uses a free Google Apps Script that sends the email from a Google account. Any Gmail or Google Workspace account works. Reports come **from** that account and go **to** the address in `email-sender.gs`.

1. Sign in to the Google account that should send the reports, and go to **https://script.google.com**.
2. Click **New project**. Name it "Inspection Email Sender" (click "Untitled project" at the top).
3. Delete the sample code, then paste in everything from [`email-sender.gs`](email-sender.gs) in this repo. Check that `REPORT_TO` is the address that should receive reports. Click 💾 **Save**.
4. Click **Deploy**, then **New deployment**.
   - Click the ⚙️ next to "Select type" and choose **Web app**.
   - **Execute as:** *Me*
   - **Who has access:** *Anyone*. This is required so drivers' phones can reach it; the script can only email the `REPORT_TO` address.
   - Click **Deploy**.
5. Google asks you to **Authorize access**. Pick your account. If you see "Google hasn't verified this app", click **Advanced**, then **Go to Inspection Email Sender**, then **Allow**. This is expected, because it's your own script.
6. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/…/exec`.
7. Paste it into `emailServiceUrl` in `config.js` (or send it to whoever maintains the app).

Limits: free Gmail accounts can send about 100 emails a day, and Google Workspace accounts about 1,500.

If you later change `email-sender.gs`, use **Deploy**, then **Manage deployments**, then ✏️, then **Version: New version**, then **Deploy**. That keeps the same URL.

## Settings — `config.js`

- **`companyName`**: the name shown in the app and on the PDF
- **`reportEmail`**: where reports go
- **`emailServiceUrl`**: the Apps Script URL for automatic emailing (blank = manual)
- **`vehicleTypes`**: the Truck and Machine lists drivers pick from
- **`checklist`**: sections and items. Add, remove or rename freely.
- **`policy`**: the paragraphs shown before sign-off and printed on the report

After changing any file, bump `APP_VERSION` in `version.js` (e.g. `v9` to `v10`) so phones pick up the new version. The version shows at the bottom of the form, which is a quick way to check a phone is up to date.

## Installing on a phone

Open the link on the phone, then:

- **iPhone (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap the ⋮ menu, then **Add to Home screen** / **Install app**.

The app gets its own icon and opens full screen. After the first load it also works offline.

## Files

- `index.html`, `styles.css`, `app.js`: the app
- `report.js`: builds the PDF (uses [jsPDF](https://github.com/parallax/jsPDF) 2.5.2, MIT licence, in `vendor/`)
- `config.js`: settings and checklist
- `email-sender.gs`: the Google Apps Script for automatic emailing
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and home-screen install
