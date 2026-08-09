/**
 * SEA STATE / CONTAMINATION INDEX — pure mapping functions
 * Shared by the dashboard UI and headless metric checks.
 * Contamination Index c ∈ [0, 100] drives all speculative readouts and visual params.
 *
 * Works in browser (global ContaminationMap) and Node (module.exports).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.ContaminationMap = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /** Ease for metric curves (slightly front-loaded after mid-band). */
  function easeInOut(t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /**
   * Map Contamination Index → metrics, status, year, and visual parameters.
   * All outputs are continuous in c; no discrete jumps.
   * @param {number} c Contamination Index 0–100
   * @returns {object}
   */
  function mapContamination(c) {
    c = clamp(Number(c) || 0, 0, 100);
    var t = c / 100;
    var te = easeInOut(t);

    // --- Metrics (speculative bureaucratic ranges) ---
    // Microplastic Density: 12 → 48,000 particles/m³ (exponential-ish rise)
    var microplastic = lerp(12, 48000, Math.pow(te, 1.35));

    // Light Penetration: 38 m → 0.4 m
    var lightPenetration = lerp(38, 0.4, te);

    // Non-Human Habitability: 94% → 3%
    var habitability = lerp(94, 3, te);

    // Aura of Waste: 0.08 → 9.7
    var aura = lerp(0.08, 9.7, te);

    // Year: 2026 → 2075
    var year = Math.round(lerp(2026, 2075, t));

    // Status bands (label changes at thresholds; values still continuous)
    var status;
    if (c < 20) status = "NOMINAL";
    else if (c < 50) status = "ELEVATED";
    else if (c < 80) status = "CRITICAL";
    else status = "TERMINAL";

    // --- Visual parameters (0–1 style scalars + RGB arrays) ---
    // Water colour: clear blue-green → green-brown → murky → near-black toxic
    var waterColor = waterColorAt(t);
    var skyColor = skyColorAt(t);
    var fogColor = fogColorAt(t);

    // Fog density grows smoothly (capped so horizon still reads at terminal)
    var fogDensity = lerp(0.012, 0.062, Math.pow(te, 0.9));

    // Debris density factor 0–1 (drives instance count/opacity)
    var debrisDensity = smoothstep(0, 0.15, t) * lerp(0.05, 1, te);

    // Surface murk / oil slick intensity (high contamination)
    var oilSlick = smoothstep(0.75, 1.0, t);

    // Haze / atmospheric opacity
    var haze = smoothstep(0.15, 0.95, t);

    // Light penetration feel for shader (1 = clear, 0 = black)
    var waterClarity = 1 - te;

    // Ash / microplastic particle intensity
    var particleIntensity = smoothstep(0.45, 1.0, t);

    return {
      c: c,
      t: t,
      microplastic: microplastic,
      lightPenetration: lightPenetration,
      habitability: habitability,
      aura: aura,
      year: year,
      status: status,
      waterColor: waterColor,
      skyColor: skyColor,
      fogColor: fogColor,
      fogDensity: fogDensity,
      debrisDensity: debrisDensity,
      oilSlick: oilSlick,
      haze: haze,
      waterClarity: waterClarity,
      particleIntensity: particleIntensity,
    };
  }

  function waterColorAt(t) {
    // Key stops: clean teal-blue → green → brown-green → near-black toxic
    // Terminal kept slightly lifted so surface/oil remain readable
    var stops = [
      { t: 0.0, c: [0.05, 0.28, 0.38] },
      { t: 0.2, c: [0.08, 0.32, 0.3] },
      { t: 0.5, c: [0.18, 0.28, 0.12] },
      { t: 0.8, c: [0.14, 0.15, 0.09] },
      { t: 1.0, c: [0.07, 0.08, 0.05] },
    ];
    return sampleStops(stops, t);
  }

  function skyColorAt(t) {
    var stops = [
      { t: 0.0, c: [0.55, 0.68, 0.78] },
      { t: 0.2, c: [0.58, 0.65, 0.7] },
      { t: 0.5, c: [0.55, 0.52, 0.38] },
      { t: 0.8, c: [0.32, 0.28, 0.24] },
      { t: 1.0, c: [0.14, 0.12, 0.1] },
    ];
    return sampleStops(stops, t);
  }

  function fogColorAt(t) {
    var stops = [
      { t: 0.0, c: [0.45, 0.58, 0.65] },
      { t: 0.5, c: [0.4, 0.38, 0.28] },
      { t: 0.8, c: [0.25, 0.22, 0.18] },
      { t: 1.0, c: [0.12, 0.1, 0.08] },
    ];
    return sampleStops(stops, t);
  }

  function sampleStops(stops, t) {
    t = clamp(t, 0, 1);
    for (var i = 0; i < stops.length - 1; i++) {
      var a = stops[i];
      var b = stops[i + 1];
      if (t >= a.t && t <= b.t) {
        var u = (t - a.t) / (b.t - a.t || 1);
        return [
          lerp(a.c[0], b.c[0], u),
          lerp(a.c[1], b.c[1], u),
          lerp(a.c[2], b.c[2], u),
        ];
      }
    }
    return stops[stops.length - 1].c.slice();
  }

  /** Format metrics for display with appropriate precision. */
  function formatMetrics(m) {
    return {
      microplastic:
        m.microplastic < 100
          ? m.microplastic.toFixed(1)
          : Math.round(m.microplastic).toLocaleString("en-US"),
      lightPenetration: m.lightPenetration.toFixed(1),
      habitability: m.habitability.toFixed(1),
      aura: m.aura.toFixed(2),
      year: String(m.year),
      status: m.status,
    };
  }

  return {
    mapContamination: mapContamination,
    formatMetrics: formatMetrics,
    clamp: clamp,
    lerp: lerp,
    smoothstep: smoothstep,
    waterColorAt: waterColorAt,
    skyColorAt: skyColorAt,
    fogColorAt: fogColorAt,
  };
});
