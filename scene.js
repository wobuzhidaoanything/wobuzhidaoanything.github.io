/**
 * SEA STATE — scene, camera rig, debris simulation.
 * ES module. Depends on: three (import map), ContaminationMap (global,
 * classic script), and optional local GLB debris in models/ (GLTFLoader).
 *
 * Structure:
 *   1. Shared wave model (JS height + generated GLSL, single source of truth)
 *   2. Renderer / scene / camera / monitoring-platform controls
 *   3. Ocean + sky shaders, PMREM environment, lights
 *   4. Procedural debris field (instanced), invasive biomass, ash fallout
 *   4b. GLB hero debris (models/, cloned, CI-faded)
 *   5. UI binding + state application
 *   6. Animation loop
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

(function () {
  "use strict";

  var ContaminationMap = window.ContaminationMap;
  if (typeof ContaminationMap === "undefined") {
    showError("contamination-map.js failed to load. Serve this folder over HTTP with both files present.");
    return;
  }

  var mapContamination = ContaminationMap.mapContamination;
  var formatMetrics = ContaminationMap.formatMetrics;
  var smoothstep = ContaminationMap.smoothstep;
  var clamp = ContaminationMap.clamp;
  var lerp = ContaminationMap.lerp;

  // ── DOM refs ─────────────────────────────────────────────────────────
  var viewport = document.getElementById("viewport");
  var slider = document.getElementById("ci-slider");
  var ciValue = document.getElementById("ci-value");
  var elPart = document.getElementById("m-particulate");
  var elNutr = document.getElementById("m-nutrient");
  var elPhot = document.getElementById("m-photic");
  var elViab = document.getElementById("m-viability");
  var elYear = document.getElementById("year-value");
  var elRegime = document.getElementById("regime-value");
  var elStatus = document.getElementById("status-line");
  var elSys = document.getElementById("sys-status");

  function showError(msg) {
    var b = document.getElementById("error-banner");
    if (b) {
      b.style.display = "block";
      b.textContent = "SEA STATE — INSTRUMENT FAULT\n\n" + msg;
    }
  }

  // ── Shared state ─────────────────────────────────────────────────────
  var contamination = 0;
  var state = mapContamination(0);
  var clock = new THREE.Clock();
  var currentWaveAmp = 1.0;

  // ── 1. Wave model ────────────────────────────────────────────────────
  // Primary swell — evaluated in JS (debris bobbing) AND injected into the
  // ocean vertex shader so the field rides the same water the camera sees.
  var WAVES = [
    { dx: 1.0, dz: 0.32, freq: 0.14, amp: 0.46, speed: 0.62 },
    { dx: -0.55, dz: 1.0, freq: 0.21, amp: 0.28, speed: 0.88 },
    { dx: 0.72, dz: -0.62, freq: 0.38, amp: 0.13, speed: 1.3 },
  ];
  // Fine chop — shader only (visual normal detail, negligible displacement).
  var DETAIL_WAVES = [
    { dx: 0.9, dz: 0.44, freq: 0.85, amp: 0.045, speed: 1.9 },
    { dx: -0.3, dz: 0.95, freq: 1.35, amp: 0.028, speed: 2.6 },
  ];
  normalizeWaveDirs(WAVES);
  normalizeWaveDirs(DETAIL_WAVES);

  function normalizeWaveDirs(list) {
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      var l = Math.sqrt(w.dx * w.dx + w.dz * w.dz);
      w.dx /= l;
      w.dz /= l;
    }
  }

  function fnum(x) {
    return x.toFixed(5);
  }

  function waveHeight(x, z, t) {
    var h = 0;
    for (var i = 0; i < WAVES.length; i++) {
      var w = WAVES[i];
      h += w.amp * Math.sin((x * w.dx + z * w.dz) * w.freq + t * w.speed);
    }
    return h * currentWaveAmp;
  }

  function waveGLSL() {
    var all = WAVES.concat(DETAIL_WAVES);
    var lines = [];
    for (var i = 0; i < all.length; i++) {
      var w = all[i];
      lines.push(
        "{ float ph = (wx * " + fnum(w.dx) + " + wz * " + fnum(w.dz) + ") * " + fnum(w.freq) + " + uTime * " + fnum(w.speed) + ";\n" +
        "  h += " + fnum(w.amp) + " * sin(ph);\n" +
        "  float cph = " + fnum(w.amp * w.freq) + " * cos(ph);\n" +
        "  dx += cph * " + fnum(w.dx) + "; dz += cph * " + fnum(w.dz) + "; }"
      );
    }
    return lines.join("\n");
  }

  // ── 2. Renderer / scene / camera / controls ──────────────────────────
  var renderer, scene, camera, controls;
  var ocean, oceanMaterial, skyMesh, skyMaterial;
  var fog, hemiLight, sunLight;
  var SUN_DIR = new THREE.Vector3(0.58, 0.52, 0.34).normalize();
  var pmrem = null;
  var envScene = null;
  var envSkyMat = null;
  var envSunBall = null;
  var envRT = null;
  var lastEnvBand = -1;

  var debrisSystems = [];
  var ashParticles = null, ashGeo = null, ashPositions = null, ashVel = null;
  var dumpGroup, dumpDebris = [];

  function initThree() {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    renderer.setClearColor(0x0a1218, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    viewport.insertBefore(renderer.domElement, viewport.firstChild);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
      50,
      viewport.clientWidth / Math.max(viewport.clientHeight, 1),
      0.1,
      900
    );

    fog = new THREE.FogExp2(0x738a96, 0.018);
    scene.fog = fog;

    controls = createControls(camera, renderer.domElement);

    window.addEventListener("resize", onResize);
  }

  function onResize() {
    var w = viewport.clientWidth;
    var h = Math.max(viewport.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  /**
   * Monitoring-platform camera: orbit / pan / vertical / zoom with damping,
   * hard limits (never below the waterline, never unboundedly far), and a
   * gentle survey drift that resumes only after the operator lets go.
   */
  function createControls(camera, dom) {
    var ctrl = {
      target: new THREE.Vector3(0, 0.8, -4),
      radius: 22,
      theta: 0.0,
      phi: 1.12,
      vTheta: 0,
      vPhi: 0,
      vRadius: 0,
      panVel: new THREE.Vector3(),
      minRadius: 5,
      maxRadius: 58,
      minPhi: 0.16,
      minCamY: 1.1,
      lastInteract: -100,
      onTap: null,
    };

    var pointers = new Map();
    var pinchDist = 0;
    var downX = 0, downY = 0, movedPx = 0;

    function interact() {
      ctrl.lastInteract = clock.elapsedTime;
    }

    function panBy(dx, dy) {
      // Move target along the camera's screen-plane axes (vertical included).
      var scale = ctrl.radius * 0.0011;
      var right = new THREE.Vector3();
      var up = new THREE.Vector3();
      camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
      ctrl.panVel.addScaledVector(right, -dx * scale);
      ctrl.panVel.addScaledVector(up, dy * scale);
    }

    dom.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });

    dom.addEventListener("pointerdown", function (e) {
      dom.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      if (pointers.size === 1) {
        downX = e.clientX;
        downY = e.clientY;
        movedPx = 0;
      } else if (pointers.size === 2) {
        var pts = Array.from(pointers.values());
        pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
      ctrl.vTheta = 0;
      ctrl.vPhi = 0;
      ctrl.panVel.set(0, 0, 0);
      interact();
    });

    dom.addEventListener("pointermove", function (e) {
      var p = pointers.get(e.pointerId);
      if (!p) return;
      var dx = e.clientX - p.x;
      var dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      movedPx += Math.abs(dx) + Math.abs(dy);
      interact();

      if (pointers.size === 2) {
        var pts = Array.from(pointers.values());
        var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchDist > 0) {
          ctrl.radius *= clamp(pinchDist / Math.max(d, 1), 0.9, 1.1);
        }
        pinchDist = d;
        panBy(dx * 0.5, dy * 0.5);
        return;
      }

      var wantsPan = p.button === 2 || p.button === 1 || e.shiftKey || e.ctrlKey || e.metaKey;
      if (wantsPan) {
        panBy(dx, dy);
      } else {
        var dTheta = -dx * 0.0044;
        var dPhi = -dy * 0.0044;
        ctrl.theta += dTheta;
        ctrl.phi += dPhi;
        ctrl.vTheta = ctrl.vTheta * 0.5 + dTheta * 0.5;
        ctrl.vPhi = ctrl.vPhi * 0.5 + dPhi * 0.5;
      }
    });

    function endPointer(e) {
      var p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (p && pointers.size === 0 && p.button === 0 && movedPx < 6 && ctrl.onTap) {
        ctrl.onTap(e.clientX, e.clientY);
      }
      interact();
    }
    dom.addEventListener("pointerup", endPointer);
    dom.addEventListener("pointercancel", endPointer);

    dom.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        var d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        ctrl.vRadius += d * 0.012;
        ctrl.vRadius = clamp(ctrl.vRadius, -2.5, 2.5);
        interact();
      },
      { passive: false }
    );

    window.addEventListener("keydown", function (e) {
      // Don't hijack keys bound for form controls (e.g. the index slider).
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      var k = e.key;
      if (k === "ArrowLeft") ctrl.vTheta += 0.012;
      else if (k === "ArrowRight") ctrl.vTheta -= 0.012;
      else if (k === "ArrowUp") ctrl.target.y = clamp(ctrl.target.y + 0.6, 0.15, 30);
      else if (k === "ArrowDown") ctrl.target.y = clamp(ctrl.target.y - 0.6, 0.15, 30);
      else if (k === "+" || k === "=") ctrl.vRadius -= 0.8;
      else if (k === "-" || k === "_") ctrl.vRadius += 0.8;
      else return;
      interact();
      e.preventDefault();
    });

    ctrl.update = function (dt, now) {
      // Gentle survey drift resumes after 5 s of no operator input.
      var idle = now - ctrl.lastInteract;
      if (idle > 5) {
        var blend = Math.min(1, (idle - 5) / 4);
        ctrl.theta += dt * 0.032 * blend;
      }

      var frame = dt * 60;
      ctrl.theta += ctrl.vTheta * frame;
      ctrl.phi += ctrl.vPhi * frame;
      ctrl.radius += ctrl.vRadius * frame;
      ctrl.target.addScaledVector(ctrl.panVel, frame);

      var damp = Math.exp(-4.5 * dt);
      ctrl.vTheta *= damp;
      ctrl.vPhi *= damp;
      ctrl.vRadius *= damp;
      ctrl.panVel.multiplyScalar(damp);

      // Hard limits: stay over the sector, above the waterline, in range.
      ctrl.target.x = clamp(ctrl.target.x, -45, 45);
      ctrl.target.y = clamp(ctrl.target.y, 0.15, 30);
      ctrl.target.z = clamp(ctrl.target.z, -60, 45);
      ctrl.radius = clamp(ctrl.radius, ctrl.minRadius, ctrl.maxRadius);
      var phiMax = Math.acos(clamp((ctrl.minCamY - ctrl.target.y) / ctrl.radius, -1, 1));
      ctrl.phi = clamp(ctrl.phi, ctrl.minPhi, Math.max(ctrl.minPhi + 0.01, phiMax));

      var sp = Math.sin(ctrl.phi);
      camera.position.set(
        ctrl.target.x + ctrl.radius * sp * Math.sin(ctrl.theta),
        ctrl.target.y + ctrl.radius * Math.cos(ctrl.phi),
        ctrl.target.z + ctrl.radius * sp * Math.cos(ctrl.theta)
      );
      if (camera.position.y < ctrl.minCamY) camera.position.y = ctrl.minCamY;
      camera.lookAt(ctrl.target);
    };

    return ctrl;
  }

  // ── 3. Ocean / sky / environment / lights ────────────────────────────
  function buildOcean() {
    var vertexShader = [
      "uniform float uTime;",
      "uniform float uWaveAmp;",
      "varying vec3 vWorldPos;",
      "varying vec3 vNormal;",
      "varying float vCrest;",
      "void main() {",
      "  vec3 pos = position;",
      "  float wx = pos.x;",
      "  float wz = -pos.y;", // plane rotated -90° about X: local +y → world -z
      "  float h = 0.0; float dx = 0.0; float dz = 0.0;",
      waveGLSL(),
      "  pos.z += h * uWaveAmp;",
      "  vec4 world = modelMatrix * vec4(pos, 1.0);",
      "  vWorldPos = world.xyz;",
      "  vNormal = normalize(vec3(-dx * uWaveAmp, 1.0, -dz * uWaveAmp));",
      "  vCrest = h;",
      "  gl_Position = projectionMatrix * viewMatrix * world;",
      "}",
    ].join("\n");

    var fragmentShader = [
      "uniform float uTime;",
      "uniform float uMurk;",
      "uniform float uOil;",
      "uniform float uClarity;",
      "uniform float uFogDensity;",
      "uniform vec3 uWaterColor;",
      "uniform vec3 uDeepColor;",
      "uniform vec3 uSkyReflect;",
      "uniform vec3 uFogColor;",
      "uniform vec3 uSunDir;",
      "uniform vec3 uSunColor;",
      "varying vec3 vWorldPos;",
      "varying vec3 vNormal;",
      "varying float vCrest;",
      "",
      "float hash21(vec2 p) {",
      "  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);",
      "}",
      "float vnoise(vec2 p) {",
      "  vec2 i = floor(p); vec2 f = fract(p);",
      "  vec2 u = f * f * (3.0 - 2.0 * f);",
      "  float a = hash21(i);",
      "  float b = hash21(i + vec2(1.0, 0.0));",
      "  float c = hash21(i + vec2(0.0, 1.0));",
      "  float d = hash21(i + vec2(1.0, 1.0));",
      "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
      "}",
      "float fbm2(vec2 p) {",
      "  return vnoise(p) * 0.65 + vnoise(p * 2.13 + 7.7) * 0.35;",
      "}",
      "",
      "void main() {",
      // Geometric normal + fine noise perturbation for sparkle
      "  vec3 N = normalize(vNormal);",
      "  vec2 np = vWorldPos.xz * 1.7 + uTime * 0.18;",
      "  float n0 = fbm2(np);",
      "  float nx = fbm2(np + vec2(0.28, 0.0));",
      "  float nz = fbm2(np + vec2(0.0, 0.28));",
      "  vec3 Nd = normalize(N + vec3(nx - n0, 0.0, nz - n0) * (0.2 + 0.8 * uClarity) * 0.7);",
      "",
      "  vec3 V = normalize(cameraPosition - vWorldPos);",
      "  float ndv = max(dot(Nd, V), 0.0);",
      "  float fres = pow(1.0 - ndv, 3.0);",
      "",
      // Body of water: deep at grazing angles, surface colour head-on
      "  vec3 base = mix(uDeepColor, uWaterColor, 0.3 + 0.7 * ndv);",
      "  vec3 col = mix(base, uSkyReflect, fres * (0.12 + 0.5 * uClarity));",
      "",
      // Sun: broad sheen + tight glitter path
      "  vec3 H = normalize(V + uSunDir);",
      "  float ndh = max(dot(Nd, H), 0.0);",
      "  float glitter = pow(ndh, 260.0) * (1.6 * uClarity + 0.25);",
      "  float sheen = pow(ndh, 22.0) * 0.1;",
      "  col += uSunColor * (glitter + sheen);",
      "",
      // Sparse whitecap speckle on crests while water is still alive
      "  float cap = smoothstep(0.5, 0.85, vCrest) * smoothstep(0.55, 0.85, vnoise(vWorldPos.xz * 2.6 + uTime * 0.35));",
      "  col += vec3(0.2, 0.22, 0.22) * cap * 0.18 * uClarity;",
      "",
      // Chemical / oil thin-film iridescence in drifting patches (kept dark,
      // oily — a greasy rainbow, not a light show)
      "  if (uOil > 0.004) {",
      "    float warp = fbm2(vWorldPos.xz * 0.16 + uTime * 0.025);",
      "    float band = sin(vWorldPos.x * 0.45 + vWorldPos.z * 0.34 + warp * 9.0 + uTime * 0.08);",
      "    vec3 irid = 0.5 + 0.5 * cos(6.28318 * (band * 0.22 + vec3(0.0, 0.33, 0.67)));",
      "    float ilum = dot(irid, vec3(0.299, 0.587, 0.114));",
      "    irid = mix(vec3(ilum), irid, 0.4) * 0.16 * (1.0 - uMurk * 0.45);",
      "    float cover = smoothstep(0.58, 0.92, fbm2(vWorldPos.xz * 0.07 - uTime * 0.012) * 0.75 + uOil * 0.3);",
      "    col = mix(col, irid + col * 0.35, uOil * cover * 0.5);",
      "  }",
      "",
      // Murk: desaturate and darken, keep a readable floor
      "  float lum = dot(col, vec3(0.299, 0.587, 0.114));",
      "  col = mix(col, vec3(lum), uMurk * 0.35);",
      "  col *= mix(1.0, 0.6, uMurk);",
      "  col = max(col, vec3(0.006, 0.007, 0.005));",
      "",
      // Manual exp2 fog (matches scene fog for standard materials)
      "  float dist = length(cameraPosition - vWorldPos);",
      "  float fo = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);",
      "  col = mix(col, uFogColor, clamp(fo, 0.0, 1.0));",
      "",
      "  gl_FragColor = vec4(col, 1.0);",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n");

    oceanMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaveAmp: { value: 1 },
        uMurk: { value: 0 },
        uOil: { value: 0 },
        uClarity: { value: 1 },
        uFogDensity: { value: 0.012 },
        uWaterColor: { value: new THREE.Color(0.045, 0.27, 0.36) },
        uDeepColor: { value: new THREE.Color(0.02, 0.1, 0.15) },
        uSkyReflect: { value: new THREE.Color(0.55, 0.68, 0.78) },
        uFogColor: { value: new THREE.Color(0.45, 0.58, 0.65) },
        uSunDir: { value: SUN_DIR.clone() },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.87) },
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      side: THREE.FrontSide,
    });

    var geo = new THREE.PlaneGeometry(340, 340, 170, 170);
    ocean = new THREE.Mesh(geo, oceanMaterial);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0;
    scene.add(ocean);
  }

  function skyShaderMaterial() {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0.3, 0.42, 0.56) },
        uHorizon: { value: new THREE.Color(0.55, 0.68, 0.78) },
        uBottom: { value: new THREE.Color(0.2, 0.28, 0.32) },
        uSunDir: { value: SUN_DIR.clone() },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.87) },
        uSunGlow: { value: 1 },
      },
      vertexShader: [
        "varying vec3 vPos;",
        "void main() {",
        "  vPos = position;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}",
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 uTop;",
        "uniform vec3 uHorizon;",
        "uniform vec3 uBottom;",
        "uniform vec3 uSunDir;",
        "uniform vec3 uSunColor;",
        "uniform float uSunGlow;",
        "varying vec3 vPos;",
        "void main() {",
        "  vec3 dir = normalize(vPos);",
        "  float h = dir.y;",
        "  vec3 col;",
        "  if (h > 0.0) {",
        "    col = mix(uHorizon, uTop, pow(h, 0.6));",
        "  } else {",
        "    col = mix(uHorizon, uBottom, pow(-h, 0.8));",
        "  }",
        "  float d = max(dot(dir, normalize(uSunDir)), 0.0);",
        "  col += uSunColor * (pow(d, 420.0) * 1.4 + pow(d, 10.0) * 0.14) * uSunGlow;",
        "  gl_FragColor = vec4(col, 1.0);",
        "  #include <tonemapping_fragment>",
        "  #include <colorspace_fragment>",
        "}",
      ].join("\n"),
    });
  }

  function buildSky() {
    var skyGeo = new THREE.SphereGeometry(380, 40, 20);
    skyMaterial = skyShaderMaterial();
    skyMesh = new THREE.Mesh(skyGeo, skyMaterial);
    scene.add(skyMesh);
  }

  function buildLights() {
    hemiLight = new THREE.HemisphereLight(0xbfd4e0, 0x16222a, 0.55);
    scene.add(hemiLight);

    sunLight = new THREE.DirectionalLight(0xfff2df, 2.6);
    sunLight.position.copy(SUN_DIR).multiplyScalar(120);
    scene.add(sunLight);
  }

  /**
   * Small dedicated environment scene (gradient dome + sun disc) rendered
   * through PMREM so plastics, metals and drums pick up plausible sky/sun
   * reflections. Refreshed at coarse contamination bands only.
   */
  function buildEnv() {
    pmrem = new THREE.PMREMGenerator(renderer);
    envScene = new THREE.Scene();
    envSkyMat = skyShaderMaterial();
    var dome = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 16), envSkyMat);
    envScene.add(dome);
    envSunBall = new THREE.Mesh(
      new THREE.SphereGeometry(5, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff0dd })
    );
    envSunBall.position.copy(SUN_DIR).multiplyScalar(60);
    envScene.add(envSunBall);
  }

  function refreshEnv(sky, sun, glow) {
    var skyLin = lin(sky);
    envSkyMat.uniforms.uTop.value.copy(skyLin).multiplyScalar(0.55);
    envSkyMat.uniforms.uHorizon.value.copy(skyLin);
    envSkyMat.uniforms.uBottom.value.copy(skyLin).multiplyScalar(0.3);
    envSkyMat.uniforms.uSunColor.value.copy(sun);
    envSkyMat.uniforms.uSunGlow.value = glow;
    envSunBall.material.color.copy(sun);
    var rt = pmrem.fromScene(envScene, 0.07);
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
  }

  // ── 4. Debris field ──────────────────────────────────────────────────

  /** Deterministic radial jitter, keyed on position so duplicated vertices
   *  (non-indexed geometry) displace identically — no cracks. */
  function jitterGeometry(geo, amount) {
    var pos = geo.attributes.position;
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      var h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453;
      var r = h - Math.floor(h);
      var len = v.length() || 1;
      pos.setXYZ(
        i,
        v.x + (v.x / len) * (r - 0.5) * 2 * amount,
        v.y + (v.y / len) * (r - 0.5) * 2 * amount,
        v.z + (v.z / len) * (r - 0.5) * 2 * amount
      );
    }
    geo.computeVertexNormals();
    return geo;
  }

  /** Minimal mergeVertices (position-keyed) so organic lumps get smooth normals. */
  function mergeVerticesSmooth(geo) {
    var pos = geo.attributes.position;
    var map = {};
    var indices = [];
    var newPos = [];
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      var key =
        Math.round(v.x * 1e4) + "_" + Math.round(v.y * 1e4) + "_" + Math.round(v.z * 1e4);
      var idx = map[key];
      if (idx === undefined) {
        idx = newPos.length / 3;
        map[key] = idx;
        newPos.push(v.x, v.y, v.z);
      }
      indices.push(idx);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(newPos, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  function lathe(points, segments) {
    var pts = points.map(function (p) {
      return new THREE.Vector2(p[0], p[1]);
    });
    return new THREE.LatheGeometry(pts, segments);
  }

  function makeBottleGeo() {
    var g = lathe(
      [
        [0.001, 0.0], [0.075, 0.0], [0.09, 0.015], [0.098, 0.05],
        [0.1, 0.1], [0.1, 0.24], [0.092, 0.3], [0.055, 0.36],
        [0.033, 0.4], [0.033, 0.46], [0.04, 0.465], [0.04, 0.495],
        [0.03, 0.5], [0.001, 0.5],
      ],
      12
    );
    g.translate(0, -0.22, 0);
    return g;
  }

  function makeContainerGeo() {
    var g = new THREE.BoxGeometry(0.34, 0.42, 0.24, 2, 2, 2);
    return jitterGeometry(g, 0.012);
  }

  function makeFilmGeo() {
    var g = new THREE.PlaneGeometry(0.55, 0.45, 3, 3);
    var pos = g.attributes.position;
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      var h = Math.sin(v.x * 31.7 + v.y * 17.3) * 43758.5453;
      pos.setZ(i, (h - Math.floor(h) - 0.5) * 0.09);
    }
    g.computeVertexNormals();
    return g;
  }

  function makeDrumGeo() {
    var g = lathe(
      [
        [0.001, 0.0], [0.24, 0.0], [0.265, 0.02], [0.265, 0.115],
        [0.285, 0.135], [0.285, 0.175], [0.265, 0.195], [0.265, 0.27],
        [0.285, 0.29], [0.285, 0.33], [0.265, 0.35], [0.265, 0.43],
        [0.285, 0.45], [0.285, 0.49], [0.265, 0.51], [0.265, 0.575],
        [0.245, 0.6], [0.22, 0.615], [0.001, 0.615],
      ],
      16
    );
    g.translate(0, -0.3, 0);
    return g;
  }

  function makeNetGeo() {
    var g = new THREE.TorusKnotGeometry(0.17, 0.05, 48, 6, 2, 5);
    g.scale(1, 0.6, 1);
    return g;
  }

  function makeCasingGeo() {
    var g = new THREE.BoxGeometry(0.34, 0.14, 0.2, 1, 1, 1);
    return jitterGeometry(g, 0.008);
  }

  function makeShardGeo() {
    var g = new THREE.TetrahedronGeometry(0.17, 0);
    return jitterGeometry(g, 0.035);
  }

  function makeSludgeGeo() {
    var g = new THREE.IcosahedronGeometry(0.18, 1);
    jitterGeometry(g, 0.05);
    return mergeVerticesSmooth(g);
  }

  function makeGelGeo() {
    var g = new THREE.IcosahedronGeometry(0.5, 2);
    jitterGeometry(g, 0.13);
    return mergeVerticesSmooth(g);
  }

  function makeMatGeo() {
    var g = new THREE.CircleGeometry(1, 14);
    jitterGeometry(g, 0.22); // in-plane: irregular rim
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }

  var PALETTES = {
    bottle: [
      [0.82, 0.85, 0.83], [0.55, 0.7, 0.78], [0.45, 0.62, 0.45],
      [0.5, 0.42, 0.3], [0.5, 0.52, 0.5], [0.72, 0.74, 0.7],
    ],
    container: [
      [0.62, 0.66, 0.68], [0.3, 0.45, 0.6], [0.7, 0.5, 0.25],
      [0.55, 0.58, 0.5], [0.65, 0.62, 0.55],
    ],
    film: [
      [0.85, 0.86, 0.84], [0.75, 0.78, 0.8], [0.7, 0.68, 0.6],
      [0.6, 0.66, 0.7],
    ],
    drum: [
      [0.45, 0.22, 0.12], [0.2, 0.3, 0.45], [0.35, 0.36, 0.2],
      [0.55, 0.45, 0.15], [0.35, 0.36, 0.38], [0.4, 0.18, 0.14],
    ],
    net: [
      [0.12, 0.2, 0.14], [0.2, 0.18, 0.12], [0.1, 0.14, 0.16],
      [0.25, 0.22, 0.15],
    ],
    casing: [
      [0.18, 0.19, 0.22], [0.28, 0.29, 0.32], [0.35, 0.25, 0.18],
      [0.55, 0.57, 0.53], [0.22, 0.24, 0.26],
    ],
    shard: [
      [0.3, 0.31, 0.34], [0.4, 0.3, 0.22], [0.5, 0.52, 0.5],
      [0.2, 0.21, 0.24],
    ],
    sludge: [
      [0.14, 0.12, 0.07], [0.16, 0.15, 0.08], [0.12, 0.13, 0.09],
      [0.18, 0.14, 0.08],
    ],
    gel: [
      [0.32, 0.48, 0.22], [0.4, 0.52, 0.2], [0.28, 0.42, 0.3],
      [0.48, 0.5, 0.18],
    ],
    mat: [
      [0.1, 0.13, 0.04], [0.12, 0.14, 0.05], [0.08, 0.12, 0.06],
    ],
  };

  var TYPE_DEFS = [
    { key: "bottle", make: makeBottleGeo, count: 130, appear: [0.05, 0.55],
      float: 0.55, lift: 0.1, scale: [0.8, 1.5], tilt: 0.6, spin: 0.1,
      mat: { transparent: true, opacity: 0.72, roughness: 0.28, metalness: 0.02, envMapIntensity: 1.0 } },
    { key: "container", make: makeContainerGeo, count: 60, appear: [0.14, 0.6],
      float: 0.7, lift: 0.14, scale: [0.8, 1.3], tilt: 0.5, spin: 0.08,
      mat: { roughness: 0.5, metalness: 0.05, envMapIntensity: 0.7 } },
    { key: "film", make: makeFilmGeo, count: 95, appear: [0.17, 0.65],
      float: 0.85, lift: 0.03, scale: [0.9, 1.8], tilt: 0.25, spin: 0.25,
      mat: { transparent: true, opacity: 0.45, roughness: 0.35, metalness: 0.0, side: THREE.DoubleSide, envMapIntensity: 0.6 } },
    { key: "drum", make: makeDrumGeo, count: 44, appear: [0.28, 0.8],
      float: 0.45, lift: 0.16, scale: [0.9, 1.25], tilt: 1.2, spin: 0.05,
      mat: { roughness: 0.55, metalness: 0.6, envMapIntensity: 0.9 } },
    { key: "net", make: makeNetGeo, count: 40, appear: [0.34, 0.85],
      float: 0.8, lift: 0.05, scale: [1.0, 2.2], tilt: 0.4, spin: 0.12,
      mat: { roughness: 0.95, metalness: 0.0, envMapIntensity: 0.3 } },
    { key: "casing", make: makeCasingGeo, count: 70, appear: [0.32, 0.85],
      float: 0.6, lift: 0.05, scale: [0.8, 1.5], tilt: 0.8, spin: 0.15,
      mat: { roughness: 0.38, metalness: 0.85, envMapIntensity: 1.1 } },
    { key: "shard", make: makeShardGeo, count: 85, appear: [0.32, 0.85],
      float: 0.7, lift: 0.02, scale: [0.8, 1.8], tilt: 0.9, spin: 0.3,
      mat: { roughness: 0.3, metalness: 0.9, envMapIntensity: 1.1, flatShading: true } },
    { key: "sludge", make: makeSludgeGeo, count: 70, appear: [0.4, 0.92],
      float: 0.9, lift: 0.0, scale: [1.2, 3.0], tilt: 0.4, spin: 0.06,
      mat: { roughness: 0.42, metalness: 0.05, envMapIntensity: 0.35 } },
    { key: "gel", make: makeGelGeo, count: 46, appear: [0.55, 1.0],
      float: 0.75, lift: 0.05, scale: [0.8, 2.4], tilt: 0.3, spin: 0.05, pulse: true,
      mat: { transparent: true, opacity: 0.55, roughness: 0.12, metalness: 0.0, envMapIntensity: 0.7, emissive: 0x0a1406 } },
    { key: "mat", make: makeMatGeo, count: 22, appear: [0.6, 1.0],
      float: 0.35, lift: 0.03, scale: [1.5, 4.2], tilt: 0.05, spin: 0.02,
      mat: { transparent: true, opacity: 0.88, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide, envMapIntensity: 0.2 } },
  ];

  function buildDebris() {
    var dummy = new THREE.Object3D();

    for (var t = 0; t < TYPE_DEFS.length; t++) {
      var def = TYPE_DEFS[t];
      var geo = def.make();
      var matParams = def.mat;
      matParams.color = 0xffffff;
      var mat = new THREE.MeshStandardMaterial(matParams);
      var mesh = new THREE.InstancedMesh(geo, mat, def.count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;

      var palette = PALETTES[def.key];
      var meta = [];
      for (var i = 0; i < def.count; i++) {
        var ang = Math.random() * Math.PI * 2;
        var rad = 4 + Math.pow(Math.random(), 1.5) * 74;
        var x = Math.cos(ang) * rad;
        var z = Math.sin(ang) * rad - 8;
        var s = lerp(def.scale[0], def.scale[1], Math.random());
        var sx = s * (0.85 + Math.random() * 0.3);
        var sy = s * (0.85 + Math.random() * 0.3);
        var sz = s * (0.85 + Math.random() * 0.3);

        meta.push({
          x0: x,
          z0: z,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.7,
          drift: 0.2 + Math.random() * 0.5,
          rotX0: (Math.random() - 0.5) * 2 * def.tilt,
          rotY0: Math.random() * Math.PI * 2,
          rotZ0: (Math.random() - 0.5) * 2 * def.tilt,
          spin: (Math.random() - 0.5) * 2 * def.spin,
          scale: [sx, sy, sz],
        });

        dummy.position.set(x, 0.1, z);
        dummy.rotation.set(meta[i].rotX0, meta[i].rotY0, meta[i].rotZ0);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        var c = palette[(i * 7 + 3) % palette.length];
        mesh.setColorAt(i, new THREE.Color(c[0], c[1], c[2]).convertSRGBToLinear());
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      debrisSystems.push({ def: def, mesh: mesh, meta: meta, dummy: new THREE.Object3D() });
    }

    dumpGroup = new THREE.Group();
    scene.add(dumpGroup);
  }

  function buildAsh() {
    var N = 350;
    ashPositions = new Float32Array(N * 3);
    ashVel = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      ashPositions[i * 3] = (Math.random() - 0.5) * 70;
      ashPositions[i * 3 + 1] = Math.random() * 20 + 1;
      ashPositions[i * 3 + 2] = (Math.random() - 0.5) * 70 - 5;
      ashVel[i] = 0.4 + Math.random() * 1.3;
    }
    ashGeo = new THREE.BufferGeometry();
    ashGeo.setAttribute("position", new THREE.BufferAttribute(ashPositions, 3));
    var mat = new THREE.PointsMaterial({
      color: 0x7a7268,
      size: 0.09,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    });
    ashParticles = new THREE.Points(ashGeo, mat);
    scene.add(ashParticles);
  }

  // ── 4b. GLB hero debris (models/) ────────────────────────────────────
  // Realistic waste items loaded from local GLB files, cloned 15–30× and
  // scattered over the procedural fill. Each stream fades in across a
  // Contamination Index window (~0.1–0.7). Load failures degrade gracefully
  // to the procedural field.
  var GLB_DEFS = [
    { url: "models/bottle.glb", clones: 26, appear: [0.1, 0.45], target: 0.45, float: 0.55, lift: 0.06, tilt: 0.6, spin: 0.1 },
    { url: "models/can.glb", clones: 20, appear: [0.16, 0.5], target: 0.16, float: 0.7, lift: 0.02, tilt: 0.9, spin: 0.25 },
    { url: "models/cardboard_box.glb", clones: 18, appear: [0.22, 0.56], target: 0.42, float: 0.6, lift: 0.08, tilt: 0.5, spin: 0.07 },
    { url: "models/barrel.glb", clones: 16, appear: [0.3, 0.64], target: 0.62, float: 0.45, lift: 0.14, tilt: 1.1, spin: 0.05 },
    { url: "models/battery.glb", clones: 15, appear: [0.36, 0.7], target: 0.34, float: 0.5, lift: 0.04, tilt: 0.8, spin: 0.12 },
  ];
  var glbSystems = [];
  var glbGroup;

  function buildGlbDebris() {
    glbGroup = new THREE.Group();
    scene.add(glbGroup);
    var loader = new GLTFLoader();
    GLB_DEFS.forEach(function (def) {
      loader.load(
        def.url,
        function (gltf) {
          try {
            glbSystems.push(makeGlbSystem(def, gltf.scene));
          } catch (err) {
            console.warn("SEA STATE: GLB setup failed for " + def.url, err);
          }
        },
        undefined,
        function (err) {
          console.warn(
            "SEA STATE: GLB load failed for " + def.url + " — procedural fill remains.",
            err
          );
        }
      );
    });
  }

  function makeGlbSystem(def, root) {
    root.updateMatrixWorld(true);

    // One shared fade-able material set per stream
    var matMap = new Map();
    var sysMats = [];
    function sysMaterial(src) {
      if (matMap.has(src)) return matMap.get(src);
      var m = src.clone();
      m.transparent = true;
      m.opacity = 0;
      m.userData.baseOpacity = src.opacity != null ? src.opacity : 1;
      matMap.set(src, m);
      sysMats.push(m);
      return m;
    }

    // Flatten to meshes only (drops Light/Camera nodes authored into files)
    var template = new THREE.Group();
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var mesh = new THREE.Mesh(
        o.geometry,
        Array.isArray(o.material) ? o.material.map(sysMaterial) : sysMaterial(o.material)
      );
      mesh.matrix.copy(o.matrixWorld);
      mesh.matrixAutoUpdate = false;
      template.add(mesh);
    });

    // Normalise wildly different authored scales to scene units
    template.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(template);
    var size = box.getSize(new THREE.Vector3());
    var baseScale = def.target / Math.max(size.x, size.y, size.z, 1e-6);
    template.scale.setScalar(baseScale);

    var group = new THREE.Group();
    group.visible = false;
    glbGroup.add(group);

    var clones = [];
    for (var i = 0; i < def.clones; i++) {
      var clone = template.clone();
      var ang = Math.random() * Math.PI * 2;
      var rad = 5 + Math.pow(Math.random(), 1.5) * 70;
      clones.push({
        obj: clone,
        x0: Math.cos(ang) * rad,
        z0: Math.sin(ang) * rad - 8,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.7,
        drift: 0.2 + Math.random() * 0.5,
        rotX0: (Math.random() - 0.5) * 2 * def.tilt,
        rotY0: Math.random() * Math.PI * 2,
        rotZ0: (Math.random() - 0.5) * 2 * def.tilt,
        spin: (Math.random() - 0.5) * 2 * def.spin,
        scaleJit: 0.85 + Math.random() * 0.4,
      });
      group.add(clone);
    }
    return { def: def, group: group, clones: clones, mats: sysMats, baseScale: baseScale };
  }

  function buildScene() {
    buildSky();
    buildOcean();
    buildLights();
    buildEnv();
    buildDebris();
    buildGlbDebris();
    buildAsh();
  }

  // ── 5. UI binding + state application ────────────────────────────────
  function bindUI() {
    slider.addEventListener("input", function () {
      contamination = parseFloat(slider.value) || 0;
      state = mapContamination(contamination);
      applyState(state);
    });

    controls.onTap = function (clientX, clientY) {
      var rect = renderer.domElement.getBoundingClientRect();
      var ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      var ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      var hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, hit)) {
        if (Math.abs(hit.x) < 150 && Math.abs(hit.z) < 150) spawnDump(hit.x, hit.z);
      }
    };
  }

  function spawnDump(x, z) {
    var geos = [makeBottleGeo(), makeCasingGeo(), makeSludgeGeo()];
    var n = 3 + Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++) {
      var key = ["bottle", "casing", "sludge"][i % 3];
      var palette = PALETTES[key];
      var c = palette[(dumpDebris.length + i) % palette.length];
      var def = TYPE_DEFS.filter(function (d) {
        return d.key === key;
      })[0];
      var mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(c[0], c[1], c[2]),
        roughness: def.mat.roughness != null ? def.mat.roughness : 0.7,
        metalness: def.mat.metalness || 0,
        transparent: !!def.mat.transparent,
        opacity: def.mat.opacity != null ? def.mat.opacity : 1,
      });
      var m = new THREE.Mesh(geos[i % 3], mat);
      m.position.set(x + (Math.random() - 0.5) * 1.4, 0.08, z + (Math.random() - 0.5) * 1.4);
      m.rotation.set(Math.random() * 0.8, Math.random() * 6, Math.random() * 0.8);
      m.scale.setScalar(0.9 + Math.random() * 0.7);
      dumpGroup.add(m);
      dumpDebris.push({
        mesh: m,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.6,
      });
    }
    while (dumpDebris.length > 60) {
      var old = dumpDebris.shift();
      dumpGroup.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
  }

  function sunColorAt(t) {
    var u = smoothstep(0.1, 0.9, t);
    return new THREE.Color(lerp(1.0, 0.85, u), lerp(0.95, 0.55, u), lerp(0.87, 0.3, u));
  }

  // Palette stops in contamination-map.js are authored as display (sRGB)
  // values; convert once into linear working space for lighting correctness.
  function lin(c) {
    return new THREE.Color(c[0], c[1], c[2]).convertSRGBToLinear();
  }

  function applyState(m) {
    var fmt = formatMetrics(m);

    // Panel
    ciValue.textContent = m.c < 10 ? m.c.toFixed(1) : String(Math.round(m.c));
    ciValue.className = "";
    if (m.c >= 80) ciValue.classList.add("danger");
    else if (m.c >= 50) ciValue.classList.add("warn");

    elPart.textContent = fmt.particulateMetal;
    elNutr.textContent = fmt.nutrientResidue;
    elPhot.textContent = fmt.photicDepth;
    elViab.textContent = fmt.viability;
    elYear.textContent = fmt.year;
    elRegime.textContent = fmt.regime;

    elStatus.textContent = m.status;
    elStatus.className = "status-line";
    if (m.status === "ELEVATED") elStatus.classList.add("elevated");
    else if (m.status === "CRITICAL") elStatus.classList.add("critical");
    else if (m.status === "TERMINAL") elStatus.classList.add("terminal");

    elSys.className = "";
    if (m.c >= 80) elSys.classList.add("crit");
    else if (m.c >= 50) elSys.classList.add("warn");

    var sun = sunColorAt(m.t);
    var waterLin = lin(m.waterColor);
    var skyLin = lin(m.skyColor);
    var fogLin = lin(m.fogColor);
    var deep = waterLin.clone().multiplyScalar(0.4);

    // Ocean
    oceanMaterial.uniforms.uWaterColor.value.copy(waterLin);
    oceanMaterial.uniforms.uDeepColor.value.copy(deep);
    oceanMaterial.uniforms.uSkyReflect.value.copy(skyLin);
    oceanMaterial.uniforms.uFogColor.value.copy(fogLin);
    oceanMaterial.uniforms.uFogDensity.value = m.fogDensity;
    oceanMaterial.uniforms.uMurk.value = 1 - m.waterClarity;
    oceanMaterial.uniforms.uOil.value = m.oilSheen;
    oceanMaterial.uniforms.uClarity.value = m.waterClarity;
    oceanMaterial.uniforms.uWaveAmp.value = m.waveAmp;
    oceanMaterial.uniforms.uSunColor.value.copy(sun);
    currentWaveAmp = m.waveAmp;

    // Sky
    skyMaterial.uniforms.uTop.value.copy(skyLin).multiplyScalar(0.55);
    skyMaterial.uniforms.uHorizon.value.copy(skyLin);
    skyMaterial.uniforms.uBottom.value.copy(fogLin).multiplyScalar(0.7);
    skyMaterial.uniforms.uSunColor.value.copy(sun);
    skyMaterial.uniforms.uSunGlow.value = m.sunIntensity;

    // Atmosphere / lights
    fog.color.copy(fogLin);
    fog.density = m.fogDensity;
    renderer.setClearColor(fogLin, 1);

    sunLight.color.copy(sun);
    sunLight.intensity = 2.6 * m.sunIntensity;
    hemiLight.color.copy(skyLin).multiplyScalar(0.9);
    hemiLight.groundColor.copy(deep);
    hemiLight.intensity = 0.35 + m.waterClarity * 0.3;

    // Debris visibility per waste stream (staggered by appear window)
    for (var d = 0; d < debrisSystems.length; d++) {
      var sys = debrisSystems[d];
      var a = sys.def.appear;
      var vis = Math.floor(sys.def.count * smoothstep(a[0], a[1], m.t));
      sys.mesh.count = Math.max(0, Math.min(sys.def.count, vis));
    }

    // Ash fallout
    ashParticles.material.opacity = m.ashFallout * 0.6;
    ashParticles.visible = m.ashFallout > 0.02;

    // Environment reflections: regenerate only when the coarse band changes
    var band = Math.floor(m.c / 10);
    if (band !== lastEnvBand) {
      lastEnvBand = band;
      refreshEnv(m.skyColor, sun, m.sunIntensity);
    }
  }

  // ── 6. Animation loop ────────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    oceanMaterial.uniforms.uTime.value = t;
    controls.update(dt, t);

    // Debris rides the same wave model the shader draws
    for (var d = 0; d < debrisSystems.length; d++) {
      var sys = debrisSystems[d];
      var def = sys.def;
      var mesh = sys.mesh;
      var n = mesh.count;
      if (n === 0) continue;
      var dummy = sys.dummy;
      for (var i = 0; i < n; i++) {
        var md = sys.meta[i];
        var x = md.x0 + Math.sin(t * 0.06 + md.phase) * md.drift;
        var z = md.z0 + Math.cos(t * 0.05 + md.phase * 1.3) * md.drift;
        var y =
          waveHeight(x, z, t) * def.float +
          def.lift +
          Math.sin(t * md.speed + md.phase) * 0.04;
        dummy.position.set(x, y, z);
        dummy.rotation.set(
          md.rotX0 + Math.sin(t * 0.3 + md.phase) * 0.12,
          md.rotY0 + t * md.spin,
          md.rotZ0 + Math.cos(t * 0.25 + md.phase) * 0.1
        );
        var pulse = def.pulse ? 1 + 0.1 * Math.sin(t * 1.4 + md.phase) : 1;
        dummy.scale.set(md.scale[0] * pulse, md.scale[1] * pulse, md.scale[2] * pulse);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // GLB hero debris: CI-driven fade + same wave bobbing as the fill
    for (var g = 0; g < glbSystems.length; g++) {
      var sys = glbSystems[g];
      var gd = sys.def;
      var fade = smoothstep(gd.appear[0], gd.appear[1], state.t);
      sys.group.visible = fade > 0.02;
      if (!sys.group.visible) continue;
      for (var mi = 0; mi < sys.mats.length; mi++) {
        var fm = sys.mats[mi];
        fm.opacity = fm.userData.baseOpacity * fade;
      }
      for (var ci = 0; ci < sys.clones.length; ci++) {
        var cl = sys.clones[ci];
        var gx = cl.x0 + Math.sin(t * 0.06 + cl.phase) * cl.drift;
        var gz = cl.z0 + Math.cos(t * 0.05 + cl.phase * 1.3) * cl.drift;
        var gy =
          waveHeight(gx, gz, t) * gd.float +
          gd.lift +
          Math.sin(t * cl.speed + cl.phase) * 0.04;
        cl.obj.position.set(gx, gy, gz);
        cl.obj.rotation.set(
          cl.rotX0 + Math.sin(t * 0.3 + cl.phase) * 0.1,
          cl.rotY0 + t * cl.spin,
          cl.rotZ0 + Math.cos(t * 0.25 + cl.phase) * 0.08
        );
        cl.obj.scale.setScalar(sys.baseScale * cl.scaleJit);
      }
    }

    // Operator-dumped waste bobs too
    for (var j = 0; j < dumpDebris.length; j++) {
      var dd = dumpDebris[j];
      var m2 = dd.mesh;
      m2.position.y =
        waveHeight(m2.position.x, m2.position.z, t) * 0.6 +
        0.06 +
        Math.sin(t * dd.speed + dd.phase) * 0.05;
      m2.rotation.y += dt * 0.2;
    }

    // Falling ash
    if (ashParticles && ashParticles.visible && ashPositions) {
      var N = ashVel.length;
      for (var p = 0; p < N; p++) {
        ashPositions[p * 3 + 1] -= ashVel[p] * dt * 0.9;
        ashPositions[p * 3] += Math.sin(t + p) * dt * 0.15;
        if (ashPositions[p * 3 + 1] < 0.2) {
          ashPositions[p * 3 + 1] = 14 + Math.random() * 8;
          ashPositions[p * 3] = (Math.random() - 0.5) * 70;
          ashPositions[p * 3 + 2] = (Math.random() - 0.5) * 70 - 5;
        }
      }
      ashGeo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  // ── Bootstrap (after all declarations are initialised) ───────────────
  try {
    initThree();
    buildScene();
    bindUI();
    applyState(state);
    animate();
    window.__SEA_STATE_BOOTED = true;
    if (window.__SEA_STATE_BOOT_WATCH) clearTimeout(window.__SEA_STATE_BOOT_WATCH);
    window.__SEA_STATE = {
      glbSystems: glbSystems,
      glbCloneCount: function () {
        var n = 0;
        for (var i = 0; i < glbSystems.length; i++) n += glbSystems[i].clones.length;
        return n;
      },
    };
  } catch (err) {
    console.error(err);
    showError("WebGL / scene init failed: " + (err && err.message ? err.message : String(err)));
  }
})();
