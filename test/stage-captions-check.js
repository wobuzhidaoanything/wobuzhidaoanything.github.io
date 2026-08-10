/**
 * stage-captions-check.js — drives shipped ContaminationMap stage API.
 * Run: node test/stage-captions-check.js
 */
"use strict";

var path = require("path");
var map = require(path.join(__dirname, "..", "contamination-map.js"));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.log("FAIL: " + msg);
    failed++;
  } else {
    console.log("PASS: " + msg);
  }
}

console.log("--- REGIMES captions ---");
assert(Array.isArray(map.REGIMES) && map.REGIMES.length === 6, "6 regime bands");
map.REGIMES.forEach(function (r) {
  assert(typeof r.caption === "string" && r.caption.length > 20, r.id + " has caption");
  assert(r.caption.length < 220, r.id + " caption stays short");
  assert(typeof r.label === "string" && r.label.length > 2, r.id + " has label");
});

// Sample CI points spanning each band (plan verification samples)
var samples = [
  { c: 0, id: "EARLY_DEMAND" },
  { c: 20, id: "COAL_RETURN" },
  { c: 45, id: "FOOD_BATTERY" },
  { c: 65, id: "CHEM_INVASIVE" },
  { c: 85, id: "SYSTEMIC" },
  { c: 100, id: "TERMINAL" },
];

console.log("--- Band samples ---");
var seenCaptions = {};
var seenLabels = {};
samples.forEach(function (s) {
  var m = map.mapContamination(s.c);
  var fmt = map.formatMetrics(m);
  assert(m.regime === s.id, "c=" + s.c + " regime id = " + s.id + " (got " + m.regime + ")");
  assert(typeof m.regimeCaption === "string" && m.regimeCaption.length > 20,
    "c=" + s.c + " regimeCaption present");
  assert(fmt.caption === m.regimeCaption, "c=" + s.c + " formatMetrics.caption matches map");
  assert(fmt.regime === m.regimeLabel, "c=" + s.c + " formatMetrics.regime matches label");
  seenCaptions[m.regimeCaption] = true;
  seenLabels[m.regimeLabel] = true;
  console.log("  c=" + s.c + " | " + m.regimeLabel + " | " + m.regimeCaption.slice(0, 60) + "…");
});

assert(Object.keys(seenCaptions).length === 6, "six distinct captions across samples");
assert(Object.keys(seenLabels).length === 6, "six distinct stage labels across samples");

// Boundary continuity of caption with regimeAt
assert(map.regimeAt(15).id === "EARLY_DEMAND", "inclusive max 15 EARLY");
assert(map.regimeAt(15.1).id === "COAL_RETURN", "just over 15 COAL");
assert(map.mapContamination(15).regimeCaption === map.regimeAt(15).caption,
  "mapContamination caption = regimeAt caption");

// Premise keywords appear somewhere in the stage set (institutional language)
var allCap = map.REGIMES.map(function (r) { return r.caption; }).join(" ").toLowerCase();
assert(/energy|ai/.test(allCap), "captions mention AI/energy demand");
assert(/coal|fossil|ash/.test(allCap), "captions mention coal/fossil/ash");
assert(/battery|food|packaging/.test(allCap), "captions mention food/battery");
assert(/sink|terminal|non-recovery|waste/.test(allCap), "captions mention terminal sink");

// Instrument log strip content from shipped map
console.log("--- Instrument log ---");
samples.forEach(function (s) {
  var m = map.mapContamination(s.c);
  assert(typeof m.instrumentLog === "string" && m.instrumentLog.indexOf("SSA-MON") === 0,
    "c=" + s.c + " instrumentLog starts with SSA-MON");
  assert(m.instrumentLog.indexOf(m.regimeLabel) !== -1,
    "c=" + s.c + " instrumentLog includes regime label");
  var fmt = map.formatMetrics(m);
  assert(fmt.instrumentLog === m.instrumentLog, "c=" + s.c + " formatMetrics.instrumentLog matches");
});
assert(map.REGIMES.every(function (r) {
  return typeof r.logTag === "string" && r.logTag.length > 3;
}), "each regime has logTag");

console.log("--- Summary ---");
if (failed === 0) {
  console.log("ALL PASSED");
  process.exit(0);
} else {
  console.log(failed + " FAILURE(S)");
  process.exit(1);
}
