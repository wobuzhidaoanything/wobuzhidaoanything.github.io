/** Run: node test/world-data-check.js */
"use strict";

var path = require("path");
var data = require(path.join(__dirname, "..", "world-data.js"));
var failures = 0;

function assert(condition, message) {
  if (condition) console.log("PASS: " + message);
  else { console.log("FAIL: " + message); failures++; }
}

console.log("--- World premise ---");
assert(data.WORLD.year === 2074, "year is 2074");
assert(data.WORLD.region === "Singapore Urban Sector 04", "region is Singapore Sector 04");
assert(typeof data.WORLD.outdoorAgriculturalShare === "number", "outdoor agriculture is numeric");
assert(typeof data.WORLD.controlledAgricultureShare === "number", "controlled agriculture is numeric");
assert(data.WORLD.outdoorAgriculturalShare + data.WORLD.controlledAgricultureShare === 100, "agricultural shares total 100");
assert(data.WORLD.directPotableNetwork === "Restricted", "direct potable network is restricted");
assert(data.WORLD.freshFoodIndex > 1, "fresh food index implies premium cost");

console.log("--- Product record ---");
assert(data.PRODUCT.id === "DIU-7", "product id is DIU-7");
assert(data.PRODUCT.name === "CIVIC DAILY INTAKE UNIT", "full product name present");
assert(data.PRODUCT.allocationClass === "C", "allocation class C");
assert(data.PRODUCT.energyKcal === 2140, "energy is 2,140 kcal");
assert(data.PRODUCT.hydrationEquivalentL === 2.8, "hydration equivalent is 2.8 L");
assert(data.PRODUCT.internalHydrationL === 1.9, "internal hydration phase is 1.9 L");
assert(data.PRODUCT.proteinG === 96, "protein is 96 g");
assert(data.PRODUCT.consumptionPeriodH === 24, "consumption period is 24 h");
assert(data.PRODUCT.productionFacility === "CNF-03", "production facility is CNF-03");
assert(/UNTREATED FOOD OR WATER/.test(data.PRODUCT.warning), "untreated food and water warning exists");

console.log("--- Inspectable architecture ---");
assert(Array.isArray(data.COMPONENTS) && data.COMPONENTS.length >= 4, "at least four components defined");
["shell", "hydration", "macro", "additive", "valve", "spine"].forEach(function (id) {
  var component = data.getComponent(id);
  assert(component.id === id, id + " component exists");
  assert(typeof component.name === "string" && component.name.length > 8, id + " has institutional label");
  assert(typeof component.description === "string" && component.description.length > 20, id + " has description");
  assert(Array.isArray(component.exploded) && component.exploded.length === 3, id + " has exploded position");
  assert(component.exploded.every(function (value) { return typeof value === "number" && Number.isFinite(value); }), id + " exploded position is numeric");
});

console.log("--- Equivalent meal ---");
assert(data.EQUIVALENT_MEAL.items.length >= 5, "traditional equivalent includes five provision groups");
assert(data.EQUIVALENT_MEAL.traditionalCostSGD > data.EQUIVALENT_MEAL.diuCostSGD, "traditional meal costs more than DIU allocation");
assert(data.EQUIVALENT_MEAL.traditionalPreparationMinutes > data.EQUIVALENT_MEAL.diuPreparationMinutes, "traditional preparation takes longer");
assert(/available|premium/i.test(data.EQUIVALENT_MEAL.note), "traditional food remains available");
assert(data.validateData().length === 0, "shipped fictional data validates");

console.log("--- Summary ---");
if (failures) { console.log(failures + " FAILURE(S)"); process.exit(1); }
console.log("ALL PASSED");
