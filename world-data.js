/**
 * DIU-7 — fictional product and world data.
 *
 * Nutrition profiles are speculative interface content, not personal dietary
 * advice. Pack values are fictional; the Singapore baseline readouts use
 * published SFA and PUB reference figures.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.CivicData = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var WORLD = {
    year: 2074,
    location: "Singapore",
    baselineYear: 2025,
    foodImportedShare: 90,
    localFibreShare: 8,
    localProteinShare: 25,
    tapWaterStatus: "SAFE TO DRINK",
    dailyWaterDemandMgd: 440,
  };

  var PRODUCT = {
    id: "DIU-7",
    name: "ONE DAY OF FOOD AND WATER",
    consumptionPeriodH: 24,
    location: "SINGAPORE | 2074",
    warning: "DO NOT EAT OR DRINK UNTREATED FOOD OR WATER",
  };

  var PACKS = [
    {
      id: "basic",
      code: "DIU-7B",
      name: "BASIC PACK",
      shortName: "BASIC",
      tagline: "Balanced everyday formula for a typical adult.",
      energyKcal: 2140,
      proteinG: 60,
      carbohydrateG: 300,
      lipidG: 78,
      fibreG: 30,
      hydrationL: 2.8,
      internalWaterL: 1.9,
      micronutrientLabel: "100% daily vitamin and mineral profile",
      priceSGD: 11.2,
      accent: "#9fc6c4",
    },
    {
      id: "performance",
      code: "DIU-7P",
      name: "PERFORMANCE PACK",
      shortName: "PERFORMANCE",
      tagline: "Higher energy and protein for sustained heavy activity.",
      energyKcal: 2700,
      proteinG: 120,
      carbohydrateG: 350,
      lipidG: 91,
      fibreG: 35,
      hydrationL: 3.2,
      internalWaterL: 2.2,
      micronutrientLabel: "100% daily vitamin and mineral profile",
      priceSGD: 14.8,
      accent: "#d7b77b",
    },
    {
      id: "nutrition",
      code: "DIU-7N",
      name: "NUTRITION PACK",
      shortName: "NUTRITION",
      tagline: "Expanded vitamin, mineral and fibre profile.",
      energyKcal: 2140,
      proteinG: 60,
      carbohydrateG: 295,
      lipidG: 80,
      fibreG: 35,
      hydrationL: 2.8,
      internalWaterL: 1.9,
      micronutrientLabel: "125% of selected vitamin and mineral reference amounts",
      priceSGD: 14.4,
      accent: "#a9c98d",
    },
    {
      id: "premium",
      code: "DIU-7X",
      name: "PREMIUM PACK",
      shortName: "PREMIUM",
      tagline: "Higher protein with the expanded vitamin and mineral profile.",
      energyKcal: 2600,
      proteinG: 110,
      carbohydrateG: 335,
      lipidG: 91,
      fibreG: 35,
      hydrationL: 3.0,
      internalWaterL: 2.0,
      micronutrientLabel: "125% of selected vitamin and mineral reference amounts",
      priceSGD: 18.6,
      accent: "#c8b6d8",
    },
  ];

  var COMPONENTS = [
    {
      id: "shell",
      shortLabel: "OUTER CASE",
      name: "OUTER PROTECTIVE CASE",
      description: "Seals the unit against contaminated air and protects it during delivery.",
      exploded: [-1.55, 0.0, 0.58],
    },
    {
      id: "hydration",
      shortLabel: "WATER",
      name: "WATER COMPARTMENT",
      description: "Stores the purified drinking water used throughout the day.",
      exploded: [-0.3, 0.0, 0.3],
    },
    {
      id: "macro",
      shortLabel: "FOOD MIXTURE",
      name: "DAILY FOOD MIXTURE",
      description: "Contains the day’s calories, protein, carbohydrates, fats and fibre.",
      exploded: [0.05, 0.0, 0.42],
    },
    {
      id: "additive",
      shortLabel: "VITAMINS + MINERALS",
      name: "VITAMIN AND MINERAL CARTRIDGE",
      description: "Adds the selected pack’s measured vitamin and mineral profile.",
      exploded: [0.44, 0.02, 0.34],
    },
    {
      id: "valve",
      shortLabel: "MOUTHPIECE",
      name: "MOUTHPIECE AND MIXER",
      description: "Combines water and food at the mouthpiece as you drink.",
      exploded: [0.88, 0.18, 0.12],
    },
    {
      id: "spine",
      shortLabel: "SIDE GRIP",
      name: "SIDE GRIP AND FRAME",
      description: "Makes the unit easy to hold, stack and transport.",
      exploded: [0.72, 0.0, -0.45],
    },
  ];

  var EQUIVALENT_MEAL = {
    title: "WHAT DIU-7 REPLACES",
    items: [
      { id: "grains", label: "Cooked wholegrains", amount: "600 g", organicServes: 6 },
      { id: "protein", label: "Meat, fish, tofu or beans", amount: "270 g food", organicServes: 3 },
      { id: "vegetables", label: "Cooked vegetables", amount: "200 g", organicServes: 2 },
      { id: "fruit", label: "Fresh fruit", amount: "260 g", organicServes: 2 },
      { id: "water", label: "Drinking water", amount: "2.8 L", organicServes: null },
    ],
    foodWeightG: 1330,
    organicServes: 13,
    traditionalCostSGD: 186.4,
    note: "Fresh food is still available, but costs much more.",
    organicServeDefinition: "One standard portion of conventional, non-manufactured food.",
  };

  function getPack(id) {
    for (var i = 0; i < PACKS.length; i++) {
      if (PACKS[i].id === id) return PACKS[i];
    }
    return PACKS[0];
  }

  function getComponent(id) {
    for (var i = 0; i < COMPONENTS.length; i++) {
      if (COMPONENTS[i].id === id) return COMPONENTS[i];
    }
    return COMPONENTS[0];
  }

  function validateData() {
    var issues = [];
    if (!PRODUCT.id || !PRODUCT.name) issues.push("product identity missing");
    if (WORLD.year !== 2074) issues.push("world year must be 2074");
    if (PACKS.length !== 4) issues.push("four packs required");
    PACKS.forEach(function (pack) {
      if (!(pack.energyKcal > 0)) issues.push(pack.id + " energy invalid");
      if (!(pack.proteinG >= 50 && pack.proteinG <= 120)) issues.push(pack.id + " protein outside profile range");
      if (!(pack.hydrationL > 0)) issues.push(pack.id + " hydration invalid");
      if (!(pack.priceSGD > 0)) issues.push(pack.id + " price invalid");
    });
    if (COMPONENTS.length < 4) issues.push("at least four components required");
    return issues;
  }

  return {
    WORLD: WORLD,
    PRODUCT: PRODUCT,
    PACKS: PACKS,
    COMPONENTS: COMPONENTS,
    EQUIVALENT_MEAL: EQUIVALENT_MEAL,
    getPack: getPack,
    getComponent: getComponent,
    validateData: validateData,
  };
});
