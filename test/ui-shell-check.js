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

console.log("--- Required interface language ---");
[
  "DIU-7", "CIVIC DAILY INTAKE UNIT", "CIVIC NUTRITION NETWORK",
  "STANDARD ADULT", "ALLOCATION CLASS", "2074", "2,140 kcal", "2.8 L",
  "Cleared for distribution", "Direct potable network", "Controlled agriculture share",
  "TRADITIONAL DAILY EQUIVALENT", "S$186.40", "S$11.20"
].forEach(function (text) {
  assert(html.toLowerCase().indexOf(text.toLowerCase()) !== -1, "page contains " + text);
});

console.log("--- Controls and state surfaces ---");
[
  "viewport", "world-panel", "product-panel", "selected-component", "component-name",
  "exploded-toggle", "meal-toggle", "equivalent-panel", "opening-card", "opening-dismiss"
].forEach(function (id) {
  assert(html.indexOf('id="' + id + '"') !== -1, "has #" + id);
});
assert(/Exploded view/i.test(html), "exploded-view control label exists");
assert(/View equivalent meal/i.test(html), "equivalent-meal control label exists");
assert(/Inspect unit/i.test(html), "opening action is concise");
assert(/Daily allocation ready/i.test(html), "opening allocation status exists");

console.log("--- Removed concept ---");
assert(!/SEA STATE/i.test(html), "obsolete project name absent from page");
assert(!/Contamination Index/i.test(html), "obsolete index absent from page");
assert(!/ocean shader|waste dumping|ash fallout|invasive biomass/i.test(scene), "obsolete simulation language absent from scene");
assert(!/ci-slider|m-particulate|m-photic/i.test(html), "obsolete controls and readouts absent");

console.log("--- Static hosting and modes ---");
assert(/type="importmap"/.test(html), "Three.js import map preserved");
assert(/type="module" src="scene\.js"/.test(html), "static ES module entry preserved");
assert(/hero/.test(scene) && /query\.get\("hero"\) === "1"/.test(scene), "hero query parameter recognized");
assert(/demo/.test(scene) && /query\.get\("demo"\) === "1"/.test(scene), "demo query parameter recognized");
assert(/setAnimationLoop/.test(scene), "render loop exists");
assert(/OrbitControls/.test(scene) && /enableDamping = true/.test(scene), "damped orbit controls configured");
assert(/minDistance/.test(scene) && /maxDistance/.test(scene), "zoom limits configured");
assert(/ACESFilmicToneMapping/.test(scene), "ACES filmic tone mapping configured");

console.log("--- Responsive shell ---");
assert(/@media \(max-width: 780px\)/.test(html), "narrow layout breakpoint exists");
assert(/\.side-panel \{ display: none; \}/.test(html), "side panels collapse on narrow screens");
assert(/touch-action: none/.test(html), "touch rotation remains enabled");
assert(/overflow: hidden/.test(html), "page prevents horizontal scrolling");

console.log("--- Summary ---");
if (failures) { console.log(failures + " FAILURE(S)"); process.exit(1); }
console.log("ALL PASSED");
