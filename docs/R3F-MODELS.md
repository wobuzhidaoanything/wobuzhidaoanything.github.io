# Furniture models as React Three Fiber components

Most furniture is generated from its category (sofa, table, lamp…) at the product's real size. When that can't
match the product (an unusual shape, curves, a special base) and the store has no 3D file, an agent can build
the shape as a **React Three Fiber (R3F) component**. Only these model files use React. The rest of Roomcraft is
plain JavaScript.

- Tools: `write_model_component` (save and render) and `get_model_component` (read the current source).
- The file is saved as `userdata/models/<id>.jsx` on this computer, and the library item points to it.
- `npm start` compiles it on the fly (esbuild). The app, the walk-through, Photo and the Blender export all use the
  result, just like any other model.

## Contract

```jsx
export default function Model({ width, depth, height, color, colorName, accent }) { … }
```

- **Units:** metres. Build at exactly `width` (x) × `height` (y) × `depth` (z). The app rescales anything more than
  3 % off, but a correct build looks better.
- **Placement:** bottom at y = 0, centred on x and z, and the **front faces +z** (towards the viewer in the front
  render).
- **Colours:** `color` is the chosen colour option (#hex) and `accent` the legs/frame colour (#hex or null).
- **Imports:** only `react`, `three`, `@react-three/fiber` and `@react-three/drei`.
- **Materials:** use `meshStandardMaterial` or `meshPhysicalMaterial` (roughness/metalness), so the Blender export
  and Photo look right.
- **Not allowed:** internet textures, animation (`useFrame`), and text.
- **Useful drei shapes:** `RoundedBox`, `Cylinder`, `Sphere`, `Torus`, `Cone`. For profiles use
  `<latheGeometry args={[points]} />` or `<extrudeGeometry args={[shape, options]} />` with three's `Shape`.

## Example: round pedestal side table

```jsx
import * as THREE from 'three';
import { Cylinder } from '@react-three/drei';

export default function Model({ width, height, color, accent }) {
  const r = width / 2;
  const top = 0.03;
  // Tulip-style base: a lathe profile (radius, height)
  const profile = [
    [0.0, 0], [r * 0.55, 0], [r * 0.52, 0.02], [r * 0.12, height * 0.35], [r * 0.1, height - top], [0, height - top],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return (
    <group>
      <mesh castShadow>
        <latheGeometry args={[profile, 48]} />
        <meshStandardMaterial color={accent || '#f2f0ec'} roughness={0.35} />
      </mesh>
      <Cylinder args={[r, r, top, 64]} position={[0, height - top / 2, 0]} castShadow>
        <meshStandardMaterial color={color} roughness={0.5} />
      </Cylinder>
    </group>
  );
}
```

## Workflow (the vision rule still applies)

1. `read_link` to study every product photo and the description.
2. `add_item` (with `from_url`) for the real size and colours.
3. `write_model_component` with the JSX. If it returns an error, fix it and write again.
4. Look at the renders, compare them with the photos, and improve with `get_model_component` →
   `write_model_component`.
5. `verify_item` with notes.
