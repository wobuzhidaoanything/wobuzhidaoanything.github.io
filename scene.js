/**
 * DIU-7 | Daily Food Intake Unit
 * Procedural Three.js product model, inspection controls and presentation modes.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

(function () {
  "use strict";

  var Data = window.DailyFoodData || window.CivicData;
  if (!Data || Data.validateData().length) {
    showError("Fictional product data could not be validated.");
    return;
  }

  var viewport = document.getElementById("viewport");
  var openingCard = document.getElementById("opening-card");
  var openingDismiss = document.getElementById("opening-dismiss");
  var explodedToggle = document.getElementById("exploded-toggle");
  var explodedLabel = document.getElementById("exploded-label");
  var mealToggle = document.getElementById("meal-toggle");
  var mealLabel = document.getElementById("meal-label");
  var equivalentPanel = document.getElementById("equivalent-panel");
  var tagLayer = document.getElementById("component-tags");
  var componentName = document.getElementById("component-name");
  var componentDescription = document.getElementById("component-description");
  var productOverview = document.getElementById("product-overview");
  var selectedComponent = document.getElementById("selected-component");
  var backOverview = document.getElementById("back-overview");
  var packTitle = document.getElementById("pack-title");
  var packTagline = document.getElementById("pack-tagline");
  var metricEnergy = document.getElementById("m-energy");
  var metricProtein = document.getElementById("m-protein");
  var metricWater = document.getElementById("m-water");
  var metricPrice = document.getElementById("m-price");
  var microSummary = document.getElementById("micro-summary");
  var equivalentPackName = document.getElementById("equivalent-pack-name");
  var equivalentPackPrice = document.getElementById("equivalent-pack-price");
  var equivalentAmounts = {
    grains: document.getElementById("equivalent-grains"),
    protein: document.getElementById("equivalent-protein"),
    vegetables: document.getElementById("equivalent-vegetables"),
    fruit: document.getElementById("equivalent-fruit"),
    water: document.getElementById("equivalent-water"),
  };
  var equivalentFoodWeight = document.getElementById("equivalent-food-weight");
  var equivalentWaterTotal = document.getElementById("equivalent-water-total");
  var mobilePackSelect = document.getElementById("mobile-pack-select");
  var packButtons = Array.prototype.slice.call(document.querySelectorAll(".pack-button"));

  var query = new URLSearchParams(window.location.search);
  var heroMode = query.get("hero") === "1";
  var demoRequested = query.get("demo") === "1";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) document.body.classList.add("reduced-motion");
  if (heroMode) document.body.classList.add("hero-mode");

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(viewport.clientWidth, Math.max(viewport.clientHeight, 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("aria-label", "Rotatable three-dimensional DIU-7 product model");
  viewport.insertBefore(renderer.domElement, viewport.firstChild);

  var scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.Fog(0x090c0a, 11, 22);

  var camera = new THREE.PerspectiveCamera(38, viewport.clientWidth / Math.max(viewport.clientHeight, 1), 0.1, 60);
  camera.position.set(5.05, 2.55, 6.7);

  var controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.05, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minDistance = 6.0;
  controls.maxDistance = 9.6;
  controls.minPolarAngle = 0.72;
  controls.maxPolarAngle = 1.72;
  controls.minAzimuthAngle = -1.05;
  controls.maxAzimuthAngle = 1.05;
  controls.zoomSpeed = 0.72;
  controls.rotateSpeed = 0.58;
  controls.update();

  var clock = new THREE.Clock();
  var elapsed = 0;
  var modelRoot = new THREE.Group();
  modelRoot.name = "DIU-7";
  modelRoot.rotation.y = -0.12;
  scene.add(modelRoot);

  var componentGroups = new Map();
  var interactiveMeshes = [];
  var tagElements = new Map();
  var selectedId = null;
  var activePack = Data.getPack("basic");
  var labelCanvas = null;
  var labelContext = null;
  var labelTexture = null;
  var accentMaterials = [];
  var hoveredId = null;
  var exploded = false;
  var explosionProgress = 0;
  var equivalentVisible = false;
  var modelShift = 0;
  var modelScale = 1;
  var userHasInteracted = false;
  var downPoint = new THREE.Vector2();
  var demoActive = false;
  var demoStart = 0;
  var demoSegment = -1;
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();

  initEnvironment();
  buildDIU();
  buildTags();
  bindInterface();
  selectPack("basic");
  showOverview();
  applyCameraPreset(heroMode);
  onResize();

  if (heroMode || demoRequested) dismissOpening();
  if (demoRequested && !reduceMotion) startDemo();

  clearTimeout(window.__DAILY_FOOD_BOOT_WATCH);
  clearTimeout(window.__CIVIC_BOOT_WATCH);
  window.__DAILY_FOOD_BOOTED = true;
  window.__CIVIC_BOOTED = true;
  var bootBanner = document.getElementById("error-banner");
  if (bootBanner) {
    bootBanner.style.display = "none";
    bootBanner.textContent = "";
  }
  renderer.setAnimationLoop(render);

  function initEnvironment() {
    RectAreaLightUniformsLib.init();
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.03).texture;
    pmrem.dispose();

    var hemi = new THREE.HemisphereLight(0xe5eee7, 0x202820, 1.1);
    scene.add(hemi);

    var key = new THREE.RectAreaLight(0xf3f1e5, 4.8, 4.8, 6.0);
    key.position.set(-4.2, 5.4, 5.1);
    key.lookAt(0, 0.1, 0);
    scene.add(key);

    var fill = new THREE.RectAreaLight(0xaec9c3, 1.9, 3.0, 4.2);
    fill.position.set(4.7, 1.4, 4.0);
    fill.lookAt(0, -0.2, 0);
    scene.add(fill);

    var rim = new THREE.SpotLight(0xcde4dc, 17, 18, Math.PI * 0.16, 0.7, 1.6);
    rim.position.set(-1.6, 4.8, -5.6);
    rim.target.position.set(0, 0.2, 0);
    scene.add(rim, rim.target);

    var shadowLight = new THREE.SpotLight(0xf5f0df, 11, 15, Math.PI * 0.24, 0.6, 1.8);
    shadowLight.position.set(-3.2, 5.3, 4.1);
    shadowLight.target.position.set(0, -0.6, 0);
    shadowLight.castShadow = true;
    shadowLight.shadow.mapSize.set(1024, 1024);
    shadowLight.shadow.bias = -0.00015;
    scene.add(shadowLight, shadowLight.target);

    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ color: 0x0b0e0c, roughness: 0.92, metalness: 0.02 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.23;
    floor.receiveShadow = true;
    scene.add(floor);

    var grid = new THREE.GridHelper(18, 36, 0x617068, 0x354039);
    grid.position.y = -2.215;
    grid.material.transparent = true;
    grid.material.opacity = 0.1;
    grid.material.depthWrite = false;
    scene.add(grid);

    var plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.72, 0.14, 64),
      new THREE.MeshStandardMaterial({ color: 0x161b18, roughness: 0.56, metalness: 0.16 })
    );
    plinth.position.y = -2.15;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);

    var plinthRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.012, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x87968c, transparent: true, opacity: 0.3 })
    );
    plinthRing.rotation.x = Math.PI / 2;
    plinthRing.position.y = -2.07;
    scene.add(plinthRing);
  }

  function physical(options) {
    var material = new THREE.MeshPhysicalMaterial(options);
    material.userData.baseOpacity = material.opacity;
    material.userData.baseColor = material.color.clone();
    material.userData.baseEmissive = material.emissive.clone();
    return material;
  }

  function standard(options) {
    var material = new THREE.MeshStandardMaterial(options);
    material.userData.baseOpacity = material.opacity;
    material.userData.baseColor = material.color.clone();
    material.userData.baseEmissive = material.emissive.clone();
    return material;
  }

  function basic(options) {
    var material = new THREE.MeshBasicMaterial(options);
    material.userData.baseOpacity = material.opacity;
    material.userData.baseColor = material.color.clone();
    return material;
  }

  function rounded(w, h, d, radius, material, x, y, z) {
    var mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 5, radius), material);
    mesh.position.set(x || 0, y || 0, z || 0);
    return mesh;
  }

  function buildDIU() {
    buildShell();
    buildHydration();
    buildMacro();
    buildAdditive();
    buildValve();
    buildSpine();

    componentGroups.forEach(function (group) {
      modelRoot.add(group);
    });
  }

  function buildShell() {
    var group = new THREE.Group();
    group.name = "Outer Protective Case";
    var shellMat = physical({
      color: 0x9ca79f,
      roughness: 0.36,
      metalness: 0.0,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    var edgeMat = physical({ color: 0x727e75, roughness: 0.42, transparent: false, opacity: 1, depthWrite: true });

    var rear = rounded(1.98, 3.55, 0.1, 0.25, shellMat.clone(), 0, -0.13, -0.38);
    rear.renderOrder = 2;
    group.add(rear);

    var front = rounded(1.98, 3.55, 0.075, 0.25, shellMat, 0, -0.13, 0.43);
    front.renderOrder = 20;
    group.add(front);

    var leftRailTop = rounded(0.17, 1.42, 0.62, 0.075, edgeMat.clone(), -0.91, 0.91, 0.02);
    var leftRailBottom = rounded(0.17, 1.55, 0.62, 0.075, edgeMat.clone(), -0.91, -1.14, 0.02);
    leftRailTop.rotation.z = -0.025;
    leftRailBottom.rotation.z = 0.035;
    group.add(leftRailTop, leftRailBottom);

    var bottomEdge = rounded(1.72, 0.14, 0.62, 0.06, edgeMat.clone(), 0, -1.84, 0.02);
    var shoulderLeft = rounded(1.15, 0.18, 0.62, 0.07, edgeMat.clone(), -0.35, 1.63, 0.02);
    shoulderLeft.rotation.z = -0.035;
    group.add(bottomEdge, shoulderLeft);

    var sealMaterial = standard({ color: 0x9fc6c4, roughness: 0.42 });
    accentMaterials.push(sealMaterial);
    var sealDot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 28), sealMaterial);
    sealDot.rotation.x = Math.PI / 2;
    sealDot.position.set(-0.74, 1.47, 0.5);
    group.add(sealDot);

    var label = makeProductLabel();
    label.userData.pickThrough = true;
    group.add(label);
    registerComponent("shell", group, new THREE.Vector3(-0.72, 1.42, 0.46));
  }

  function buildHydration() {
    var group = new THREE.Group();
    group.name = "Water Compartment";
    var chamberMat = physical({
      color: 0x83c5c7,
      roughness: 0.12,
      metalness: 0.0,
      transmission: 0.38,
      transparent: true,
      opacity: 0.64,
      thickness: 0.42,
      ior: 1.34,
      clearcoat: 0.42,
      clearcoatRoughness: 0.18,
      depthWrite: false,
    });
    var chamber = rounded(1.04, 2.77, 0.48, 0.19, chamberMat, -0.34, -0.27, 0.02);
    chamber.renderOrder = 5;
    group.add(chamber);

    var liquidMat = physical({
      color: 0x68afb5,
      roughness: 0.18,
      transmission: 0.18,
      transparent: true,
      opacity: 0.46,
      thickness: 0.3,
      depthWrite: false,
    });
    var liquid = rounded(0.9, 2.58, 0.35, 0.16, liquidMat, -0.34, -0.34, 0.05);
    liquid.renderOrder = 4;
    liquid.userData.liquid = true;
    group.add(liquid);

    var meniscus = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.035, 36), basic({ color: 0xd6eeea, transparent: true, opacity: 0.35 }));
    meniscus.scale.x = 1.05;
    meniscus.scale.z = 0.42;
    meniscus.position.set(-0.34, 0.88, 0.2);
    group.add(meniscus);

    registerComponent("hydration", group, new THREE.Vector3(-0.35, 0.1, 0.28));
  }

  function buildMacro() {
    var group = new THREE.Group();
    group.name = "Daily Food Mixture";
    var caseMat = physical({ color: 0xd9d1bd, roughness: 0.28, metalness: 0.0, clearcoat: 0.28, clearcoatRoughness: 0.24 });
    var matrix = rounded(0.58, 2.1, 0.5, 0.17, caseMat, 0.48, -0.46, 0.08);
    matrix.castShadow = true;
    group.add(matrix);

    var pearl = rounded(0.46, 1.92, 0.07, 0.12, physical({ color: 0xeee7d5, roughness: 0.2, clearcoat: 0.18 }), 0.48, -0.45, 0.35);
    group.add(pearl);

    var gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.055), basic({ color: 0x8e998f, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    gauge.position.set(0.48, -1.18, 0.391);
    group.add(gauge);
    registerComponent("macro", group, new THREE.Vector3(0.48, -0.35, 0.38));
  }

  function buildAdditive() {
    var group = new THREE.Group();
    group.name = "Vitamin and Mineral Cartridge";
    var casing = rounded(0.52, 0.74, 0.46, 0.09, standard({ color: 0x3b443e, roughness: 0.37, metalness: 0.08 }), 0.48, 0.96, 0.08);
    casing.castShadow = true;
    group.add(casing);

    var insert = rounded(0.35, 0.52, 0.04, 0.045, physical({ color: 0xc9d0c9, roughness: 0.32, transparent: true, opacity: 0.82 }), 0.48, 0.96, 0.33);
    group.add(insert);

    var doseMaterial = basic({ color: 0x9fc6c4, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    accentMaterials.push(doseMaterial);
    var doseLine = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.035), doseMaterial);
    doseLine.position.set(0.48, 1.08, 0.36);
    group.add(doseLine);
    registerComponent("additive", group, new THREE.Vector3(0.48, 1.0, 0.38));
  }

  function buildValve() {
    var group = new THREE.Group();
    group.name = "Mouthpiece and Mixer";
    var tubeMat = physical({ color: 0xb8c9c2, roughness: 0.18, transparent: true, opacity: 0.65, depthWrite: false });
    var hydrationPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.34, 1.11, 0.02),
      new THREE.Vector3(-0.3, 1.47, 0.08),
      new THREE.Vector3(-0.12, 1.7, 0.08),
      new THREE.Vector3(0.0, 1.79, 0.08),
    ]);
    var macroPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.48, 0.62, 0.09),
      new THREE.Vector3(0.44, 1.4, 0.08),
      new THREE.Vector3(0.16, 1.72, 0.08),
      new THREE.Vector3(0.02, 1.79, 0.08),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(hydrationPath, 34, 0.07, 14, false), tubeMat));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(macroPath, 38, 0.055, 14, false), tubeMat.clone()));

    var valveMat = standard({ color: 0x343d37, roughness: 0.35, metalness: 0.05 });
    var manifold = rounded(0.58, 0.34, 0.48, 0.11, valveMat, 0.0, 1.82, 0.05);
    manifold.castShadow = true;
    group.add(manifold);

    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.38, 32), valveMat.clone());
    neck.position.set(0.02, 2.12, 0.03);
    neck.rotation.z = -0.04;
    neck.castShadow = true;
    group.add(neck);

    var seal = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.09, 32), standard({ color: 0x97a69c, roughness: 0.48 }));
    seal.position.set(0.03, 2.32, 0.03);
    seal.rotation.z = -0.04;
    group.add(seal);

    var mouthpiece = rounded(0.28, 0.34, 0.31, 0.08, physical({ color: 0xb7c4ba, roughness: 0.26, transparent: true, opacity: 0.88 }), 0.05, 2.52, 0.03);
    mouthpiece.rotation.z = -0.08;
    group.add(mouthpiece);
    registerComponent("valve", group, new THREE.Vector3(0.05, 2.2, 0.25));
  }

  function buildSpine() {
    var group = new THREE.Group();
    group.name = "Side Grip and Frame";
    var spineMat = standard({ color: 0x252d28, roughness: 0.47, metalness: 0.05 });
    var upper = rounded(0.24, 1.48, 0.48, 0.08, spineMat, 0.92, 0.91, -0.08);
    upper.rotation.z = 0.025;
    var lower = rounded(0.24, 1.66, 0.48, 0.08, spineMat.clone(), 0.92, -1.08, -0.08);
    lower.rotation.z = -0.035;
    upper.castShadow = lower.castShadow = true;
    group.add(upper, lower);

    var gripTop = rounded(0.13, 0.36, 0.52, 0.05, standard({ color: 0x526058, roughness: 0.55 }), 0.9, 0.04, -0.06);
    var batch = rounded(0.15, 0.52, 0.055, 0.025, standard({ color: 0x7d8b81, roughness: 0.42 }), 0.93, -0.82, 0.205);
    group.add(gripTop, batch);
    registerComponent("spine", group, new THREE.Vector3(0.92, 0.25, -0.12));
  }

  function registerComponent(id, group, anchor) {
    var data = Data.getComponent(id);
    group.userData.componentId = id;
    group.userData.exploded = new THREE.Vector3(data.exploded[0], data.exploded[1], data.exploded[2]);
    group.userData.anchor = anchor;
    group.traverse(function (object) {
      if (!object.isMesh) return;
      object.userData.componentId = id;
      object.castShadow = object.castShadow || (!object.material.transparent || object.material.opacity > 0.45);
      if (!object.userData.pickThrough) interactiveMeshes.push(object);
      var material = object.material;
      if (material && material.userData.baseColor && !material.userData.baseColor.isColor) {
        material.userData.baseColor = new THREE.Color(
          material.userData.baseColor.r,
          material.userData.baseColor.g,
          material.userData.baseColor.b
        );
      }
      if (material && material.userData.baseEmissive && !material.userData.baseEmissive.isColor) {
        material.userData.baseEmissive = new THREE.Color(
          material.userData.baseEmissive.r,
          material.userData.baseEmissive.g,
          material.userData.baseEmissive.b
        );
      }
      if (material && !material.userData.baseColor && material.color) material.userData.baseColor = material.color.clone();
      if (material && material.userData.baseOpacity === undefined) material.userData.baseOpacity = material.opacity;
      if (material && material.emissive && !material.userData.baseEmissive) material.userData.baseEmissive = material.emissive.clone();
    });
    componentGroups.set(id, group);
  }

  function makeProductLabel() {
    labelCanvas = document.createElement("canvas");
    labelCanvas.width = 900;
    labelCanvas.height = 1600;
    labelContext = labelCanvas.getContext("2d");
    drawProductLabel(activePack);

    labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    labelTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    var material = basic({ map: labelTexture, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide });
    var label = new THREE.Mesh(new THREE.PlaneGeometry(1.57, 2.8), material);
    label.position.set(-0.03, -0.12, 0.481);
    label.renderOrder = 32;
    return label;
  }

  function drawProductLabel(pack) {
    if (!labelContext || !labelCanvas) return;
    var ctx = labelContext;
    ctx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    ctx.fillStyle = "rgba(15,20,17,0.94)";
    ctx.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
    ctx.fillStyle = pack.accent;
    ctx.fillRect(0, 0, 24, labelCanvas.height);
    ctx.fillStyle = "#f1f4ef";
    ctx.strokeStyle = "rgba(241,244,239,0.5)";
    ctx.lineWidth = 3;

    ctx.font = "600 30px Arial";
    ctx.fillText("DAILY FOOD & WATER SERVICE", 62, 86);
    ctx.beginPath(); ctx.moveTo(62, 118); ctx.lineTo(838, 118); ctx.stroke();

    ctx.font = "700 142px Arial";
    ctx.fillText("DIU-7", 54, 300);
    ctx.fillStyle = pack.accent;
    ctx.font = "700 42px Arial";
    ctx.fillText(pack.name, 62, 370);

    ctx.fillStyle = "#f1f4ef";
    ctx.font = "600 34px Arial";
    ctx.fillText("ONE DAY | FOOD + WATER", 62, 470);
    ctx.beginPath(); ctx.moveTo(62, 510); ctx.lineTo(838, 510); ctx.stroke();

    ctx.font = "700 54px Arial";
    ctx.fillText(pack.energyKcal.toLocaleString("en-US") + " CALORIES", 62, 620);
    ctx.fillText(pack.proteinG + " G PROTEIN", 62, 705);
    ctx.fillText(pack.hydrationL.toFixed(1) + " L WATER", 62, 790);

    ctx.font = "600 31px monospace";
    ctx.fillText("USE WITHIN 24 HOURS", 62, 920);
    ctx.fillText("SINGAPORE | 2074", 62, 978);

    ctx.strokeStyle = pack.accent;
    ctx.strokeRect(62, 1165, 776, 190);
    ctx.fillStyle = "#f1f4ef";
    ctx.font = "700 28px Arial";
    ctx.fillText("DO NOT EAT OR DRINK", 90, 1238);
    ctx.fillText("UNTREATED FOOD OR WATER", 90, 1292);

    ctx.fillStyle = "rgba(241,244,239,0.7)";
    ctx.font = "500 24px monospace";
    ctx.fillText(pack.code + " | ONE UNIT", 62, 1490);
    if (labelTexture) labelTexture.needsUpdate = true;
  }

  function buildTags() {
    Data.COMPONENTS.forEach(function (component) {
      var tag = document.createElement("div");
      tag.className = "component-tag";
      tag.dataset.component = component.id;
      tag.textContent = component.shortLabel;
      tagLayer.appendChild(tag);
      tagElements.set(component.id, tag);
    });
  }

  function bindInterface() {
    openingDismiss.addEventListener("click", function () {
      dismissOpening();
      renderer.domElement.focus();
    });
    explodedToggle.addEventListener("click", function () {
      stopDemoForUser();
      setExploded(!exploded);
    });
    mealToggle.addEventListener("click", function () {
      stopDemoForUser();
      setEquivalent(!equivalentVisible);
    });
    packButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        stopDemoForUser();
        selectPack(button.dataset.pack);
      });
    });
    mobilePackSelect.addEventListener("change", function () {
      stopDemoForUser();
      selectPack(mobilePackSelect.value);
    });
    backOverview.addEventListener("click", showOverview);
    controls.addEventListener("start", stopDemoForUser);
    controls.addEventListener("change", function () {
      userHasInteracted = true;
    });

    renderer.domElement.addEventListener("pointerdown", function (event) {
      downPoint.set(event.clientX, event.clientY);
    });
    renderer.domElement.addEventListener("pointermove", function (event) {
      updatePointer(event);
      var picked = pickComponent();
      hoveredId = picked;
      renderer.domElement.style.cursor = picked ? "pointer" : "grab";
    });
    renderer.domElement.addEventListener("pointerleave", function () {
      hoveredId = null;
      renderer.domElement.style.cursor = "grab";
    });
    renderer.domElement.addEventListener("pointerup", function (event) {
      if (Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y) > 6) return;
      updatePointer(event);
      var picked = pickComponent();
      if (picked) {
        stopDemoForUser();
        selectComponent(picked);
      }
    });

    window.addEventListener("keydown", function (event) {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
      if (event.key === "e" || event.key === "E") {
        event.preventDefault(); stopDemoForUser(); setExploded(!exploded);
      } else if (event.key === "m" || event.key === "M") {
        event.preventDefault(); stopDemoForUser(); setEquivalent(!equivalentVisible);
      } else if (event.key === "h" || event.key === "H") {
        event.preventDefault(); stopDemoForUser(); applyHeroState();
      } else if (event.key === "d" || event.key === "D") {
        event.preventDefault(); startDemo();
      } else if (event.key === "Escape") {
        if (!openingCard.classList.contains("hidden")) dismissOpening();
        else if (equivalentVisible) setEquivalent(false);
        else if (exploded) setExploded(false);
      }
    });
    window.addEventListener("resize", onResize);
  }

  function updatePointer(event) {
    var rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickComponent() {
    if (equivalentVisible) return null;
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(interactiveMeshes, false);
    if (!hits.length) return null;
    if (!exploded) {
      for (var i = 0; i < hits.length; i++) {
        if (hits[i].object.userData.componentId === "shell") return "shell";
      }
      return null;
    }
    return hits[0].object.userData.componentId || null;
  }

  function selectComponent(id) {
    selectedId = Data.getComponent(id).id;
    var data = Data.getComponent(selectedId);
    componentName.textContent = data.name;
    componentDescription.textContent = componentCopy(selectedId);
    productOverview.hidden = true;
    selectedComponent.hidden = false;
    tagElements.forEach(function (element, tagId) {
      element.classList.toggle("selected", tagId === selectedId);
    });
  }

  function componentCopy(id) {
    if (id === "hydration") {
      return "Stores " + activePack.internalWaterL.toFixed(1) + " L of purified water. The food mixture supplies the rest of the pack’s " + activePack.hydrationL.toFixed(1) + " L water total.";
    }
    if (id === "macro") {
      return "Contains " + activePack.energyKcal.toLocaleString("en-US") + " calories, " + activePack.proteinG + " g protein, " + activePack.carbohydrateG + " g carbohydrate, " + activePack.lipidG + " g fat and " + activePack.fibreG + " g fibre.";
    }
    if (id === "additive") return activePack.micronutrientLabel + ".";
    return Data.getComponent(id).description;
  }

  function showOverview() {
    selectedId = null;
    productOverview.hidden = false;
    selectedComponent.hidden = true;
    tagElements.forEach(function (element) { element.classList.remove("selected"); });
  }

  function selectPack(id) {
    activePack = Data.getPack(id);
    var equivalentMeal = Data.getEquivalentMeal(activePack.id);
    document.documentElement.style.setProperty("--accent", activePack.accent);
    packTitle.textContent = activePack.name;
    packTagline.textContent = activePack.tagline;
    metricEnergy.textContent = activePack.energyKcal.toLocaleString("en-US");
    metricProtein.textContent = activePack.proteinG + " g";
    metricWater.textContent = activePack.hydrationL.toFixed(1) + " L";
    metricPrice.textContent = "S$" + activePack.priceSGD.toFixed(2) + " / day";
    microSummary.textContent = activePack.micronutrientLabel + ".";
    equivalentPackName.textContent = activePack.name.replace(" PACK", "") + " PACK";
    equivalentPackPrice.textContent = "S$" + activePack.priceSGD.toFixed(2) + " / day";
    Object.keys(equivalentAmounts).forEach(function (itemId) {
      equivalentAmounts[itemId].textContent = (itemId === "water" ? "" : "≈") + equivalentMeal.amounts[itemId];
    });
    equivalentFoodWeight.textContent = "≈" + (equivalentMeal.foodWeightG / 1000).toFixed(2) + " kg";
    equivalentWaterTotal.textContent = equivalentMeal.amounts.water;
    mobilePackSelect.value = activePack.id;
    packButtons.forEach(function (button) {
      var isActive = button.dataset.pack === activePack.id;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    accentMaterials.forEach(function (material) {
      material.color.set(activePack.accent);
      if (material.userData.baseColor) material.userData.baseColor.set(activePack.accent);
    });
    drawProductLabel(activePack);
    if (selectedId) componentDescription.textContent = componentCopy(selectedId);
  }

  function setExploded(value, fromDemo) {
    exploded = Boolean(value);
    if (exploded && equivalentVisible) setEquivalent(false, true);
    explodedToggle.classList.toggle("active", exploded);
    explodedToggle.setAttribute("aria-pressed", String(exploded));
    explodedLabel.textContent = exploded ? "Close unit" : "See what’s inside";
    if (!exploded) showOverview();
    if (!fromDemo) userHasInteracted = true;
  }

  function setEquivalent(value, fromDemo) {
    equivalentVisible = Boolean(value);
    if (equivalentVisible && exploded) setExploded(false, true);
    equivalentPanel.classList.toggle("visible", equivalentVisible);
    equivalentPanel.setAttribute("aria-hidden", String(!equivalentVisible));
    mealToggle.classList.toggle("active", equivalentVisible);
    mealToggle.setAttribute("aria-pressed", String(equivalentVisible));
    mealLabel.textContent = equivalentVisible ? "Back to DIU-7" : "Compare with regular food";
    if (!fromDemo) userHasInteracted = true;
  }

  function dismissOpening() {
    openingCard.classList.add("hidden");
    openingCard.setAttribute("aria-hidden", "true");
  }

  function applyCameraPreset(isHero) {
    var narrow = viewport.clientWidth < 620;
    if (isHero) camera.position.set(narrow ? 5.8 : 4.75, 2.35, narrow ? 7.7 : 6.25);
    else camera.position.set(narrow ? 5.9 : 5.05, 2.55, narrow ? 7.8 : 6.7);
    controls.target.set(0, 0.04, 0);
    controls.update();
  }

  function applyHeroState() {
    setEquivalent(false, true);
    setExploded(false, true);
    showOverview();
    applyCameraPreset(true);
    modelRoot.rotation.y = -0.12;
    document.body.classList.add("hero-mode");
    dismissOpening();
  }

  function startDemo() {
    if (reduceMotion) return;
    demoActive = true;
    demoStart = elapsed;
    demoSegment = -1;
    userHasInteracted = false;
    dismissOpening();
    document.body.classList.remove("hero-mode");
    applyCameraPreset(false);
  }

  function stopDemoForUser() {
    if (demoActive) demoActive = false;
    userHasInteracted = true;
  }

  function updateDemo() {
    if (!demoActive) return;
    var t = (elapsed - demoStart) % 26;
    var segment = t < 4 ? 0 : t < 9 ? 1 : t < 13 ? 2 : t < 16 ? 3 : t < 21 ? 4 : t < 25 ? 5 : 6;
    if (segment !== demoSegment) {
      demoSegment = segment;
      if (segment === 0) { setEquivalent(false, true); setExploded(false, true); showOverview(); }
      if (segment === 1) setExploded(true, true);
      if (segment === 2) selectComponent("macro");
      if (segment === 3) setExploded(false, true);
      if (segment === 4) setEquivalent(true, true);
      if (segment === 5) { setEquivalent(false, true); selectComponent("valve"); }
      if (segment === 6) { applyHeroState(); demoStart = elapsed + 1; }
    }
    if (segment === 0 || segment === 5) modelRoot.rotation.y += 0.0016;
  }

  function updateComponents(dt) {
    var targetExplosion = exploded ? 1 : 0;
    explosionProgress = reduceMotion ? targetExplosion : THREE.MathUtils.damp(explosionProgress, targetExplosion, 4.4, dt);
    if (Math.abs(explosionProgress - targetExplosion) < 0.001) explosionProgress = targetExplosion;
    var eased = explosionProgress * explosionProgress * (3 - 2 * explosionProgress);

    componentGroups.forEach(function (group, id) {
      var destination = group.userData.exploded;
      group.position.set(destination.x * eased, destination.y * eased, destination.z * eased);
      var strength = id === selectedId ? 1 : id === hoveredId ? 0.5 : 0;
      group.traverse(function (object) {
        if (!object.isMesh || !object.material) return;
        var material = object.material;
        var baseOpacity = material.userData.baseOpacity === undefined ? 1 : material.userData.baseOpacity;
        var opacityTarget = Math.min(1, baseOpacity * (1 + strength * 0.3));
        material.opacity = THREE.MathUtils.damp(material.opacity, opacityTarget, 12, dt);
        if (material.color && material.userData.baseColor) {
          var highlightColor = id === "hydration" ? new THREE.Color(0xc8eeeb) : new THREE.Color(0xf1eee1);
          var colorTarget = material.userData.baseColor.clone().lerp(highlightColor, strength * 0.12);
          material.color.lerp(colorTarget, 1 - Math.exp(-dt * 12));
        }
        if (material.emissive && material.userData.baseEmissive) {
          var emissiveTarget = material.userData.baseEmissive.clone().lerp(new THREE.Color(0x4a5b50), strength * 0.22);
          material.emissive.lerp(emissiveTarget, 1 - Math.exp(-dt * 12));
          material.emissiveIntensity = strength * 0.25;
        }
      });
    });

    var narrowViewport = window.innerWidth < 780;
    var shiftTarget = equivalentVisible ? (narrowViewport ? 0 : -1.42) : (exploded ? (narrowViewport ? 0.22 : 0.06) : 0);
    var scaleTarget = equivalentVisible ? (narrowViewport ? 0.68 : 0.78) : (exploded ? (narrowViewport ? 0.58 : 0.84) : 1);
    modelShift = reduceMotion ? shiftTarget : THREE.MathUtils.damp(modelShift, shiftTarget, 4.2, dt);
    modelScale = reduceMotion ? scaleTarget : THREE.MathUtils.damp(modelScale, scaleTarget, 4.2, dt);
    modelRoot.position.x = modelShift;
    modelRoot.scale.setScalar(modelScale);
  }

  function updateTags() {
    var rect = viewport.getBoundingClientRect();
    componentGroups.forEach(function (group, id) {
      var element = tagElements.get(id);
      var point = group.userData.anchor.clone();
      group.localToWorld(point);
      point.project(camera);
      var x = (point.x * 0.5 + 0.5) * rect.width;
      var y = (-point.y * 0.5 + 0.5) * rect.height;
      element.style.left = x.toFixed(1) + "px";
      element.style.top = y.toFixed(1) + "px";
      var shouldShow = explosionProgress > 0.72 && !equivalentVisible;
      element.classList.toggle("visible", shouldShow && point.z < 1);
    });
  }

  function updateSubtleMotion(dt) {
    if (!userHasInteracted && !demoActive && !equivalentVisible && !exploded && !reduceMotion) {
      var idleTarget = -0.12 + Math.sin(elapsed * 0.24) * 0.045;
      modelRoot.rotation.y = THREE.MathUtils.damp(modelRoot.rotation.y, idleTarget, 1.5, dt);
    }
  }

  function render() {
    var dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    updateDemo();
    updateComponents(dt);
    updateSubtleMotion(dt);
    controls.update();
    modelRoot.updateMatrixWorld(true);
    updateTags();
    renderer.render(scene, camera);
  }

  function onResize() {
    var width = Math.max(viewport.clientWidth, 1);
    var height = Math.max(viewport.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function showError(message) {
    var banner = document.getElementById("error-banner");
    if (banner) {
      banner.style.display = "block";
      banner.textContent = "DAILY FOOD SERVICE | DISPLAY FAULT\n\n" + message;
    }
  }
})();
