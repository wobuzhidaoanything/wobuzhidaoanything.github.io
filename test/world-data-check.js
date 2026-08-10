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
assert(data.WORLD.baselineYear === 2025, "baseline year is 2025");
assert(data.WORLD.foodImportedShare === 90, "more than 90% of food is imported");
assert(data.WORLD.localFibreShare === 8, "local fibre supply is 8%");
assert(data.WORLD.localProteinShare === 25, "local protein supply is 25%");
assert(data.WORLD.tapWaterStatus === "SAFE TO DRINK", "tap water is safe to drink");
assert(data.WORLD.dailyWaterDemandMgd === 440, "daily water demand is 440 million gallons");

console.log("--- Four pack profiles ---");
assert(Array.isArray(data.PACKS) && data.PACKS.length === 4, "exactly four packs exist");
var expected = {
  basic: { kcal: 2140, protein: 60, price: 11.2 },
  performance: { kcal: 2700, protein: 120, price: 14.8 },
  nutrition: { kcal: 2140, protein: 60, price: 14.4 },
  premium: { kcal: 2600, protein: 110, price: 18.6 },
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
assert(/125%/.test(data.getPack("nutrition").micronutrientLabel), "nutrition pack has expanded micronutrient profile");
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
assert(data.EQUIVALENT_MEAL.foodWeightG === 1330, "regular food totals 1.33 kg");
assert(data.EQUIVALENT_MEAL.organicServes === 13, "regular food totals 13 organic serves");
assert(data.EQUIVALENT_MEAL.items.length === 5, "five regular food and water groups exist");
assert(data.EQUIVALENT_MEAL.items[1].amount === "270 g food", "protein-source row is clearly food weight, not protein nutrient");
assert(!/320/.test(JSON.stringify(data)), "obsolete 320 g protein-food figure removed");
assert(data.validateData().length === 0, "shipped fictional data validates");

console.log("--- Summary ---");
if (failures) { console.log(failures + " FAILURE(S)"); process.exit(1); }
console.log("ALL PASSED");
