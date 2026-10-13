// ============================================================
//  Creative Snow by Cowbay — checklist settings
//  Edit this file to change where reports go and what gets checked.
//  After editing, bump VERSION in sw.js so phones pick up the change.
// ============================================================
window.APP_CONFIG = {
  // Name shown at the top of the app and on the PDF report.
  companyName: "Creative Snow by Cowbay",

  // Where completed reports are emailed. Separate multiple addresses with commas.
  reportEmail: "andrew.makosky@cowbaycontracting.com, patricia.vallejo@cowbaycontracting.com, mark.dalonzo@cowbaycontracting.com, brian.dalonzo@cowbaycontracting.com, ddalonzo@cowbaycontracting.com",

  // OPTIONAL — send the PDF report automatically, with no email app needed.
  // Follow "Automatic emailing" in README.md to set up the free Google
  // Apps Script sender, then paste its Web app URL between the quotes.
  // Leave blank and drivers send the PDF from their phone's email app instead.
  emailServiceUrl: "https://script.google.com/macros/s/AKfycbz-NCVD8CnM5mY6XbDiAavBrRl8XjXd-oVU0JGYhZs3llcsn_qH_IzHRNMTxGIu_ilV8A/exec",

  // Vehicle / equipment types the driver picks from.
  // Keep "Other" last: choosing it asks the driver to type the vehicle type.
  vehicleTypes: [
    "Pickup with plow",
    "Pickup with plow and spreader",
    "Small dump truck with plow",
    "Small dump truck with plow and spreader",
    "Large dump truck with plow",
    "Large dump truck with plow and spreader",
    "Skid steer",
    "Small loader",
    "Large payloader",
    "Sidewalk machine / ATV",
    "Other",
  ],

  // The checklist. Add, remove or rename sections and items freely.
  checklist: [
    {
      section: "Paperwork",
      items: [
        "Registration in vehicle",
        "Insurance card in vehicle",
        "State inspection current",
      ],
    },
    {
      section: "Engine & Fluids",
      items: [
        "Starts and runs with no warning lights",
        "No major leaks (engine, transmission, hydraulic, fuel)",
        "Fluids checked: oil, coolant, transmission, power steering, brake",
        "Battery secure, terminals clean",
        "Belts, hoses, and exhaust in good shape",
      ],
    },
    {
      section: "Tires & Brakes",
      items: [
        "Tires have good tread, correct pressure, no damage",
        "Wheels and lug nuts secure",
        "Service and parking brakes work",
        "Brake lines look good",
      ],
    },
    {
      section: "Lights & Electrical",
      items: [
        "Headlights (high and low), tail, brake, reverse, plate lights",
        "Turn signals and hazards",
        "Plow lights and amber strobes",
        "Backup alarm and horn",
        "Wipers and washer fluid",
        "Heater and defroster",
      ],
    },
    {
      section: "Plow",
      items: [
        "Mounted securely; frame and welds not cracked",
        "Cutting edge and shoes in good condition",
        "Hydraulic hoses and fittings tight, no leaks; fluid level OK",
        "Raises, lowers, and angles left/right",
        "Controller and wiring work",
        "Plow markers installed",
      ],
    },
    {
      section: "Salt Spreader",
      items: [
        "Mounted securely; hopper solid, no missing parts or guards",
        "Spinner and conveyor/auger work",
        "Controller, wiring, and flow gate work",
        "Hydraulic hoses free of leaks",
        "Spreader lights work",
      ],
    },
    {
      section: "Cab & Visibility",
      items: [
        "Windshield free of major cracks",
        "Mirrors secure and adjusted; rear view clear",
        "Seat belts, seat, doors, and locks work",
        "No loose items in cab",
      ],
    },
    {
      section: "Safety Equipment On Board",
      items: [
        "Fire extinguisher (charged and mounted)",
        "Safety vest",
        "Ice scraper / snow brush",
      ],
    },
    {
      section: "Cow Bay Requirements",
      items: [
        "Cow Bay signage and site ID displayed",
        "2026-2027 inspection decal installed",
        "GPS installed, working, and confirmed with dispatch",
        "Driver and emergency contact info submitted",
        "Vehicle assigned to a site/route",
        "Driver has supervisor and dispatch contacts",
        "Driver knows sign-in/out, dispatch, and accident reporting",
      ],
    },
    {
      section: "Road & Function Test",
      items: [
        "Road test: brakes and steering",
        "Plow: raise, lower, angle",
        "Spreader running",
        "Warning lights and backup alarm",
        "GPS signal verified",
      ],
    },
  ],

  // Shown above the sign-off in the app and printed on every report.
  policy: [
    "No vehicle or equipment will be dispatched unless it has passed this inspection and has a current Cow Bay decal. Any vehicle with an unsafe condition, broken required equipment, or missing GPS or ID may be pulled from service until it's fixed.",
    "A Cow Bay decal will be applied to certify that the vehicle is approved for use. The decal does not guarantee approval for the full season. If the vehicle's condition changes, the decal can be revoked.",
  ],
};
