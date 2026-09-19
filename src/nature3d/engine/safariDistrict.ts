// src/nature3d/engine/safariDistrict.ts
//
// THE SAFARI DISTRICT — the Clay Safari world installed as a region inside
// the single connected Sanctuary, rather than as a separate page.
//
// Everything the source project draws at ground level is kept exactly as it
// authors it: the clay terrain skin, the S-bend river, the bridge, the
// instanced vegetation, the lion rock, the perch trees, and all 17 animal
// and prop GLB models at their authored positions, rotations and scales.
//
// What is skipped is everything that is GLOBAL rather than local — the sky
// dome, the smiling sun, the directional light and the clouds. Those already
// exist once in the Sanctuary, and a district must not bring a second set:
// two directional lights would mean two shadow passes and double-lit
// geometry. `buildWorld(..., { district: true })` is the switch for that.
//
// The whole district is parented to one group which is then translated to
// the district's centre, so the source project's local coordinates keep
// working untouched while the district sits 900 m east in world space.

import * as THREE from "three";
import { SAFARI } from "./regions";
// @ts-expect-error — vendored JS from the Clay Safari project, no typings.
import { buildWorld } from "../safari/world.js";
// @ts-expect-error — vendored JS.
import { loadModel } from "../safari/clay.js";
// @ts-expect-error — vendored JS.
import { Creature } from "../safari/animals.js";
// @ts-expect-error — vendored JS.
import { ITEMS } from "../safari/data.js";
// @ts-expect-error — vendored JS.
import { updateTweens } from "../safari/tween.js";

interface SafariUpdater {
  (dt: number, t: number): void;
}

export interface SafariDistrict {
  group: THREE.Group;
  /** Advance the district. Cheap no-op until the models have loaded. */
  update(dt: number, time: number): void;
  dispose(): void;
}

/**
 * Build the safari district and start loading its animals.
 *
 * Model loading is asynchronous and deliberately NOT awaited: the Sanctuary
 * must render its first frame immediately, and the animals pop in over the
 * next moment as their GLBs arrive. A district 900 m away is far outside the
 * opening view anyway, so nothing visible is missing while they load.
 */
export function createSafariDistrict(): SafariDistrict {
  const group = new THREE.Group();
  group.name = "safari-district";
  // The source world is authored around its own origin; move the whole thing
  // into place. Everything inside keeps its authored local coordinates.
  group.position.set(SAFARI.centerX, 0, SAFARI.centerZ);

  const world = buildWorld(group, { isMobile: false, district: true }) as {
    updaters: SafariUpdater[];
  };

  const creatures: { update(dt: number, t: number): void }[] = [];
  let disposed = false;

  // ── Ground animals are not built ─────────────────────────────────────
  //
  // The meadow herd is gone and so is everything standing on the safari
  // floor: the lion on its rock, the snake, giraffe, zebra, crocodile and
  // elephant. Birds stay, as asked, and so does anything that was never
  // standing on the ground in the first place — the perched monkey and the
  // water creatures (hippo, fish), which are not "ground animals".
  //
  // The filter keys off the AUTHORED placement (`y`) rather than a hand-typed
  // list of ids, so a future item added to `data.js` is classified correctly
  // without anyone remembering to update this file. Props are untouched.
  const isGroundAnimal = (item: { kind?: string; y?: unknown; id?: string }) =>
    item.kind === "animal" && (item.y === "ground" || item.y === "rock");

  // Kick off the model loads. Each animal is added the moment it arrives.
  const defs = (ITEMS as { id: string; kind?: string; y?: unknown }[]).filter(
    (item) => !isGroundAnimal(item),
  );
  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i];
    void loadModel(def.id)
      .then((model: THREE.Object3D) => {
        if (disposed) return;
        const c = new Creature(def, model, world, i);
        group.add(c.group);
        creatures.push(c);
      })
      .catch(() => {
        // One missing GLB must never take the district — or the Sanctuary —
        // down. The rest of the safari still builds and is fully walkable.
      });
  }

  return {
    group,
    update(dt, time) {
      for (const u of world.updaters) u(dt, time);
      for (const c of creatures) c.update(dt, time);
      // The source project animates its click reactions through its own tween
      // pool; it has to be pumped or those animations freeze mid-way.
      updateTweens(dt);
    },
    dispose() {
      disposed = true;
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      group.clear();
    },
  };
}

/** Give the Creature class the camera it uses for its distance maths. */
export function setSafariCamera(camera: THREE.Camera) {
  Creature.camera = camera;
}
