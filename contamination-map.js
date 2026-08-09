/**
 * SEA STATE / CONTAMINATION INDEX — pure mapping functions
 * Shared by the dashboard UI and headless metric checks.
 * Contamination Index c ∈ [0, 100] drives all speculative readouts and visual params.
 *
 * World premise (2040–2075): AI data-centre energy demand forced the return of
 * coal and kerosene at industrial scale; nearly all food is ultra-processed and
 * chemically formulated; battery production (grid storage, vehicles, AI
 * infrastructure) exploded. These three systems — energy, food processing,
 * batteries — drive the contamination load reported here.
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
   * Operational regime bands (narrative stages of the premise).
   * Returned as { id, label } — label is display-ready institutional text.
   */
  var REGIMES = [
    { max: 15, id: "EARLY_DEMAND", label: "EARLY AI ENERGY DEMAND" },
    { max: 35, id: "COAL_RETURN", label: "COAL & KEROSENE RETURN" },
    { max: 55, id: "FOOD_BATTERY", label: "FOOD-PROCESSING + BATTERY SCALING" },
    { max: 75, id: "CHEM_INVASIVE", label: "HEAVY CHEMICAL-METAL LOADING / EARLY INVASIVES" },
    { max: 90, id: "SYSTEMIC", label: "SYSTEMIC DEGRADATION" },
    { max: 100, id: "TERMINAL", label: "TERMINAL" },
  ];

  function regimeAt(c) {
    for (var i = 0; i < REGIMES.length; i++) {
      if (c <= REGIMES[i].max) return REGIMES[i];
    }
    return REGIMES[REGIMES.length - 1];
  }

  /**
   * Map Contamination Index → metrics, status, year, regime, visual parameters.
   * All outputs are continuous in c except status/regime bands (labels only).
   * @param {number} c Contamination Index 0–100
   * @returns {object}
   */
  function mapContamination(c) {
    c = clamp(Number(c) || 0, 0, 100);
    var t = c / 100;
    var te = easeInOut(t);

    // ── Primary metrics ────────────────────────────────────────────────

    // 1. Particulate & Metal Load (µg/L suspended solids + dissolved metals).
    //    Coal/kerosene ash, black carbon, battery-mineral runoff (Li, Co, Ni,
    //    Mn compounds). Steady rise that accelerates through the mid–high band
    //    as coal combustion and battery throughput compound.
    var particulateMetal = lerp(28, 15800, Math.pow(te, 1.55));

    // 2. Nutrient & Process Residue (mg/L nitrogen-equivalent + additives).
    //    Ultra-processed food industry discharge: N/P loading, chemical
    //    additives, organic sludge. Peaks in drive through the food-scaling
    //    band (35–55) and keeps climbing as dead-zone conditions self-reinforce.
    var nutrientDrive = 0.55 * te + 0.45 * smoothstep(0.3, 0.85, t);
    var nutrientResidue = lerp(0.4, 88, nutrientDrive);

    // 3. Photic Depth (m) — light penetration.
    //    Beer–Lambert-style attenuation: falls exponentially with turbidity,
    //    particulates and organic matter; near-zero in the terminal range.
    var photicDepth = 42 * Math.exp(-5.63 * te); // → 0.15 m at c = 100

    // 4. Non-Human Viability (%) — composite of oxygen stress, toxicity,
    //    habitat loss. Holds early, then collapses non-linearly once invasive
    //    blooms and heavy chemical loading dominate (second term dominates).
    var viabilityStress = 0.3 * te + 0.7 * smoothstep(0.42, 1.0, t);
    var viability = lerp(96, 1.5, viabilityStress);

    // ── Bureaucratic envelope ──────────────────────────────────────────
    var year = Math.round(lerp(2026, 2075, t));

    var status;
    if (c < 20) status = "NOMINAL";
    else if (c < 50) status = "ELEVATED";
    else if (c < 80) status = "CRITICAL";
    else status = "TERMINAL";

    var regime = regimeAt(c);

    // ── Visual parameters (scalars 0–1 + RGB arrays) ───────────────────
    var waterColor = waterColorAt(t);
    var skyColor = skyColorAt(t);
    var fogColor = fogColorAt(t);

    // Fog density grows smoothly (capped so the scene still reads at terminal)
    var fogDensity = lerp(0.008, 0.034, Math.pow(te, 0.9));

    // Debris density factor 0–1 (drives instance counts)
    var debrisDensity = smoothstep(0.02, 0.15, t) * lerp(0.06, 1, te);

    // Chemical sheen / oil iridescence (coal-kerosene + process chemicals)
    var oilSheen = smoothstep(0.55, 0.92, t);

    // Light penetration feel for shader (1 = clear, 0 = black)
    var waterClarity = 1 - te;

    // Airborne ash / black-carbon fallout (coal return begins ~15)
    var ashFallout = smoothstep(0.18, 0.85, t);

    // Invasive gelatinous biomass (establishes ~55, dominant by ~95)
    var invasiveBiomass = smoothstep(0.55, 0.95, t);

    // Algal-style surface mat coverage
    var matCoverage = smoothstep(0.6, 1.0, t);

    // Surface wave energy: lively early swell, choked under biomass at terminal
    var waveAmp = lerp(1.05, 0.55, smoothstep(0.55, 1.0, t));

    // Sunlight attenuation through the haze
    var sunIntensity = lerp(1, 0.42, te);

    return {
      c: c,
      t: t,
      particulateMetal: particulateMetal,
      nutrientResidue: nutrientResidue,
      photicDepth: photicDepth,
      viability: viability,
      year: year,
      status: status,
      regime: regime.id,
      regimeLabel: regime.label,
      waterColor: waterColor,
      skyColor: skyColor,
      fogColor: fogColor,
      fogDensity: fogDensity,
      debrisDensity: debrisDensity,
      oilSheen: oilSheen,
      waterClarity: waterClarity,
      ashFallout: ashFallout,
      invasiveBiomass: invasiveBiomass,
      matCoverage: matCoverage,
      waveAmp: waveAmp,
      sunIntensity: sunIntensity,
    };
  }

  function waterColorAt(t) {
    // Clean teal-blue → green → brown-green → near-black toxic
    // Terminal kept slightly lifted so surface/sheen remain readable
    var stops = [
      { t: 0.0, c: [0.045, 0.27, 0.36] },
      { t: 0.2, c: [0.07, 0.3, 0.29] },
      { t: 0.5, c: [0.17, 0.27, 0.12] },
      { t: 0.8, c: [0.13, 0.14, 0.08] },
      { t: 1.0, c: [0.06, 0.07, 0.045] },
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
      particulateMetal:
        m.particulateMetal < 100
          ? m.particulateMetal.toFixed(1)
          : Math.round(m.particulateMetal).toLocaleString("en-US"),
      nutrientResidue:
        m.nutrientResidue < 10
          ? m.nutrientResidue.toFixed(2)
          : m.nutrientResidue.toFixed(1),
      photicDepth:
        m.photicDepth < 3 ? m.photicDepth.toFixed(2) : m.photicDepth.toFixed(1),
      viability: m.viability.toFixed(1),
      year: String(m.year),
      status: m.status,
      regime: m.regimeLabel,
    };
  }

  return {
    mapContamination: mapContamination,
    formatMetrics: formatMetrics,
    regimeAt: regimeAt,
    REGIMES: REGIMES,
    clamp: clamp,
    lerp: lerp,
    smoothstep: smoothstep,
    waterColorAt: waterColorAt,
    skyColorAt: skyColorAt,
    fogColorAt: fogColorAt,
  };
});
