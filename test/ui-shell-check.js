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
  "DAILY FOOD &amp; WATER SERVICE", "SINGAPORE | 2074", "Singapore Sector 04 | 2074",
  "Service indicators", "Controlled food supply", "Outdoor agriculture",
  "Potable water treatment", "DIU-7 daily use", "Civic food and water provisioning",
  "BASIC PACK", "PERFORMANCE", "NUTRITION", "PREMIUM", "Daily calories",
  "Drinking water", "Public price", "See what’s inside", "Compare with regular food"
].forEach(function (text) {
  assert(html.toLowerCase().indexOf(text.toLowerCase()) !== -1, "page contains " + text);
});
assert((html.match(/class="readout"/g) || []).length === 4, "left panel has only four world facts");
assert((html.match(/class="product-fact"/g) || []).length === 4, "product overview has only four key facts");
assert((html.match(/class="pack-button/g) || []).length === 4, "four pack buttons exist");

console.log("--- Equivalent food measurements ---");
["600 g", "270 g food", "200 g", "260 g", "2.8 L", "Organic serves", "1.33 kg", "13"].forEach(function (text) {
  assert(html.indexOf(text) !== -1, "comparison contains " + text);
});
assert(/non-manufactured food/i.test(html), "organic serve is defined");

console.log("--- Removed clutter and jargon ---");
[
  /SUPPLY:\s*NOMINAL/i, /HYDRATION PHASE/i, /MACRONUTRIENT MATRIX/i,
  /ALLOCATION CLASS/i, /PRODUCTION FACILITY/i, /SPECIMEN/i, /CIVIC OBJECT REGISTRY/i,
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
assert(/type="module" src="scene\.js"/.test(html), "static ES module entry preserved");
assert(/query\.get\("hero"\) === "1"/.test(scene), "hero query parameter recognized");
assert(/query\.get\("demo"\) === "1"/.test(scene), "demo query parameter recognized");
assert(/selectPack/.test(scene) && /Data\.getPack/.test(scene), "pack selection is wired");

console.log("--- Responsive shell ---");
assert(/@media \(max-width: 780px\)/.test(html), "narrow layout breakpoint exists");
assert(/\.side-panel \{ display: none; \}/.test(html), "side panels collapse on narrow screens");
assert(/touch-action: none/.test(html), "touch rotation remains enabled");
assert(/overflow: hidden/.test(html), "page prevents horizontal scrolling");

console.log("--- Summary ---");
if (failures) { console.log(failures + " FAILURE(S)"); process.exit(1); }
console.log("ALL PASSED");
