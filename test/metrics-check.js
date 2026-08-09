/**
 * metrics-check.js — exercises the SHIPPED contamination-map.js
 * Run: node test/metrics-check.js
 * Exit 0 on pass; prints FAIL lines and exit 1 on failure.
 */
"use strict";

var path = require("path");
var mapMod = require(path.join(__dirname, "..", "contamination-map.js"));
var mapContamination = mapMod.mapContamination;
var formatMetrics = mapMod.formatMetrics;

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.log("FAIL: " + msg);
    failed++;
  } else {
    console.log("PASS: " + msg);
  }
}

function approx(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, msg + " (got " + a + ", expected ~" + b + " ±" + tol + ")");
}

// Endpoint ranges (from project brief / mapContamination implementation)
var m0 = mapContamination(0);
var m20 = mapContamination(20);
var m50 = mapContamination(50);
var m80 = mapContamination(80);
var m100 = mapContamination(100);

console.log("--- Endpoints ---");
console.log("c=0  ", JSON.stringify({
  micro: m0.microplastic, light: m0.lightPenetration,
  habit: m0.habitability, aura: m0.aura, year: m0.year, status: m0.status
}));
console.log("c=100", JSON.stringify({
  micro: m100.microplastic, light: m100.lightPenetration,
  habit: m100.habitability, aura: m100.aura, year: m100.year, status: m100.status
}));

// Endpoint ranges
approx(m0.microplastic, 12, 0.01, "microplastic at 0 ≈ 12");
approx(m100.microplastic, 48000, 1, "microplastic at 100 ≈ 48000");
approx(m0.lightPenetration, 38, 0.01, "light at 0 ≈ 38");
approx(m100.lightPenetration, 0.4, 0.01, "light at 100 ≈ 0.4");
approx(m0.habitability, 94, 0.01, "habitability at 0 ≈ 94");
approx(m100.habitability, 3, 0.01, "habitability at 100 ≈ 3");
approx(m0.aura, 0.08, 0.001, "aura at 0 ≈ 0.08");
approx(m100.aura, 9.7, 0.01, "aura at 100 ≈ 9.7");
assert(m0.year === 2026, "year at 0 is 2026");
assert(m100.year === 2075, "year at 100 is 2075");

// Status bands
assert(m0.status === "NOMINAL", "status at 0 = NOMINAL");
assert(m20.status === "ELEVATED", "status at 20 = ELEVATED");
assert(m50.status === "CRITICAL", "status at 50 = CRITICAL");
assert(m80.status === "TERMINAL", "status at 80 = TERMINAL");
assert(m100.status === "TERMINAL", "status at 100 = TERMINAL");
assert(mapContamination(19.9).status === "NOMINAL", "status at 19.9 = NOMINAL");
assert(mapContamination(49.9).status === "ELEVATED", "status at 49.9 = ELEVATED");
assert(mapContamination(79.9).status === "CRITICAL", "status at 79.9 = CRITICAL");

// Monotonicity: sample dense path
console.log("--- Monotonicity ---");
var prev = mapContamination(0);
var monoOk = true;
for (var c = 1; c <= 100; c++) {
  var cur = mapContamination(c);
  if (!(cur.microplastic >= prev.microplastic - 1e-9)) {
    console.log("FAIL: microplastic not non-decreasing at c=" + c);
    monoOk = false;
    failed++;
    break;
  }
  if (!(cur.lightPenetration <= prev.lightPenetration + 1e-9)) {
    console.log("FAIL: lightPenetration not non-increasing at c=" + c);
    monoOk = false;
    failed++;
    break;
  }
  if (!(cur.habitability <= prev.habitability + 1e-9)) {
    console.log("FAIL: habitability not non-increasing at c=" + c);
    monoOk = false;
    failed++;
    break;
  }
  if (!(cur.aura >= prev.aura - 1e-9)) {
    console.log("FAIL: aura not non-decreasing at c=" + c);
    monoOk = false;
    failed++;
    break;
  }
  if (!(cur.year >= prev.year)) {
    console.log("FAIL: year not non-decreasing at c=" + c);
    monoOk = false;
    failed++;
    break;
  }
  if (!(cur.debrisDensity >= prev.debrisDensity - 1e-9)) {
    console.log("FAIL: debrisDensity not non-decreasing at c=" + c);
    monoOk = false;
    failed++;
    break;
  }
  if (!(cur.fogDensity >= prev.fogDensity - 1e-9)) {
    console.log("FAIL: fogDensity not non-decreasing at c=" + c);
    monoOk = false;
    failed++;
    break;
  }
  if (!(cur.waterClarity <= prev.waterClarity + 1e-9)) {
    console.log("FAIL: waterClarity not non-increasing at c=" + c);
    monoOk = false;
    failed++;
    break;
  }
  prev = cur;
}
if (monoOk) console.log("PASS: metrics/visual params monotonic 0→100");

// Year span
assert(m50.year >= 2026 && m50.year <= 2075, "year at 50 in [2026,2075]");
assert(m50.year === Math.round(2026 + 49 * (2075 - 2026) / 100) ||
       Math.abs(m50.year - (2026 + 50 * 0.49)) < 2,
       "year advances with index (mid)");

// Continuity: small step changes should be small (no huge jumps mid-band)
console.log("--- Continuity ---");
var contOk = true;
for (var c2 = 0; c2 < 100; c2 += 0.5) {
  var a = mapContamination(c2);
  var b = mapContamination(c2 + 0.5);
  var dMicro = Math.abs(b.microplastic - a.microplastic);
  var dLight = Math.abs(b.lightPenetration - a.lightPenetration);
  // Max step over 0.5 index should be far below full range / 10
  if (dMicro > 5000) {
    console.log("FAIL: microplastic jump too large at " + c2 + " Δ=" + dMicro);
    contOk = false;
    failed++;
    break;
  }
  if (dLight > 2) {
    console.log("FAIL: light jump too large at " + c2 + " Δ=" + dLight);
    contOk = false;
    failed++;
    break;
  }
  // Colours change continuously
  var dCol =
    Math.abs(b.waterColor[0] - a.waterColor[0]) +
    Math.abs(b.waterColor[1] - a.waterColor[1]) +
    Math.abs(b.waterColor[2] - a.waterColor[2]);
  if (dCol > 0.15) {
    console.log("FAIL: water colour jump at " + c2 + " Δ=" + dCol);
    contOk = false;
    failed++;
    break;
  }
}
if (contOk) console.log("PASS: continuous small-step transitions");

// formatMetrics uses real map output
var fmt0 = formatMetrics(m0);
var fmt100 = formatMetrics(m100);
assert(typeof fmt0.microplastic === "string", "format microplastic string at 0");
assert(typeof fmt100.microplastic === "string", "format microplastic string at 100");
assert(fmt0.status === "NOMINAL", "format status nominal");
assert(fmt100.status === "TERMINAL", "format status terminal");

// Clamp out of range
assert(mapContamination(-5).c === 0, "clamps negative to 0");
assert(mapContamination(150).c === 100, "clamps >100 to 100");

// Visual directionality
assert(m100.debrisDensity > m0.debrisDensity, "debris denser at 100");
assert(m100.oilSlick > m50.oilSlick, "oil slick rises at high end");
assert(m100.haze > m0.haze, "haze higher at 100");
assert(m0.waterClarity > m100.waterClarity, "clarity lower at 100");

console.log("--- Summary ---");
if (failed === 0) {
  console.log("ALL PASSED");
  process.exit(0);
} else {
  console.log(failed + " FAILURE(S)");
  process.exit(1);
}
