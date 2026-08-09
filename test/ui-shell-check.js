/**
 * ui-shell-check.js — exercises shipped index.html + contamination-map labels.
 * Run: node test/ui-shell-check.js
 * Exit 0 on pass.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var scene = fs.readFileSync(path.join(root, "scene.js"), "utf8");
var map = require(path.join(root, "contamination-map.js"));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.log("FAIL: " + msg);
    failed++;
  } else {
    console.log("PASS: " + msg);
  }
}

// Dead rail must be gone
assert(!/id=["']rail["']/.test(html), "no #rail element");
assert(!/class=["'][^"']*rail-btn/.test(html), "no rail-btn chrome");
assert(!/--rail-w/.test(html), "no --rail-w layout token");

// Essential controls + metric DOM ids (scene.js binds these)
["ci-slider", "ci-value", "m-particulate", "m-nutrient", "m-photic", "m-viability",
  "year-value", "year-value-panel", "regime-value", "stage-caption", "status-line"].forEach(function (id) {
  assert(html.indexOf('id="' + id + '"') !== -1, "has #" + id);
});

// Short plain labels — Non-Human Viability replaced
assert(html.indexOf("Non-Human Viability") === -1, "Non-Human Viability removed");
assert(html.indexOf("Life health") !== -1, "Life health label present");
assert(html.indexOf("Particles") !== -1, "Particles label present");
assert(html.indexOf("Nutrients") !== -1, "Nutrients label present");
assert(html.indexOf("Light depth") !== -1, "Light depth label present");
assert(html.indexOf("Contamination") !== -1, "Contamination control label present");

// No long jargon card titles
assert(html.indexOf("Particulate & Metal Load") === -1, "old particulate title gone");
assert(html.indexOf("Photic Depth") === -1, "old photic title gone");
assert(html.indexOf("Operating context") === -1, "old operating context card gone");

// Single minimal panel (not multi-card stack of three)
var cardCount = (html.match(/class="card"/g) || []).length;
assert(cardCount === 0, "legacy .card multi-stack removed (got " + cardCount + ")");
assert(html.indexOf("panel-card") !== -1, "single panel-card present");

// Map display labels short + regimeLabel / caption drive UI
var f0 = map.formatMetrics(map.mapContamination(0));
var f100 = map.formatMetrics(map.mapContamination(100));
assert(f0.regime === "Rising demand", "regime label at 0 = Rising demand");
assert(f100.regime === "Terminal", "regime label at 100 = Terminal");
assert(f0.regime.length < 24, "regime labels stay short");
assert(typeof f0.caption === "string" && f0.caption.length > 20, "caption at 0");
assert(typeof f100.caption === "string" && f100.caption.length > 20, "caption at 100");
assert(f0.caption !== f100.caption, "captions differ clean vs terminal");
assert(html.indexOf("stage-caption") !== -1, "stage caption element in HTML");
assert(/elCaption|stage-caption/.test(scene), "scene binds stage caption");

// Slider at high CI updates all four metrics + year/status (pure map path used by UI)
var m = map.mapContamination(85);
var fmt = map.formatMetrics(m);
assert(m.year >= 2060, "year moves with high CI");
assert(m.status === "TERMINAL", "status TERMINAL at 85");
assert(parseFloat(fmt.viability) < 20, "life health low at 85");
assert(parseFloat(fmt.photicDepth) < 1, "light depth near-zero at 85");
assert(parseFloat(String(fmt.particulateMetal).replace(/,/g, "")) > 1000, "particles high at 85");

// Scene realism hooks present
assert(scene.indexOf("uScum") !== -1, "ocean scum uniform wired");
assert(/matCoverage/.test(scene), "matCoverage applied to scene");
assert(/N = 720/.test(scene) || /ashFallout \* 0\.9/.test(scene) || /ashFallout \* 0\.85/.test(scene),
  "stronger ash response");
// Status display maps NOMINAL → OK
assert(scene.indexOf('statusLabel') !== -1 || scene.indexOf('"OK"') !== -1, "status display OK mapping");

// Premise waste families + place-making (design expansion)
assert(/key:\s*"solar"/.test(scene) || /makeSolarGeo/.test(scene), "solar scrap family");
assert(/key:\s*"foodpack"/.test(scene) || /makeFoodpackGeo/.test(scene), "food packaging family");
assert(/key:\s*"medical"/.test(scene) || /makeMedicalGeo/.test(scene), "medical plastic family");
assert(/key:\s*"casing"/.test(scene), "battery casing family");
assert(/buildStation/.test(scene) && /ssa-station/.test(scene), "monitoring station place-maker");
assert(/TorusGeometry/.test(scene), "exclusion ring geometry");

console.log("--- Summary ---");
if (failed === 0) {
  console.log("ALL PASSED");
  process.exit(0);
} else {
  console.log(failed + " FAILURE(S)");
  process.exit(1);
}
