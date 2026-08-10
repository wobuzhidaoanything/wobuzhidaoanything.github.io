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

// Sample points across the index
var m0 = mapContamination(0);
var m20 = mapContamination(20);
var m50 = mapContamination(50);
var m80 = mapContamination(80);
var m100 = mapContamination(100);

console.log("--- Endpoints ---");
console.log("c=0  ", JSON.stringify({
  part: m0.particulateMetal, nutr: m0.nutrientResidue,
  phot: m0.photicDepth, viab: m0.viability, year: m0.year, status: m0.status
}));
console.log("c=100", JSON.stringify({
  part: m100.particulateMetal, nutr: m100.nutrientResidue,
  phot: m100.photicDepth, viab: m100.viability, year: m100.year, status: m100.status
}));

// Endpoint ranges
approx(m0.particulateMetal, 28, 0.01, "particulateMetal at 0 ≈ 28");
approx(m100.particulateMetal, 15800, 1, "particulateMetal at 100 ≈ 15800");
approx(m0.nutrientResidue, 0.4, 0.001, "nutrientResidue at 0 ≈ 0.4");
approx(m100.nutrientResidue, 88, 0.01, "nutrientResidue at 100 ≈ 88");
approx(m0.photicDepth, 42, 0.01, "photicDepth at 0 ≈ 42");
approx(m100.photicDepth, 0.15, 0.01, "photicDepth at 100 ≈ 0.15");
approx(m0.viability, 96, 0.01, "viability at 0 ≈ 96");
approx(m100.viability, 1.5, 0.01, "viability at 100 ≈ 1.5");
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

// Regime bands (premise stages)
console.log("--- Regimes ---");
assert(mapContamination(0).regime === "EARLY_DEMAND", "regime at 0 = EARLY_DEMAND");
assert(mapContamination(14.9).regime === "EARLY_DEMAND", "regime at 14.9 = EARLY_DEMAND");
assert(mapContamination(15).regime === "EARLY_DEMAND", "regime at 15 = EARLY_DEMAND (inclusive)");
assert(mapContamination(15.1).regime === "COAL_RETURN", "regime at 15.1 = COAL_RETURN");
assert(mapContamination(35).regime === "COAL_RETURN", "regime at 35 = COAL_RETURN (inclusive)");
assert(mapContamination(45).regime === "FOOD_BATTERY", "regime at 45 = FOOD_BATTERY");
assert(mapContamination(65).regime === "CHEM_INVASIVE", "regime at 65 = CHEM_INVASIVE");
assert(mapContamination(82).regime === "SYSTEMIC", "regime at 82 = SYSTEMIC");
assert(mapContamination(90).regime === "SYSTEMIC", "regime at 90 = SYSTEMIC (inclusive)");
assert(mapContamination(90.1).regime === "TERMINAL", "regime at 90.1 = TERMINAL");
assert(mapContamination(100).regime === "TERMINAL", "regime at 100 = TERMINAL");
assert(typeof mapContamination(50).regimeLabel === "string" &&
       mapContamination(50).regimeLabel.length > 3, "regimeLabel present");

// Metric shape expectations from the brief
console.log("--- Curve shapes ---");
var m40 = mapContamination(40);
var m60 = mapContamination(60);
var m90 = mapContamination(90);
// Particulate accelerates mid-to-high: second-half gain exceeds first-half gain
assert(
  (m100.particulateMetal - m50.particulateMetal) > (m50.particulateMetal - m0.particulateMetal),
  "particulateMetal accelerates in upper half"
);
// Viability collapses non-linearly: still fairly high mid, near floor by 90
assert(m50.viability > 60, "viability still > 60% at 50 (got " + m50.viability + ")");
assert(m90.viability < 15, "viability < 15% at 90 (got " + m90.viability + ")");
// Photic depth near-zero by terminal
assert(m90.photicDepth < 1.0, "photicDepth < 1 m at 90 (got " + m90.photicDepth + ")");

// Monotonicity: sample dense path
console.log("--- Monotonicity ---");
var prev = mapContamination(0);
var monoOk = true;
for (var c = 1; c <= 100; c++) {
  var cur = mapContamination(c);
  var checks = [
    [cur.particulateMetal >= prev.particulateMetal - 1e-9, "particulateMetal not non-decreasing"],
    [cur.nutrientResidue >= prev.nutrientResidue - 1e-9, "nutrientResidue not non-decreasing"],
    [cur.photicDepth <= prev.photicDepth + 1e-9, "photicDepth not non-increasing"],
    [cur.viability <= prev.viability + 1e-9, "viability not non-increasing"],
    [cur.year >= prev.year, "year not non-decreasing"],
    [cur.debrisDensity >= prev.debrisDensity - 1e-9, "debrisDensity not non-decreasing"],
    [cur.fogDensity >= prev.fogDensity - 1e-9, "fogDensity not non-decreasing"],
    [cur.waterClarity <= prev.waterClarity + 1e-9, "waterClarity not non-increasing"],
    [cur.oilSheen >= prev.oilSheen - 1e-9, "oilSheen not non-decreasing"],
    [cur.ashFallout >= prev.ashFallout - 1e-9, "ashFallout not non-decreasing"],
    [cur.invasiveBiomass >= prev.invasiveBiomass - 1e-9, "invasiveBiomass not non-decreasing"],
    [cur.matCoverage >= prev.matCoverage - 1e-9, "matCoverage not non-decreasing"],
  ];
  for (var k = 0; k < checks.length; k++) {
    if (!checks[k][0]) {
      console.log("FAIL: " + checks[k][1] + " at c=" + c);
      monoOk = false;
      failed++;
      break;
    }
  }
  if (!monoOk) break;
  prev = cur;
}
if (monoOk) console.log("PASS: metrics/visual params monotonic 0→100");

// Year span
assert(m50.year >= 2026 && m50.year <= 2075, "year at 50 in [2026,2075]");

// Continuity: small step changes should be small (no huge jumps mid-band)
console.log("--- Continuity ---");
var contOk = true;
for (var c2 = 0; c2 < 100; c2 += 0.5) {
  var a = mapContamination(c2);
  var b = mapContamination(c2 + 0.5);
  var dPart = Math.abs(b.particulateMetal - a.particulateMetal);
  var dPhot = Math.abs(b.photicDepth - a.photicDepth);
  var dViab = Math.abs(b.viability - a.viability);
  if (dPart > 1600) {
    console.log("FAIL: particulateMetal jump too large at " + c2 + " Δ=" + dPart);
    contOk = false; failed++; break;
  }
  if (dPhot > 2) {
    console.log("FAIL: photicDepth jump too large at " + c2 + " Δ=" + dPhot);
    contOk = false; failed++; break;
  }
  if (dViab > 4) {
    console.log("FAIL: viability jump too large at " + c2 + " Δ=" + dViab);
    contOk = false; failed++; break;
  }
  var dCol =
    Math.abs(b.waterColor[0] - a.waterColor[0]) +
    Math.abs(b.waterColor[1] - a.waterColor[1]) +
    Math.abs(b.waterColor[2] - a.waterColor[2]);
  if (dCol > 0.15) {
    console.log("FAIL: water colour jump at " + c2 + " Δ=" + dCol);
    contOk = false; failed++; break;
  }
}
if (contOk) console.log("PASS: continuous small-step transitions");

// formatMetrics uses real map output
var fmt0 = formatMetrics(m0);
var fmt100 = formatMetrics(m100);
assert(typeof fmt0.particulateMetal === "string", "format particulateMetal string at 0");
assert(typeof fmt100.particulateMetal === "string", "format particulateMetal string at 100");
assert(typeof fmt0.nutrientResidue === "string", "format nutrientResidue string");
assert(typeof fmt0.photicDepth === "string", "format photicDepth string");
assert(typeof fmt0.viability === "string", "format viability string");
assert(fmt0.status === "NOMINAL", "format status nominal");
assert(fmt100.status === "TERMINAL", "format status terminal");
assert(fmt0.regime === "Rising demand", "format regime label at 0");
assert(fmt100.regime === "Terminal", "format regime label at 100");
assert(typeof fmt0.caption === "string" && fmt0.caption.length > 20, "format caption at 0");
assert(typeof fmt100.caption === "string" && fmt100.caption.indexOf("sink") !== -1,
  "format caption at 100 mentions sink");

// Clamp out of range
assert(mapContamination(-5).c === 0, "clamps negative to 0");
assert(mapContamination(150).c === 100, "clamps >100 to 100");

// Visual directionality
assert(m100.debrisDensity > m0.debrisDensity, "debris denser at 100");
assert(m100.oilSheen > m50.oilSheen, "oil sheen rises at high end");
assert(m50.oilSheen === 0, "no oil sheen yet at 50");
assert(m100.invasiveBiomass > m40.invasiveBiomass, "invasives rise at high end");
assert(m40.invasiveBiomass === 0, "no invasives yet at 40");
assert(m100.matCoverage > m50.matCoverage, "algal mats spread at high end");
assert(m100.ashFallout > m0.ashFallout, "ash fallout higher at 100");
assert(m0.waterClarity > m100.waterClarity, "clarity lower at 100");
assert(m100.waveAmp < m0.waveAmp, "wave energy choked at terminal");

// Chapter-readable visual scalars (Balanced MVP B1–B4)
console.log("--- Visual chapters ---");
var m5 = mapContamination(5);
var m25 = mapContamination(25);
var m45 = mapContamination(45);
var m65 = mapContamination(65);
var m82 = mapContamination(82);
var m95 = mapContamination(95);
// Early clearer / low ash; coal ash readable; late dark water, low sun, high mats, dead swell
assert(m5.waterClarity > 0.75, "early waterClarity high (got " + m5.waterClarity + ")");
assert(m5.ashFallout < 0.15, "early ash low (got " + m5.ashFallout + ")");
assert(m25.ashFallout > m5.ashFallout, "coal band ash rises vs early");
assert(m25.ashFallout > 0.2, "coal band ash readable (got " + m25.ashFallout + ")");
assert(m95.waveAmp < 0.35, "terminal waveAmp low (got " + m95.waveAmp + ")");
assert(m95.waveAmp < m45.waveAmp, "waveAmp lower terminal than mid");
assert(m95.sunIntensity < 0.35, "terminal sun dim (got " + m95.sunIntensity + ")");
assert(m95.sunIntensity < m5.sunIntensity, "sun dims over CI");
assert(m95.matCoverage > 0.7, "terminal mats high (got " + m95.matCoverage + ")");
assert(m95.matCoverage > m45.matCoverage, "mats rise late");
assert(m95.waterColor[0] + m95.waterColor[1] + m95.waterColor[2] <
  m5.waterColor[0] + m5.waterColor[1] + m5.waterColor[2],
  "terminal water darker (lower RGB sum) than early");
assert(m82.fogDensity > m5.fogDensity, "fog denser late");
assert(m65.oilSheen > 0, "heavy band oil sheen present");
// waterClarity couples to photic collapse
assert(m95.waterClarity < m5.waterClarity * 0.2, "clarity collapses with photic/terminal");
assert(typeof m5.instrumentLog === "string" && m5.instrumentLog.indexOf("SSA-MON") === 0,
  "instrumentLog on map output");

console.log("--- Summary ---");
if (failed === 0) {
  console.log("ALL PASSED");
  process.exit(0);
} else {
  console.log(failed + " FAILURE(S)");
  process.exit(1);
}
