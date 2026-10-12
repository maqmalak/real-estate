/* ------------------------------------------------------------------ *
 * Hero city — the animated business-park scene at the centre of the hero
 * honeycomb, one building per industry the ERP actually serves: office and
 * institutional towers, a shipping-container yard, a distribution
 * warehouse, a factory with smoking chimneys, a textile mill with spinning
 * thread bobbins, a garment hanger line, a hospital with a pulsing cross,
 * a restaurant with a steaming vent and a school with a mortarboard on the
 * roof — with delivery trucks looping the perimeter. Not construction-
 * specific, unlike the site this hero was
 * ported from. Same 5x5 plot layout, camera and light/dark palettes as
 * that port; Three.js is the project's own vendored build and is imported
 * lazily so it only loads when the hero is actually shown.
 * ------------------------------------------------------------------ */

export interface CityHandle {
  setDark(dark: boolean): void;
  dispose(): void;
}

interface Palette {
  bldg: number[];
  edge: number;
  glow: number[];
  container: number[];
  particle: number;
  grid: number;
  truck: number;
  smoke: number;
  steam: number;
  cross: number;
  thread: number[];
}

const LIGHT: Palette = {
  bldg: [0xedeef0, 0xe8eaec, 0xf2f3f5],
  edge: 0x0b1220,
  glow: [0x2d5e8e, 0x3c6fa0, 0x244c74],
  container: [0x3c6fa0, 0xc2703d, 0x2d8a6e],
  particle: 0x3c6fa0,
  grid: 0x2d5e8e,
  truck: 0x244c74,
  smoke: 0x8a8f98,
  steam: 0xf3f4f6,
  cross: 0xdc2626,
  thread: [0xc2703d, 0x3c6fa0, 0xd4b93c, 0x2d8a6e],
};

const DARK: Palette = {
  bldg: [0x152238, 0x0f1d33, 0x1a2a45],
  edge: 0xeff6ff,
  glow: [0x38bdf8, 0x7dd3fc, 0x60a5fa],
  container: [0x38bdf8, 0xf0a35a, 0x4ade9a],
  particle: 0x38bdf8,
  grid: 0x38bdf8,
  truck: 0x7dd3fc,
  // Light grey-blue, not the mid-grey used in the light theme: against this scene's
  // near-black backdrop a mid-grey barely lifts off the background, so ash needs to
  // go the other way in luminance from its light-theme value, not just invert hue.
  smoke: 0xb8c2cf,
  steam: 0xcbd5e1,
  cross: 0xf87171,
  thread: [0xf0a35a, 0x7dd3fc, 0xf3d96b, 0x4ade9a],
};

const GRID = 5;
const PLOT = 4.6;
const BUILD_W = 2.3;
const FLOOR_H = 0.75;
// 0 = perimeter (no plot here — the truck route passes by), 1 = generic mixed
// building (the plainest, tallest-reaching kind — kept toward the back, see
// LAYOUT below), 2 = office / institutional tower (currently unused —
// replaced everywhere by a second instance of one of the industry kinds
// below, for more variety across the scene), 3 = container stack, 4 = branch
// outlet, 5 = distribution warehouse, 6 = factory (smoking chimneys),
// 7 = garment hanger line, 8 = textile mill (spinning thread bobbins),
// 9 = hospital (pulsing cross), 10 = restaurant (steaming vent + awning),
// 11 = school (mortarboard, swaying tassel). The industry buildings sit
// toward the front (higher i/j = nearer the camera, see camera.position
// below) so their decorations read at a glance; the plain kind-1 buildings —
// the closest thing left to a "tower" — are pushed toward the back instead.
// Exactly one of each industry kind (6-11) — the duplicates from an earlier pass
// are reverted to plain kind-1 buildings.
const LAYOUT = [
  [1, 1, 4, 8, 3],
  [1, 5, 1, 1, 7],
  [4, 1, 3, 1, 5],
  [1, 9, 10, 4, 0],
  [3, 6, 5, 0, 11],
];
const PARTICLES = 180;
const SMOKE_PARTICLES = 120;

function cellFloors(i: number, j: number, kind: number): number {
  const n = Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453);
  const frac = n - Math.floor(n);
  if (kind === 2) return Math.max(10, Math.round(12 + frac * 6));
  if (kind === 3) return Math.max(2, Math.round(2 + frac * 2)); // containers stacked, not floors
  if (kind === 4) return Math.max(2, Math.round(2 + frac * 2));
  if (kind === 5 || kind === 6) return Math.max(3, Math.round(3 + frac * 3));
  if (kind === 7 || kind === 8 || kind === 9 || kind === 10 || kind === 11) return Math.max(2, Math.round(2 + frac * 2));
  // Generic "mixed" plots (kind 1): capped well below the old 10-floor ceiling so
  // none of them reads as a stray sky tower or blocks a shorter industry building
  // near it — the tallest things in the scene are now the factory chimneys.
  return Math.max(2, Math.round(2 + frac * 4));
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
/** Smooth back-and-forth between -1 and 1, no snapping at the ends. */
const pingPong = (t: number) => Math.asin(Math.sin(t)) / (Math.PI / 2);

/** Shown in the hover tooltip; keyed by the LAYOUT kind number. */
const KIND_LABEL: Record<number, string> = {
  1: "Office",
  3: "Container Yard",
  4: "Branch Outlet",
  5: "Distribution Warehouse",
  6: "Factory",
  7: "Garment Hanger Line",
  8: "Textile Mill",
  9: "Hospital",
  10: "Restaurant",
  11: "School",
};

/**
 * Starts the scene on `canvas`. Rejects when WebGL is unavailable so the
 * caller can fall back to the static skyline.
 */
export async function startHeroCity(canvas: HTMLCanvasElement): Promise<CityHandle> {
  // The vendored build ships without type declarations (see three-vendor.d.ts).
  const THREE = (await import("./assets/vendor/three.module.js")) as any;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  camera.position.set(33, 38, 33);
  camera.lookAt(0, 4, 0);

  const root = new THREE.Group();
  scene.add(root);
  const world = new THREE.Group(); // rebuilt on theme change
  root.add(world);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startedAt = performance.now();

  let rises: { group: any; delay: number }[] = [];
  let pulses: { mat: any; base: number; phase: number; speed: number }[] = [];
  let trucks: { group: any; z: number; speed: number; phase: number; range: number }[] = [];
  let spinners: { group: any; speed: number }[] = [];
  let sways: { group: any; phase: number; speed: number }[] = [];
  /** Shuttles a group back and forth along local X, e.g. the hanger line's carriage. */
  let conveyors: { group: any; range: number; speed: number; phase: number }[] = [];
  /** Spins a facade-mounted disc (built facing +Z already) around its own Z axis, e.g. a factory gear. */
  let gears: { group: any; speed: number }[] = [];
  let particles: any = null;
  let particleSpeeds: Float32Array = new Float32Array(0);
  let dustTexture: any = null;
  // Ash (factory chimneys) and steam (restaurant vent) plumes: same drifting-points
  // technique as the ambient dust, but each particle respawns at one of its
  // emitters' positions instead of spreading over the whole scene.
  let smokeSystems: {
    points: any;
    emitters: { x: number; y: number; z: number }[];
    vy: Float32Array;
    vx: Float32Array;
    spawnY: Float32Array;
  }[] = [];

  function disposeWorld() {
    world.traverse((obj: any) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m: any) => m.dispose());
      }
    });
    world.clear();
    rises = [];
    pulses = [];
    trucks = [];
    spinners = [];
    sways = [];
    conveyors = [];
    gears = [];
    particles = null;
    smokeSystems = [];
  }

  function makeDustTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }

  function addPulse(mesh: any, base: number, phase: number, speed: number) {
    mesh.material.opacity = base;
    pulses.push({ mat: mesh.material, base, phase, speed });
  }

  /** A small drifting-points plume (ash or steam) spawning at one of `emitters`, e.g. chimney tops. */
  function addSmoke(emitters: { x: number; y: number; z: number }[], color: number, count: number, size: number, opacity: number) {
    if (!emitters.length) return;
    const positions = new Float32Array(count * 3);
    const vy = new Float32Array(count);
    const vx = new Float32Array(count);
    const spawnY = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      const e = emitters[k % emitters.length];
      const riseSoFar = Math.random() * 1.2;
      positions[k * 3] = e.x + (Math.random() - 0.5) * 0.15;
      positions[k * 3 + 1] = e.y + riseSoFar;
      positions[k * 3 + 2] = e.z + (Math.random() - 0.5) * 0.15;
      vy[k] = 0.012 + Math.random() * 0.014;
      vx[k] = (Math.random() - 0.5) * 0.01;
      spawnY[k] = e.y;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    dustTexture ??= makeDustTexture();
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color,
        size,
        map: dustTexture,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    world.add(points);
    smokeSystems.push({ points, emitters, vy, vx, spawnY });
  }

  function build(dark: boolean) {
    disposeWorld();
    const pal = dark ? DARK : LIGHT;

    const fills = pal.bldg.map(
      (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: dark ? 0.55 : 0.4, depthWrite: false }),
    );
    const edgeMat = new THREE.LineBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.85 });
    const glowMats = pal.glow.map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
    const containerMats = pal.container.map(
      (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: dark ? 0.8 : 0.72, depthWrite: false }),
    );

    // Ground grid under the plots.
    const grid = new THREE.GridHelper(GRID * PLOT + 6, GRID * 4 + 4, pal.grid, pal.grid);
    grid.material.transparent = true;
    grid.material.opacity = dark ? 0.22 : 0.18;
    world.add(grid);

    // Collected while the plots are drawn below, then turned into two shared
    // particle plumes once every chimney / vent position is known.
    const ashEmitters: { x: number; y: number; z: number }[] = [];
    const steamEmitters: { x: number; y: number; z: number }[] = [];

    const start = -(GRID - 1) / 2;
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const kind = LAYOUT[i][j];
        const x = (start + i) * PLOT;
        const z = (start + j) * PLOT;

        if (kind === 0) continue; // left open for the truck route to pass through

        const floors = cellFloors(i, j, kind);
        const height = floors * FLOOR_H;
        const noise = Math.abs(Math.sin(i * 11.1 + j * 7.7));
        let w = BUILD_W * (0.85 + noise * 0.3);
        let d = BUILD_W * (0.85 + (1 - noise) * 0.3);
        if (kind === 5 || kind === 6) {
          w = BUILD_W * 1.55;
          d = BUILD_W * 1.1;
        }
        if (kind === 4 || kind === 7 || kind === 8 || kind === 9 || kind === 10 || kind === 11) {
          w = d = BUILD_W * 0.85;
        }

        const building = new THREE.Group();
        building.position.set(x, 0, z);
        building.userData.label = KIND_LABEL[kind] ?? "Office";

        if (kind === 3) {
          // Container yard: `floors` shipping containers stacked with a
          // realistic offset, each carrying a small tracked-shipment light.
          const cw = w * 0.92;
          const cd = d * 0.92;
          const ch = FLOOR_H * 0.82;
          for (let f = 0; f < floors; f++) {
            const jitterX = (Math.sin((i + 1) * 7.3 + f * 3.1) * 0.5) * (cw * 0.12);
            const jitterZ = (Math.cos((j + 1) * 5.7 + f * 2.4) * 0.5) * (cd * 0.12);
            const mat = containerMats[(i + j + f) % containerMats.length];
            const box = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), mat);
            box.position.set(jitterX, f * (ch + 0.06) + ch / 2, jitterZ);
            building.add(box);

            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(cw, ch, cd)), edgeMat);
            edges.position.copy(box.position);
            building.add(edges);

            // A small light on top marks the shipment as live-tracked.
            const sensor = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.14, 0.05, cd * 0.14), glowMats[f % glowMats.length].clone());
            sensor.position.set(jitterX + cw * 0.32, f * (ch + 0.06) + ch + 0.03, jitterZ + cd * 0.32);
            addPulse(sensor, 0.85, (i + j + f) * 0.5, 1.3 + (f % 2) * 0.3);
            building.add(sensor);
          }
        } else {
          const body = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), fills[(i + j) % 3]);
          body.position.y = height / 2;
          building.add(body);

          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, height, d)), edgeMat);
          edges.position.y = height / 2;
          building.add(edges);

          // Glowing floor strips on a deterministic subset of floors.
          for (let f = 0; f < floors; f++) {
            const r = (((i * 31 + j * 17 + f) * 2654435761) >>> 0) % 100;
            const tint = r < 30 ? 0 : r < 50 ? 1 : r < 60 ? 2 : -1;
            if (tint < 0) continue;
            const strip = new THREE.Mesh(
              new THREE.BoxGeometry(w * 1.015, 0.045, d * 1.015),
              glowMats[tint].clone(),
            );
            strip.position.y = f * FLOOR_H + FLOOR_H * 0.85;
            addPulse(strip, 0.6, (i + j + f) * 0.4, 0.9 + (f % 3) * 0.25);
            building.add(strip);
          }

          if (kind === 2) {
            // Crown of the tall towers: the bright top faces in the hero.
            const crown = new THREE.Mesh(
              new THREE.BoxGeometry(w * 1.12, 0.2, d * 1.12),
              glowMats[0].clone(),
            );
            crown.position.y = height + 0.13;
            addPulse(crown, 0.8, i * 1.7 + j, 1.1);
            building.add(crown);
          }

          if (kind === 5) {
            // Warehouse roof stripe, reading as a loading-bay canopy.
            const canopy = new THREE.Mesh(
              new THREE.BoxGeometry(w * 1.06, 0.12, d * 0.3),
              glowMats[2].clone(),
            );
            canopy.position.set(0, height + 0.08, d * 0.4);
            addPulse(canopy, 0.7, i + j * 1.3, 1.0);
            building.add(canopy);
          }

          if (kind === 6) {
            // Factory: two tall chimneys, each feeding the shared ash plume built after the plot loop.
            const chimneyMat = new THREE.MeshBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.55, depthWrite: false });
            const chimneyEdgeMat = new THREE.LineBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.8 });
            [-0.3, 0.24].forEach((cx, ci) => {
              const chimneyH = 1.6 + ci * 0.7;
              const chimneyGeo = new THREE.BoxGeometry(0.3, chimneyH, 0.3);
              const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
              chimney.position.set(w * cx, height + chimneyH / 2, d * 0.25);
              building.add(chimney);
              const chimneyEdges = new THREE.LineSegments(new THREE.EdgesGeometry(chimneyGeo), chimneyEdgeMat);
              chimneyEdges.position.copy(chimney.position);
              building.add(chimneyEdges);
              const wx = x + w * cx;
              const wz = z + d * 0.25;
              ashEmitters.push({ x: wx, y: height + chimneyH + 0.1, z: wz });
            });

            // A gear on the facade, spinning steadily — the plant is visibly running,
            // not just venting smoke. Every part (hub, teeth, bolt) is centred on the
            // group's own origin, which is what `gears` spins around each frame, and
            // the whole group sits centred on the facade rather than off to one side.
            const gearMat = new THREE.MeshBasicMaterial({ color: pal.glow[1], transparent: true, opacity: 0.88, depthWrite: false });
            const gearR = w * 0.24;
            const gear = new THREE.Group();
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(gearR, gearR, 0.08, 24), gearMat);
            hub.rotation.x = Math.PI / 2;
            gear.add(hub);
            for (let t2 = 0; t2 < 8; t2++) {
              const angle = (t2 / 8) * Math.PI * 2;
              const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), gearMat);
              tooth.position.set(Math.cos(angle) * gearR, Math.sin(angle) * gearR, 0);
              gear.add(tooth);
            }
            const bolt = new THREE.Mesh(
              new THREE.CylinderGeometry(0.06, 0.06, 0.11, 12),
              new THREE.MeshBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.6, depthWrite: false }),
            );
            bolt.rotation.x = Math.PI / 2;
            gear.add(bolt);
            gear.position.set(0, height * 0.5, d / 2 + 0.08);
            building.add(gear);
            gears.push({ group: gear, speed: 2.4 });
          }

          if (kind === 7) {
            // Garment hanger line: a rail along the roof edge; the hooked garments ride a
            // carriage that shuttles back and forth along it, like a running conveyor,
            // each garment also swaying on its own hook.
            const railMat = new THREE.MeshBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.6, depthWrite: false });
            const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.05, 0.05), railMat);
            rail.position.set(0, height + 0.34, d * 0.3);
            building.add(rail);
            const carriage = new THREE.Group();
            building.add(carriage);
            const garmentColors = pal.thread;
            for (let g = 0; g < 5; g++) {
              const gx = -w * 0.4 + (w * 0.8 * g) / 4;
              const hook = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.02), railMat);
              hook.position.set(gx, height + 0.27, d * 0.3);
              carriage.add(hook);
              const garment = new THREE.Mesh(
                new THREE.BoxGeometry(0.22, 0.36, 0.04),
                new THREE.MeshBasicMaterial({
                  color: garmentColors[g % garmentColors.length],
                  transparent: true,
                  opacity: 0.85, depthWrite: false }),
              );
              garment.position.set(0, -0.2, 0);
              const pivot = new THREE.Group();
              pivot.position.set(gx, height + 0.2, d * 0.3);
              pivot.add(garment);
              carriage.add(pivot);
              sways.push({ group: pivot, phase: g * 1.1, speed: 1.4 + (g % 2) * 0.3 });
            }
            conveyors.push({ group: carriage, range: w * 0.15, speed: 0.7, phase: i + j * 0.9 });
          }

          if (kind === 8) {
            // Textile mill: the process left to right across the roof — raw fibre bale,
            // spinning thread bobbins, finished fabric roll. Same layout idea as a
            // textile-industry flowchart (raw material -> thread -> fabric), just three
            // props instead of a seven-step diagram.
            const fibreMat = new THREE.MeshBasicMaterial({ color: pal.steam, transparent: true, opacity: 0.85, depthWrite: false });
            const strapMat = new THREE.MeshBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.5, depthWrite: false });

            // Raw material: a bundled fibre bale.
            const bale = new THREE.Group();
            bale.position.set(-w * 0.62, height + 0.16, 0);
            const baleBody = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), fibreMat);
            baleBody.scale.y = 0.75;
            bale.add(baleBody);
            [-0.06, 0.06].forEach((sy) => {
              const strap = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 6, 16), strapMat);
              strap.rotation.x = Math.PI / 2;
              strap.position.y = sy;
              bale.add(strap);
            });
            building.add(bale);

            // Thread: three spinning bobbins, one colour each — narrower span than
            // before, to leave room for the bale and the fabric roll either side.
            pal.thread.slice(0, 3).forEach((color, s) => {
              const bobbin = new THREE.Group();
              bobbin.position.set(-w * 0.18 + s * w * 0.18, height + 0.32, 0);
              const core = new THREE.Mesh(
                new THREE.CylinderGeometry(0.07, 0.07, 0.38, 10),
                new THREE.MeshBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.55, depthWrite: false }),
              );
              bobbin.add(core);
              const spool = new THREE.Mesh(
                new THREE.CylinderGeometry(0.23, 0.23, 0.28, 14),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, depthWrite: false }),
              );
              bobbin.add(spool);
              building.add(bobbin);
              spinners.push({ group: bobbin, speed: 1.6 + s * 0.5 });
            });

            // Fabric: a finished bolt of cloth, lying on its side, with contrasting end caps.
            const roll = new THREE.Group();
            roll.position.set(w * 0.62, height + 0.16, 0);
            const rollBody = new THREE.Mesh(
              new THREE.CylinderGeometry(0.15, 0.15, 0.44, 14),
              new THREE.MeshBasicMaterial({ color: pal.thread[3], transparent: true, opacity: 0.85, depthWrite: false }),
            );
            rollBody.rotation.z = Math.PI / 2;
            roll.add(rollBody);
            [-0.21, 0.21].forEach((sx) => {
              const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(0.155, 0.155, 0.03, 14),
                new THREE.MeshBasicMaterial({ color: pal.thread[0], transparent: true, opacity: 0.9, depthWrite: false }),
              );
              cap.rotation.z = Math.PI / 2;
              cap.position.x = sx;
              roll.add(cap);
            });
            building.add(roll);
          }

          if (kind === 9) {
            // Hospital: a red cross on the facade and another flat on the roof (visible from
            // this isometric-from-above angle whichever side the facade one faces), both
            // pulsing like a heartbeat.
            const crossMat = new THREE.MeshBasicMaterial({ color: pal.cross, transparent: true, opacity: 0.95, depthWrite: false });
            const facade = new THREE.Group();
            const fv = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.09), crossMat);
            const fh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.09), crossMat.clone());
            facade.add(fv, fh);
            facade.position.set(0, height * 0.62, d / 2 + 0.05);
            building.add(facade);
            addPulse(fv, 0.95, 0, 2.6);
            addPulse(fh, 0.95, 0, 2.6);

            const roof = new THREE.Group();
            const rv = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.5), crossMat.clone());
            const rh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.16), crossMat.clone());
            roof.add(rv, rh);
            roof.position.set(0, height + 0.06, 0);
            building.add(roof);
            addPulse(rv, 0.95, 0.3, 2.6);
            addPulse(rh, 0.95, 0.3, 2.6);
          }

          if (kind === 10) {
            // Restaurant: a striped awning over the entrance and a kitchen vent feeding the steam plume.
            for (let s = 0; s < 4; s++) {
              const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(w * 0.27, 0.08, d * 0.42),
                new THREE.MeshBasicMaterial({
                  color: s % 2 === 0 ? pal.thread[0] : pal.steam,
                  transparent: true,
                  opacity: 0.9, depthWrite: false }),
              );
              stripe.position.set(-w * 0.4 + s * w * 0.27, height * 0.46, d * 0.62);
              stripe.rotation.x = -0.35;
              building.add(stripe);
            }
            const vent = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, 0.22, 0.3),
              new THREE.MeshBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.55, depthWrite: false }),
            );
            vent.position.set(w * 0.2, height + 0.11, -d * 0.2);
            building.add(vent);
            const ventEdges = new THREE.LineSegments(
              new THREE.EdgesGeometry(new THREE.BoxGeometry(0.3, 0.22, 0.3)),
              new THREE.LineBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.75 }),
            );
            ventEdges.position.copy(vent.position);
            building.add(ventEdges);
            steamEmitters.push({ x: x + w * 0.2, y: height + 0.26, z: z - d * 0.2 });
          }

          if (kind === 11) {
            // School: a mortarboard on the roof, sized like the hospital's cross,
            // with a tassel that sways off one corner — the same swing already
            // used for the garment hanger line.
            const trimMat = new THREE.MeshBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.55, depthWrite: false });
            const band = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.32, w * 0.35, 0.16, 16), trimMat);
            band.position.set(0, height + 0.1, 0);
            building.add(band);

            const boardSize = w * 0.86;
            const boardMat = new THREE.MeshBasicMaterial({ color: pal.glow[0], transparent: true, opacity: 0.9, depthWrite: false });
            const boardGeo = new THREE.BoxGeometry(boardSize, 0.08, boardSize);
            const board = new THREE.Mesh(boardGeo, boardMat);
            board.position.set(0, height + 0.24, 0);
            board.rotation.y = Math.PI / 4;
            building.add(board);
            const boardEdges = new THREE.LineSegments(
              new THREE.EdgesGeometry(boardGeo),
              new THREE.LineBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.75 }),
            );
            boardEdges.position.copy(board.position);
            boardEdges.rotation.y = board.rotation.y;
            building.add(boardEdges);

            const button = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), trimMat);
            button.position.set(0, height + 0.29, 0);
            building.add(button);

            // Hangs off the board's +X corner, which is where a 45°-rotated square's corner lands.
            const cornerX = (boardSize * Math.SQRT2) / 2;
            const tassel = new THREE.Group();
            tassel.position.set(cornerX, height + 0.27, 0);
            const cord = new THREE.Mesh(
              new THREE.BoxGeometry(0.03, 0.28, 0.03),
              new THREE.MeshBasicMaterial({ color: pal.thread[2], transparent: true, opacity: 0.9, depthWrite: false }),
            );
            cord.position.y = -0.14;
            tassel.add(cord);
            const tip = new THREE.Mesh(
              new THREE.BoxGeometry(0.09, 0.09, 0.09),
              new THREE.MeshBasicMaterial({ color: pal.thread[2], transparent: true, opacity: 0.9, depthWrite: false }),
            );
            tip.position.y = -0.3;
            tassel.add(tip);
            building.add(tassel);
            sways.push({ group: tassel, phase: i + j * 0.7, speed: 1.5 });
          }
        }

        building.scale.y = reduceMotion ? 1 : 0.001;
        world.add(building);
        rises.push({ group: building, delay: 0.15 + ((i * 5 + j) % 9) * 0.09 });
      }
    }

    addSmoke(ashEmitters, pal.smoke, SMOKE_PARTICLES, 0.55, 0.8);
    addSmoke(steamEmitters, pal.steam, Math.round(SMOKE_PARTICLES * 0.6), 0.45, 0.7);
    buildTrucks(pal);

    // Dust drifting up through the scene.
    const positions = new Float32Array(PARTICLES * 3);
    particleSpeeds = new Float32Array(PARTICLES);
    for (let k = 0; k < PARTICLES; k++) {
      positions[k * 3] = (Math.random() - 0.5) * 30;
      positions[k * 3 + 1] = Math.random() * 20;
      positions[k * 3 + 2] = (Math.random() - 0.5) * 30;
      particleSpeeds[k] = 0.004 + Math.random() * 0.006;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    dustTexture ??= makeDustTexture();
    particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: pal.particle,
        size: 0.22,
        map: dustTexture,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    world.add(particles);
  }

  /** Two delivery trucks tracing the open lane along the front of the plots, back and forth. */
  function buildTrucks(pal: Palette) {
    const truckMat = new THREE.MeshBasicMaterial({ color: pal.truck, transparent: true, opacity: 0.85, depthWrite: false });
    const glassMat = new THREE.MeshBasicMaterial({ color: pal.glow[0], transparent: true, opacity: 0.75, depthWrite: false });
    const range = (GRID * PLOT) / 2 + 1;

    [0, 1].forEach((n) => {
      const truck = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.7), truckMat);
      body.position.y = 0.3;
      truck.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.68), glassMat);
      cab.position.set(-0.95, 0.28, 0);
      truck.add(cab);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 0.6, 0.7)),
        new THREE.LineBasicMaterial({ color: pal.edge, transparent: true, opacity: 0.6 }),
      );
      edges.position.y = 0.3;
      truck.add(edges);

      const z = n === 0 ? -((GRID * PLOT) / 2 + 1.6) : (GRID * PLOT) / 2 + 1.6;
      world.add(truck);
      trucks.push({ group: truck, z, speed: 0.22 + n * 0.05, phase: n * 2.4, range });
    });
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(now: number) {
    const t = (now - startedAt) / 1000;
    for (const r of rises) r.group.scale.y = Math.max(0.001, easeOut((t - r.delay) / 1.1));
    for (const p of pulses) p.mat.opacity = p.base * (0.55 + 0.45 * Math.sin(t * p.speed * 2 + p.phase));
    for (const tr of trucks) {
      const s = pingPong(t * tr.speed + tr.phase);
      tr.group.position.set(s * tr.range, 0, tr.z);
      // The cab sits at local -X, so facing world +X (heading right) needs a 180° turn.
      const headingPositiveX = Math.cos(t * tr.speed + tr.phase) >= 0;
      tr.group.rotation.y = headingPositiveX ? Math.PI : 0;
    }
    if (particles) {
      const pos = particles.geometry.attributes.position;
      for (let k = 0; k < PARTICLES; k++) {
        let y = pos.getY(k) + particleSpeeds[k];
        if (y > 20) y = 0;
        pos.setY(k, y);
      }
      pos.needsUpdate = true;
    }
    for (const s of spinners) s.group.rotation.y = t * s.speed;
    for (const c of conveyors) c.group.position.x = pingPong(t * c.speed + c.phase) * c.range;
    for (const g of gears) g.group.rotation.z = t * g.speed;
    for (const s of sways) s.group.rotation.z = Math.sin(t * s.speed + s.phase) * 0.18;
    for (const sys of smokeSystems) {
      const pos = sys.points.geometry.attributes.position;
      const count = pos.count;
      for (let k = 0; k < count; k++) {
        const y = pos.getY(k) + sys.vy[k];
        if (y - sys.spawnY[k] > 2.4) {
          // Risen far enough above its chimney — respawn, possibly at a different one.
          const e = sys.emitters[Math.floor(Math.random() * sys.emitters.length)];
          pos.setX(k, e.x + (Math.random() - 0.5) * 0.15);
          pos.setY(k, e.y);
          pos.setZ(k, e.z + (Math.random() - 0.5) * 0.15);
          sys.spawnY[k] = e.y;
        } else {
          pos.setX(k, pos.getX(k) + sys.vx[k]);
          pos.setY(k, y);
        }
      }
      pos.needsUpdate = true;
    }
    root.rotation.y = reduceMotion ? 0 : Math.sin(t * 0.12) * 0.32 - 0.1;
    renderer.render(scene, camera);
  }

  // Draw only while on screen and the tab is visible.
  let raf = 0;
  let onScreen = true;
  function loop(now: number) {
    raf = 0;
    if (!onScreen || document.hidden) return;
    frame(now);
    raf = requestAnimationFrame(loop);
  }
  function kick() {
    if (!raf && !reduceMotion) raf = requestAnimationFrame(loop);
  }

  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) kick();
  });
  io.observe(canvas);
  const ro = new ResizeObserver(() => {
    resize();
    if (reduceMotion) frame(performance.now() + 5000);
  });
  ro.observe(canvas);
  const onVisibility = () => kick();
  document.addEventListener("visibilitychange", onVisibility);

  // Hover: raycast the cursor into the scene and show the building's industry name.
  const tooltip = document.createElement("div");
  tooltip.textContent = "";
  Object.assign(tooltip.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "3000",
    padding: "5px 10px",
    borderRadius: "8px",
    background: "rgba(11, 18, 32, 0.88)",
    color: "#eff6ff",
    font: "600 12px/1.2 'Inter Tight', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    letterSpacing: "-0.01em",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    transform: "translate(-50%, -130%)",
    boxShadow: "0 6px 18px -6px rgba(0, 0, 0, 0.5)",
    opacity: "0",
    transition: "opacity 0.12s ease",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(tooltip);

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new (Object.getPrototypeOf(camera.position).constructor)();
  let hovered: any = null;

  function labelledAncestor(obj: any): any {
    let o = obj;
    while (o && !o.userData?.label) o = o.parent;
    return o;
  }

  function showTooltip(label: string, clientX: number, clientY: number) {
    tooltip.textContent = label;
    tooltip.style.left = `${clientX}px`;
    tooltip.style.top = `${clientY}px`;
    tooltip.style.opacity = "1";
  }
  function hideTooltip() {
    tooltip.style.opacity = "0";
    hovered = null;
  }

  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(world.children, true);
    // Skip past unlabelled hits (ground grid lines, drifting dust/smoke points)
    // to the first one that's actually part of a building.
    let hit: any = null;
    for (const h of hits) {
      hit = labelledAncestor(h.object);
      if (hit) break;
    }
    if (hit) {
      hovered = hit;
      showTooltip(hit.userData.label, event.clientX, event.clientY);
    } else if (hovered) {
      hideTooltip();
    }
  }
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", hideTooltip);

  build(document.documentElement.classList.contains("dark"));
  resize();
  if (reduceMotion) frame(performance.now() + 5000);
  else kick();

  return {
    setDark(dark) {
      build(dark);
      if (reduceMotion) frame(performance.now() + 5000);
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", hideTooltip);
      tooltip.remove();
      disposeWorld();
      dustTexture?.dispose();
      renderer.dispose();
    },
  };
}
