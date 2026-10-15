// ============================================================
//  Creative Snow by Cowbay — checklist settings
//  Edit this file to change where reports go and what gets checked.
//  After editing, bump APP_VERSION in version.js so phones pick up the change.
// ============================================================
window.APP_CONFIG = {
  // Name shown at the top of the app and on the PDF report.
  companyName: "Creative Snow by Cowbay",

  // Title shown under the logo at the top of the app.
  appTitle: "Creative Snow Vehicle Inspection Checklist",

  // Where completed reports are emailed. Separate multiple addresses with commas.
  reportEmail: "andrew.makosky@cowbaycontracting.com, patricia.vallejo@cowbaycontracting.com, mark.dalonzo@cowbaycontracting.com, brian.dalonzo@cowbaycontracting.com, ddalonzo@cowbaycontracting.com",

  // OPTIONAL — send the PDF report automatically, with no email app needed.
  // Follow "Automatic emailing" in README.md to set up the free Google
  // Apps Script sender, then paste its Web app URL between the quotes.
  // Leave blank and drivers send the PDF from their phone's email app instead.
  emailServiceUrl: "https://script.google.com/macros/s/AKfycbz-NCVD8CnM5mY6XbDiAavBrRl8XjXd-oVU0JGYhZs3llcsn_qH_IzHRNMTxGIu_ilV8A/exec",

  // Vehicle / equipment types the driver picks from.
  // Keep "Other" last in each list: choosing it asks the driver to type the vehicle type.
  // The driver first taps a category, then picks from its list.
  // Heading over the dropdown for each category.
  vehicleTypeLabels: {
    Truck: "Type of Vehicle",
    Machine: "Type of Machine",
  },
  // Label for the box that appears when "Other" is picked.
  vehicleOtherLabels: {
    Truck: "Describe your vehicle",
    Machine: "Describe your machine",
  },
  // Label for the unit number box.
  unitLabels: {
    Truck: "Unit / vehicle #",
    Machine: "Unit / machine #",
  },
  vehicleTypes: {
    Truck: [
      "Pickup with Plow",
      "Pickup with Plow and Spreader",
      "Small Dump Truck with Plow",
      "Small Dump Truck with Plow and Spreader",
      "Large Dump Truck with Plow",
      "Large Dump Truck with Plow and Spreader",
      "Other",
    ],
    Machine: [
      "Skid Steer",
      "Small Loader",
      "Large Payloader",
      "Backhoe",
      "Sidewalk Machine / ATV",
      "Other",
    ],
  },

  // The checklist. Add, remove or rename sections and items freely.
  // Each section has a number shown in its heading (e.g. "5a"); keep them
  // unique, since saved answers and photos are tied to them.
  // A section with onlyFor: "Truck" or "Machine" only appears for that
  // vehicle type.
  // An item can also be { name: "...", passInput: "Label" }: answering Pass
  // then shows a required box with that label (e.g. the GPS ID number).
  checklist: [
    {
      number: "1",
      section: "Paperwork",
      items: [
        "Registration in vehicle",
        "Insurance card in vehicle",
        "State inspection current",
      ],
    },
    {
      number: "2",
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
      number: "3",
      section: "Tires & Brakes",
      items: [
        "Tires have good tread, correct pressure, no damage",
        "Wheels and lug nuts secure",
        "Service and parking brakes work",
        "Brake lines look good",
      ],
    },
    {
      number: "4",
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
      number: "5a",
      section: "Truck Plow",
      onlyFor: "Truck",
      items: [
        "Mounted securely; frame and welds not cracked",
        "Cutting edge and shoes in good condition",
        "Hydraulic hoses and fittings tight, no leaks, fluid levels acceptable",
        "Raises, lowers, and angles left/right operational",
        "Controller and wiring operational",
      ],
    },
    {
      number: "5b",
      section: "Machine Push Box",
      onlyFor: "Machine",
      items: [
        "Mounted and locked on coupler",
        "Frame, side plates, and welds not cracked",
        "Cutting edge (rubber or steel) in good condition",
        "Side wear shoes/skid in good condition",
      ],
    },
    {
      number: "6",
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
      number: "7",
      section: "Cab & Visibility",
      items: [
        "Windshield free of major cracks",
        "Mirrors secure and adjusted; rear view clear",
        "Seat belts, seat, doors, and locks work",
        "No loose items in cab",
      ],
    },
    {
      number: "8",
      section: "Safety Equipment On Board",
      items: [
        "Fire extinguisher (charged and mounted)",
        "Safety vest",
        "Ice scraper / snow brush",
      ],
    },
    {
      number: "9",
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
      number: "10",
      section: "Road & Function Test",
      items: [
        "Road test: brakes and steering",
        "Plow: raise, lower, angle",
        "Spreader running",
        "Warning lights and backup alarm",
        { name: "GPS signal verified", passInput: "GPS ID number" },
      ],
    },
  ],

  // Shown above the sign-off in the app and printed on every report.
  policy: [
    "No vehicle or equipment will be dispatched unless it has passed this inspection and has a current Cow Bay decal. Any vehicle with an unsafe condition, broken required equipment, or missing GPS or ID may be pulled from service until it's fixed.",
    "A Cow Bay decal will be applied to certify that the vehicle is approved for use. The decal does not guarantee approval for the full season. If the vehicle's condition changes, the decal can be revoked.",
  ],
};
