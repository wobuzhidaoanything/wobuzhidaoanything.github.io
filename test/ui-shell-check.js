/** Run: node test/ui-shell-check.js */
"use strict";

var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var scene = fs.readFileSync(path.join(root, "scene.js"), "utf8");
var failures = 0;
function assert(condition, message) {
  if (condition) console.log("PASS: " + message);
  else { console.log("FAIL: " + message); failures++; }
}

console.log("--- Streamlined interface language ---");
[
  "DAILY FOOD &amp; WATER SERVICE", "SINGAPORE | 2074", "About the item",
  "Daily Intake Unit (Food and Water)", "One day of sealed handheld supply", "Nutrients and energy vary",
  "Food + drinking water", "One adult / 24 h", "Buy pack",
  "BASIC PACK", "PERFORMANCE", "NUTRITION", "PREMIUM", "Daily calories",
  "Drinking water", "Public price", "See what’s inside", "Compare with regular food"
].forEach(function (text) {
  assert(html.toLowerCase().indexOf(text.toLowerCase()) !== -1, "page contains " + text);
});
assert((html.match(/class="readout"/g) || []).length === 2, "left panel has only contents and serving facts");
assert((html.match(/class="product-fact"/g) || []).length === 4, "product overview has only four key facts");
assert((html.match(/class="pack-button/g) || []).length === 4, "four pack buttons exist");
assert(!/context-toggle|context-closed|Hide item info|Show item info/.test(html + scene), "item information cannot be hidden");
assert(/pack-switch[\s\S]*id="buy-button"/.test(html), "buy button stays directly below the pack chooser");
assert(!/\.component-tag::before/.test(html), "exploded-view label pointing lines are removed");

console.log("--- Equivalent food measurements ---");
["550 g", "240 g", "180 g", "234 g", "2.8 L", "1.20 kg"].forEach(function (text) {
  assert(html.indexOf(text) !== -1, "comparison contains " + text);
});
assert(!/Organic serves|serve-note|270 g food/i.test(html), "serves information and food suffix are removed");
assert((html.match(/<th>/g) || []).length === 2, "comparison table has only two columns");
assert(/getEquivalentMeal/.test(scene) && /equivalentFoodWeight/.test(scene), "comparison amounts update with pack selection");

console.log("--- Removed clutter and jargon ---");
[
  /SUPPLY:\s*NOMINAL/i, /HYDRATION PHASE/i, /MACRONUTRIENT MATRIX/i,
  /ALLOCATION CLASS/i, /PRODUCTION FACILITY/i, /SPECIMEN/i, /CIVIC OBJECT REGISTRY/i,
  /CIVIC DAILY INTAKE/i,
  /DIRECT POTABLE NETWORK/i, /CONTAMINATION INDEX/i
].forEach(function (pattern) { assert(!pattern.test(html), pattern + " is absent"); });
assert(!/measurement-scale/.test(html), "measurement scale removed");
assert(/font-size:\s*15px/.test(html), "base interface type is enlarged to 15 px");

console.log("--- Controls, modes and hosting ---");
["viewport", "world-panel", "product-panel", "product-overview", "selected-component", "exploded-toggle", "meal-toggle", "equivalent-panel", "opening-card", "mobile-pack-select"].forEach(function (id) {
  assert(html.indexOf('id="' + id + '"') !== -1, "has #" + id);
});
assert(/aria-pressed="false"[^>]*><span id="exploded-label">See what’s inside/.test(html), "unit starts closed");
assert(/type="importmap"/.test(html), "Three.js import map preserved");
assert(/type="module" src="scene\.js\?v=/.test(html), "versioned static ES module entry preserved");
assert(/world-data\.js\?v=/.test(html), "world data asset is versioned");
assert(/__CIVIC_BOOT_WATCH/.test(html) && /__CIVIC_BOOTED/.test(scene), "cached boot names remain compatible");
assert(/bootBanner\.style\.display = "none"/.test(scene), "successful boot clears a stale error overlay");
assert(/query\.get\("hero"\) === "1"/.test(scene), "hero query parameter recognized");
assert(/query\.get\("demo"\) === "1"/.test(scene), "demo query parameter recognized");
assert(/selectPack/.test(scene) && /Data\.getPack/.test(scene), "pack selection is wired");

console.log("--- Responsive shell ---");
assert(/@media \(max-width: 780px\)/.test(html), "narrow layout breakpoint exists");
assert(/#world-panel \{[\s\S]*?display: grid;/.test(html), "item information remains visible on narrow screens");
assert(/#product-panel \{ display: none; \}/.test(html), "only the product panel collapses on narrow screens");
assert(!/\.side-panel \{ display: none; \}/.test(html), "shared side-panel rule never hides item information");
assert(/touch-action: none/.test(html), "touch rotation remains enabled");
assert(/overflow: hidden/.test(html), "page prevents horizontal scrolling");

console.log("--- Summary ---");
if (failures) { console.log(failures + " FAILURE(S)"); process.exit(1); }
console.log("ALL PASSED");
