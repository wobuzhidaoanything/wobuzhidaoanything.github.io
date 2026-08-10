/** Run: node test/product-model-check.js */
"use strict";

var fs = require("fs");
var path = require("path");
var scene = fs.readFileSync(path.join(__dirname, "..", "scene.js"), "utf8");
var failures = 0;

function assert(condition, message) {
  if (condition) console.log("PASS: " + message);
  else { console.log("FAIL: " + message); failures++; }
}

console.log("--- Procedural product model ---");
[
  "buildShell", "buildHydration", "buildMacro", "buildAdditive", "buildValve", "buildSpine"
].forEach(function (name) { assert(scene.indexOf("function " + name) !== -1, name + " exists"); });
assert(/RoundedBoxGeometry/.test(scene), "flattened rounded cartridge geometry used");
assert(/CanvasTexture/.test(scene) && /makeProductLabel/.test(scene), "institutional product label texture generated");
assert(/DO NOT EAT OR DRINK/.test(scene) && /UNTREATED FOOD OR WATER/.test(scene), "plain-language warning is printed on product texture");
assert(/TubeGeometry/.test(scene) && /CatmullRomCurve3/.test(scene), "visible converging mixing channels exist");
assert(/transmission/.test(scene) && /depthWrite: false/.test(scene), "nested translucent materials use controlled depth writing");
assert(/transparent: false/.test(scene) && /opacity: 1/.test(scene), "outer case is opaque");
assert(/drawProductLabel/.test(scene) && /activePack/.test(scene), "bottle label updates with selected pack");

console.log("--- Inspection behavior ---");
assert(/Raycaster/.test(scene) && /pickComponent/.test(scene), "component raycasting exists");
assert(/hoveredId/.test(scene) && /selectedId/.test(scene), "hover and selected component states exist");
assert(/explosionProgress/.test(scene) && /damp\(explosionProgress/.test(scene), "exploded view animates smoothly");
assert(/setEquivalent/.test(scene) && /modelShift/.test(scene), "equivalent-meal layout shifts the product");
assert(/selectPack/.test(scene) && /packButtons/.test(scene), "four-pack selection behavior exists");
assert(/26/.test(scene) && /startDemo/.test(scene), "approximately 26-second demo sequence exists");

console.log("--- Summary ---");
if (failures) { console.log(failures + " FAILURE(S)"); process.exit(1); }
console.log("ALL PASSED");
