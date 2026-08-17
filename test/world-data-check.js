/** Run: node test/world-data-check.js */
"use strict";

var path = require("path");
var data = require(path.join(__dirname, "..", "world-data.js"));
var failures = 0;
function assert(condition, message) {
  if (condition) console.log("PASS: " + message);
  else { console.log("FAIL: " + message); failures++; }
}

console.log("--- Streamlined world facts ---");
assert(data.WORLD.year === 2074, "year is 2074");
assert(data.WORLD.location === "Singapore", "location is Singapore");
assert(data.WORLD.controlledFoodSupplyShare === 92, "controlled food supply is 92%");
assert(data.WORLD.outdoorAgricultureShare === 8, "outdoor agriculture is 8%");
assert(data.WORLD.centralPotableTreatmentShare === 100, "potable water is centrally purified");
assert(data.WORLD.diuAdultCoverageShare === 84, "DIU-7 serves 84% of adults");

console.log("--- Four pack profiles ---");
assert(Array.isArray(data.PACKS) && data.PACKS.length === 4, "exactly four packs exist");
var expected = {
  basic: { kcal: 2140, protein: 60, price: 22.1 },
  performance: { kcal: 2700, protein: 145, price: 29.2 },
  nutrition: { kcal: 2400, protein: 70, price: 28.41 },
  premium: { kcal: 2600, protein: 110, price: 36.7 },
};
Object.keys(expected).forEach(function (id) {
  var pack = data.getPack(id);
  assert(pack.id === id, id + " pack exists");
  assert(pack.energyKcal === expected[id].kcal, id + " calories match profile");
  assert(pack.proteinG === expected[id].protein, id + " protein matches profile");
  assert(pack.priceSGD === expected[id].price, id + " price matches profile");
  var macroCalories = pack.proteinG * 4 + pack.carbohydrateG * 4 + pack.lipidG * 9;
  assert(Math.abs(macroCalories - pack.energyKcal) <= 10, id + " macronutrients approximately match calories");
  assert(pack.priceSGD < data.EQUIVALENT_MEAL.traditionalCostSGD, id + " costs less than regular food");
});
assert(data.getPack("performance").proteinG > data.getPack("basic").proteinG, "performance has more protein than basic");
assert(data.getPack("performance").proteinG === 145, "performance provides 2 g protein per kg for a 72.5 kg adult");
assert(/90%/.test(data.getPack("basic").micronutrientLabel), "basic pack supplies 90% daily vitamins and minerals");
assert(/110%/.test(data.getPack("nutrition").micronutrientLabel), "nutrition pack supplies 110% daily vitamins and minerals");
assert(/higher vitamin needs are covered/i.test(data.getPack("nutrition").tagline), "nutrition description covers people with higher vitamin needs");
assert(data.getPack("nutrition").energyKcal > data.getPack("basic").energyKcal, "nutrition has more calories than basic");
assert(data.getPack("nutrition").energyKcal < data.getPack("premium").energyKcal, "nutrition has fewer calories than premium");
assert(data.getPack("nutrition").energyKcal < data.getPack("performance").energyKcal, "nutrition has fewer calories than performance");
assert(data.getPack("premium").proteinG > data.getPack("basic").proteinG, "premium has more protein than basic");
assert(/125%/.test(data.getPack("premium").micronutrientLabel), "premium has expanded micronutrient profile");

console.log("--- Plain-language components ---");
["shell", "hydration", "macro", "additive", "valve", "spine"].forEach(function (id) {
  var component = data.getComponent(id);
  assert(component.id === id, id + " component exists");
  assert(typeof component.description === "string" && component.description.length > 15, id + " has a short description");
  assert(Array.isArray(component.exploded) && component.exploded.length === 3, id + " has an exploded position");
});
assert(data.getComponent("hydration").name === "WATER COMPARTMENT", "water compartment uses plain language");
assert(data.getComponent("macro").name === "DAILY FOOD MIXTURE", "food mixture uses plain language");

console.log("--- Equivalent regular meal ---");
assert(data.EQUIVALENT_MEAL.items.length === 5, "five regular food and water groups exist");
var equivalentExpected = {
  basic: { grains: "550 g", protein: "240 g", vegetables: "180 g", fruit: "234 g", water: "2.8 L", weight: 1204 },
  performance: { grains: "700 g", protein: "580 g", vegetables: "200 g", fruit: "260 g", water: "3.2 L", weight: 1740 },
  nutrition: { grains: "600 g", protein: "280 g", vegetables: "220 g", fruit: "286 g", water: "2.8 L", weight: 1386 },
  premium: { grains: "650 g", protein: "440 g", vegetables: "250 g", fruit: "325 g", water: "3.0 L", weight: 1665 },
};
Object.keys(equivalentExpected).forEach(function (id) {
  var profile = data.getEquivalentMeal(id);
  var expectedMeal = equivalentExpected[id];
  ["grains", "protein", "vegetables", "fruit", "water"].forEach(function (itemId) {
    assert(profile.amounts[itemId] === expectedMeal[itemId], id + " " + itemId + " comparison amount matches");
  });
  assert(profile.foodWeightG === expectedMeal.weight, id + " comparison food weight matches");
});
assert(!/organicServes|organicServeDefinition/.test(JSON.stringify(data)), "serves data is removed entirely");
assert(!/\d+ g food/.test(JSON.stringify(data)), "daily gram amounts omit the unnecessary food suffix");
assert(data.validateData().length === 0, "shipped fictional data validates");

console.log("--- Summary ---");
if (failures) { console.log(failures + " FAILURE(S)"); process.exit(1); }
console.log("ALL PASSED");
