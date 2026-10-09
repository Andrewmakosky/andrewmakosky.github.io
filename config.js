// ============================================================
//  Snow Fleet Checklist — settings
//  Edit this file to change where reports go and what gets checked.
// ============================================================
window.APP_CONFIG = {
  // Company / app name shown at the top of the app and in reports.
  companyName: "Snow Fleet",

  // Where completed reports are emailed. Separate multiple addresses with commas.
  reportEmail: "fleet@example.com",

  // OPTIONAL — send reports automatically, with no email app needed.
  // 1. Go to https://web3forms.com, enter the address that should receive reports,
  //    and copy the "Access Key" they email you.
  // 2. Paste it between the quotes below.
  // Reports then go to the address you registered with Web3Forms.
  // Leave blank to have the app open the phone's email app with the report filled in.
  web3formsAccessKey: "",

  // Vehicle / equipment types the driver picks from.
  vehicleTypes: [
    "Plow truck",
    "Pickup w/ plow",
    "Loader",
    "Skid steer",
    "Sidewalk machine / tractor",
    "Salt / sand spreader truck",
    "Snow blower",
    "Other",
  ],

  // The checklist. Add, remove or rename sections and items freely.
  checklist: [
    {
      section: "Walk-around",
      items: [
        "Tires / tracks — pressure, tread, damage",
        "Wheel nuts / lugs secure",
        "No fluid leaks under vehicle",
        "Body / cab damage",
        "Mirrors clean and adjusted",
        "Windshield free of cracks",
      ],
    },
    {
      section: "Fluids",
      items: [
        "Engine oil",
        "Coolant",
        "Hydraulic fluid",
        "Washer fluid (winter mix)",
        "Fuel / DEF level adequate",
      ],
    },
    {
      section: "Lights & safety",
      items: [
        "Headlights (high & low)",
        "Plow lights",
        "Brake / tail lights",
        "Turn signals & hazards",
        "Beacon / strobe lights",
        "Backup alarm",
        "Horn",
        "Wipers & defrost / heater",
        "Seat belt",
        "Fire extinguisher",
        "First aid kit",
      ],
    },
    {
      section: "Cab & drive",
      items: [
        "Brakes / parking brake",
        "Steering",
        "Gauges & warning lights normal",
        "4WD engages",
        "Battery / starts normally",
      ],
    },
    {
      section: "Plow & attachments",
      items: [
        "Plow mount / pins secure",
        "Cutting edge / blade wear",
        "Plow hydraulics & hoses",
        "Plow controls (up/down/angle)",
        "Trip springs / shoes",
        "Spreader / salter operating",
        "Spinner & auger / conveyor",
        "Chains (if equipped)",
        "Shovel, ice scraper, salt bucket on board",
      ],
    },
  ],
};
