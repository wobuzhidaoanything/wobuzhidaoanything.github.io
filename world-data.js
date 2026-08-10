/**
 * CIVIC DAILY INTAKE UNIT — fictional world and product data.
 *
 * This module contains speculative interface content only. It intentionally
 * makes no real nutritional or medical claims. It works in both a browser and
 * Node so the shipped data can be checked without a build step.
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
    region: "Singapore Urban Sector 04",
    outdoorAgriculturalShare: 8,
    directPotableNetwork: "Restricted",
    controlledAgricultureShare: 92,
    freshFoodIndex: 7.6,
    standardCivicDiet: "DIU allocation",
    supplyStatus: "NOMINAL",
  };

  var PRODUCT = {
    id: "DIU-7",
    name: "CIVIC DAILY INTAKE UNIT",
    profile: "STANDARD ADULT // CLASS C",
    allocationClass: "C",
    energyKcal: 2140,
    hydrationEquivalentL: 2.8,
    internalHydrationL: 1.9,
    proteinG: 96,
    carbohydrateG: 262,
    lipidG: 78,
    fibreG: 31,
    consumptionPeriodH: 24,
    productionFacility: "CNF-03",
    productionFacilityLong: "CENTRAL NUTRITION FACILITY 03",
    location: "SINGAPORE // 2074",
    status: "Cleared for distribution",
    warning: "DO NOT SUPPLEMENT WITH UNTREATED FOOD OR WATER",
  };

  var COMPONENTS = [
    {
      id: "shell",
      shortLabel: "BARRIER SHELL",
      name: "ATMOSPHERIC BARRIER SHELL",
      description: "Multilayer polymer enclosure rated for contaminated urban exposure.",
      detail: "Protects the contents during civic distribution and daily handling. The translucent enclosure is structural rather than decorative.",
      code: "ABS-7 / SEALED",
      exploded: [-1.55, 0.0, 0.58],
    },
    {
      id: "hydration",
      shortLabel: "HYDRATION PHASE",
      name: "PURIFIED HYDRATION PHASE",
      description: "Central purification output. Reconstituted mineral profile. 1.9 L internal reservoir.",
      detail: "The largest chamber communicates the infrastructural convergence of drinking-water and food production.",
      code: "H₂O / SG-4 / 1.9 L",
      exploded: [-0.3, 0.0, 0.3],
    },
    {
      id: "macro",
      shortLabel: "NUTRIENT MATRIX",
      name: "MACRONUTRIENT MATRIX",
      description: "Algal and microbial protein, carbohydrate substrate, lipid emulsion, fibre and standardized flavour compounds.",
      detail: "2,140 kcal · Protein 96 g · Carbohydrate 262 g · Lipid 78 g · Fibre 31 g.",
      code: "MX-C / PEARL 04",
      exploded: [0.05, 0.0, 0.42],
    },
    {
      id: "additive",
      shortLabel: "ADDITIVE MODULE",
      name: "MICRONUTRIENT / ADAPTIVE ADDITIVE MODULE",
      description: "Electrolyte profile SG-4. Individual supplementation profile synchronized at filling.",
      detail: "Fictional atmospheric contaminant binding compound: 14 mg. Interface copy is speculative, not health advice.",
      code: "SG-4 / LOT 74.188",
      exploded: [0.44, 0.02, 0.34],
    },
    {
      id: "valve",
      shortLabel: "MIXING VALVE",
      name: "CONTROLLED MIXING VALVE",
      description: "Combines hydration and nutrient phases at the dispensing point.",
      detail: "The twist seal and integrated mouthpiece support gradual consumption across one 24-hour cycle.",
      code: "CV-11 / 24H SEAL",
      exploded: [0.88, 0.18, 0.12],
    },
    {
      id: "spine",
      shortLabel: "STRUCTURAL SPINE",
      name: "DISTRIBUTION STRUCTURAL SPINE",
      description: "Rigid handling edge for automated filling, stacking and civic distribution.",
      detail: "A durable injection-moulded component carries the unit identifier and batch-readable surface.",
      code: "CNF-03 / LINE 7",
      exploded: [0.72, 0.0, -0.45],
    },
  ];

  var EQUIVALENT_MEAL = {
    title: "TRADITIONAL DAILY EQUIVALENT",
    items: [
      { id: "grains", label: "Grains / carbohydrates", amount: "6 servings" },
      { id: "protein", label: "Protein source", amount: "3 servings" },
      { id: "vegetables", label: "Vegetables", amount: "5 servings" },
      { id: "fruit", label: "Fruit", amount: "2 servings" },
      { id: "water", label: "Potable water", amount: "2.8 L" },
    ],
    traditionalCostSGD: 186.4,
    diuCostSGD: 11.2,
    traditionalPreparationMinutes: 74,
    diuPreparationMinutes: 0,
    note: "Conventional food remains available through premium civilian markets.",
  };

  function getComponent(id) {
    for (var i = 0; i < COMPONENTS.length; i++) {
      if (COMPONENTS[i].id === id) return COMPONENTS[i];
    }
    return COMPONENTS[0];
  }

  function validateData() {
    var issues = [];
    if (!PRODUCT.id || !PRODUCT.name) issues.push("product identity missing");
    if (!(PRODUCT.energyKcal > 0)) issues.push("energy must be positive");
    if (!(PRODUCT.hydrationEquivalentL > 0)) issues.push("hydration must be positive");
    if (!(WORLD.year >= 2070)) issues.push("world year outside premise");
    if (WORLD.outdoorAgriculturalShare + WORLD.controlledAgricultureShare !== 100) {
      issues.push("agricultural shares must total 100");
    }
    if (COMPONENTS.length < 4) issues.push("at least four components required");
    return issues;
  }

  return {
    WORLD: WORLD,
    PRODUCT: PRODUCT,
    COMPONENTS: COMPONENTS,
    EQUIVALENT_MEAL: EQUIVALENT_MEAL,
    getComponent: getComponent,
    validateData: validateData,
  };
});
