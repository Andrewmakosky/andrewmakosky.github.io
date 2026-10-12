# Creative Snow by Cowbay — Vehicle Checklist

A mobile app for pre-trip vehicle and equipment inspections. Drivers fill out the checklist on their phone, and when they submit it, an inspection report is emailed to the office.

It's a web app hosted on GitHub Pages, so there's nothing to download from an app store.

**Live at:** https://andrewmakosky.github.io/

## Setup (one time)

Edit **`config.js`**:

1. **`reportEmail`**: the address that receives reports.
2. **`companyName`**: the name shown in the app and in the reports.
3. **`checklist`** / **`vehicleTypes`**: add, remove or rename items.

### Sending reports automatically (recommended)

By default, submitting a report opens the phone's email app with the report filled in, and the driver presses **Send**. To skip that step:

1. Go to https://web3forms.com, enter the address that should receive reports, and get an Access Key (free).
2. Paste the key into `web3formsAccessKey` in `config.js`.

Reports are then sent automatically when the driver taps **Submit**. If sending fails (for example, there's no signal), the app falls back to opening the email app so the report isn't lost.

## Installing on a phone

Open the link on the phone, then:

- **iPhone (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap the ⋮ menu, then **Add to Home screen** / **Install app**.

The app gets its own icon and opens full screen. After the first load it also works offline.

## How it works for drivers

- They enter their name (remembered for next time), unit #, type, hours/odometer and fuel.
- They mark each item **OK / Problem / N/A**. Choosing **Problem** requires a short note.
- **Mark remaining as OK** speeds up a clean inspection.
- They answer "Safe to operate?" and confirm the inspection.
- Progress is saved as they go, so closing the app doesn't lose anything.

The email subject flags the status: `[ALL OK]`, `[2 ISSUES]` or `[OUT OF SERVICE]`. Problems are listed at the top of the report.

## Updating

After changing any file, bump `VERSION` in `sw.js` (e.g. `v1` to `v2`) so phones pick up the new version.
