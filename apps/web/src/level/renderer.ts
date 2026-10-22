import {
  LEVEL_MATERIALS,
  LEVEL_PROP_KINDS,
  PROP_KINDS,
  withinVisibility,
  type LevelLayout,
  type LevelLightTone,
  type LevelPropKind,
} from "@taverns/api";
import * as THREE from "three";
import type { Segment } from "./document";
import { drawProp } from "./kitArt";
import type { Mark, MarkColour } from "./overlay";
import { css, readPalette, type Palette, type Rgb } from "./palette";
import {
  describeFloor,
  describeLights,
  describeProps,
  describeWalls,
  leafEnd,
  lightBlockers,
  type DoorPart,
  type LightPart,
  type Reader,
  type VisionPart,
} from "./scene";
import {
  COMPOSITE_FRAG,
  COMPOSITE_VERT,
  FLOOR_FRAG,
  GLOW_FRAG,
  GLOW_VERT,
  INSTANCED_VERT,
  LIGHT_FRAG,
  LIGHT_VERT,
  PROP_FRAG,
  PROP_SHADOW_FRAG,
  SHADER_COLOURS,
  SHADOW_FRAG,
  VISION_FRAG,
  WALL_FRAG,
  WORLD_VERT,
} from "./shaders";
import type { LevelView } from "./view";

/**
 * The level in three.js, straight down, the world in squares (`x` across, `y`
 * down), as the approved prototype draws it:
 *
 * 1. the level's albedo into a screen-sized target: the floor shader over one
 *    quad, walls as inked strips of dressed stone with a soft shadow, doors as
 *    a leaf that swings about its hinge, and the props, one instanced batch per
 *    kind (and one for their drop shadows), so a 200-square level is about
 *    forty draw calls, not one per prop;
 * 2. a board-space light map: every light's visibility polygon as a fan with a
 *    radial falloff, all lights in one draw, flickering in the vertex shader;
 * 3. in the party's view, a board-space vision target from each viewer's fan;
 * 4. the composite: albedo times ambient plus light, the party's view, the
 *    hatch outside the board, the grid;
 * 5. flames' glow, then the editor's marks and the pointer's.
 *
 * Each part is rebuilt only when the arrays it reads change (`setLevel`
 * compares references; `edits.ts` keeps untouched parts the same arrays).
 * `dispose` frees every GPU resource.
 */

/** A viewer token's initial, in pixels of its 128-pixel texture. */
const TOKEN_LETTER = 48;

const WALL_T = 0.32;
const INK_T = 0.46;

/** How finely the light and vision maps sample a square, at most, and their largest side. */
const BOARD_PX_MAX = 16;
const BOARD_PX_MIN = 4;
const BOARD_TARGET_MAX = 2048;

/** A tone's light is brighter than its glow; fire most of all. */
const lightGain = (tone: LevelLightTone) => (tone === "fire" ? 1.25 : 1.05);
const glowGain = (tone: LevelLightTone) => (tone === "fire" ? 0.55 : 0.4);

const flat = { transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide };

/** A colour in the art's own space: the channels as given, no sRGB decode. */
const raw = (rgb: Rgb) =>
  new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
const vec = (rgb: Rgb) => new THREE.Vector3(rgb[0], rgb[1], rgb[2]);

/** One quad per segment, `thick` across and `ext` past each end; uv.x runs along in squares, uv.y across 0 to 1. */
export const stripGeometry = (
  segs: ReadonlyArray<Segment>,
  thick: number,
  ext: number,
  dx = 0,
  dy = 0,
): THREE.BufferGeometry => {
  const pos = new Float32Array(segs.length * 12);
  const uv = new Float32Array(segs.length * 8);
  const idx = new Uint32Array(segs.length * 6);
  segs.forEach((s, i) => {
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1e-6;
    const ux = (s.x2 - s.x1) / L;
    const uy = (s.y2 - s.y1) / L;
    const nx = (-uy * thick) / 2;
    const ny = (ux * thick) / 2;
    const ax = s.x1 - ux * ext + dx;
    const ay = s.y1 - uy * ext + dy;
    const bx = s.x2 + ux * ext + dx;
    const by = s.y2 + uy * ext + dy;
    pos.set(
      [ax + nx, ay + ny, 0, bx + nx, by + ny, 0, bx - nx, by - ny, 0, ax - nx, ay - ny, 0],
      i * 12,
    );
    uv.set([-ext, 0, L + ext, 0, L + ext, 1, -ext, 1], i * 8);
    const o = i * 4;
    idx.set([o, o + 1, o + 2, o, o + 2, o + 3], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
};

/** A triangle fan about `(cx, cy)` through a visibility polygon's vertices. */
const fanGeometry = (cx: number, cy: number, vertices: Float64Array): THREE.BufferGeometry => {
  const n = vertices.length / 2;
  const pos = new Float32Array((n + 1) * 3);
  pos[0] = cx;
  pos[1] = cy;
  for (let i = 0; i < n; i++) {
    pos[(i + 1) * 3] = vertices[i * 2]!;
    pos[(i + 1) * 3 + 1] = vertices[i * 2 + 1]!;
  }
  const idx = new Uint32Array(n * 3);
  for (let i = 0; i < n; i++) idx.set([0, i + 1, ((i + 1) % n) + 1], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
};

/** Every object under `group` freed and removed; a material marked `shared` is kept. */
const clear = (group: THREE.Object3D) => {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | Array<THREE.Material> | undefined;
      for (const m of material === undefined
        ? []
        : Array.isArray(material)
          ? material
          : [material]) {
        if (m.userData["shared"] !== true) m.dispose();
      }
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
  }
};

const add = <T extends THREE.Object3D>(parent: THREE.Object3D, object: T, order = 0): T => {
  object.frustumCulled = false;
  object.renderOrder = order;
  parent.add(object);
  return object;
};

const shared = <T extends THREE.Material>(material: T): T => {
  material.userData["shared"] = true;
  return material;
};

export interface RendererOptions {
  /** Draw the lighting; off shows the level flat, as built. */
  readonly lit: boolean;
  readonly grid: boolean;
  /** The party's view: their vision masks the level, and flames outside it go dark. */
  readonly viewAs: boolean;
}

export interface LevelStats {
  readonly drawCalls: number;
  /** How long the last light rebuild took, in milliseconds. */
  readonly lightMs: number;
  readonly lights: number;
}

export class LevelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly host: HTMLElement;
  private palette: Palette;
  private readonly cam = new THREE.OrthographicCamera(0, 1, 0, 1, -100, 100);
  private readonly boardCam = new THREE.OrthographicCamera(0, 1, 0, 1, -100, 100);
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private readonly world = new THREE.Scene();
  private readonly lightScene = new THREE.Scene();
  private readonly visScene = new THREE.Scene();
  private readonly glowScene = new THREE.Scene();
  private readonly overlayScene = new THREE.Scene();
  private readonly hoverScene = new THREE.Scene();
  private readonly compScene = new THREE.Scene();

  private readonly wallsGroup = add(this.world, new THREE.Group());
  private readonly leavesGroup = add(this.world, new THREE.Group());
  private readonly propsGroup = add(this.world, new THREE.Group());
  private readonly lightsGroup = add(this.lightScene, new THREE.Group());
  private readonly glowGroup = add(this.glowScene, new THREE.Group());
  private readonly visGroup = add(this.visScene, new THREE.Group());
  private readonly overlayGroup = add(this.overlayScene, new THREE.Group());
  private readonly hoverGroup = add(this.hoverScene, new THREE.Group());

  private readonly albedo = new THREE.WebGLRenderTarget(4, 4);
  private lightRT: THREE.WebGLRenderTarget | null = null;
  private visRT: THREE.WebGLRenderTarget | null = null;

  private readonly floorMat: THREE.ShaderMaterial;
  private readonly floorMesh: THREE.Mesh;
  private floorTex: THREE.DataTexture | null = null;
  private readonly wallMat: THREE.ShaderMaterial;
  private readonly inkMat: THREE.MeshBasicMaterial;
  private readonly shadowMat: THREE.ShaderMaterial;
  private readonly woodMat: THREE.MeshBasicMaterial;
  private readonly ironMat: THREE.MeshBasicMaterial;
  private readonly lightMat: THREE.ShaderMaterial;
  private readonly glowMat: THREE.ShaderMaterial;
  private readonly compMat: THREE.ShaderMaterial;
  private seesTex: THREE.DataTexture;
  private seenTex: THREE.DataTexture;

  private readonly propTextures = new Map<LevelPropKind, THREE.CanvasTexture>();
  private readonly iconTextures = new Map<LevelLightTone, THREE.CanvasTexture>();
  private readonly tokenTextures = new Map<string, THREE.CanvasTexture>();
  private readonly markMaterials = new Map<string, THREE.MeshBasicMaterial>();

  private level: LevelLayout | null = null;
  private reader: Reader | null = null;
  private lights: ReadonlyArray<LightPart> = [];
  private doors: ReadonlyArray<DoorPart> = [];
  private readonly swing = new Map<string, { amount: number; target: number }>();
  private swingMs = 0;
  private glowMesh: THREE.InstancedMesh | null = null;
  private vision: VisionPart | null = null;
  private options: RendererOptions = { lit: true, grid: true, viewAs: false };
  private view: LevelView = { cx: 0, cy: 0, zoom: 32 };
  private size = { width: 1, height: 1 };
  private raf: number | undefined;
  private last: number | undefined;
  private visionDirty = false;
  private lightMs = 0;
  private dead = false;

  constructor(host: HTMLElement) {
    this.host = host;
    this.palette = readPalette(host);
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    const canvas = renderer.domElement;
    canvas.setAttribute("data-slot", "level-canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.appendChild(canvas);

    this.cam.position.z = 10;
    this.boardCam.position.z = 10;

    const pal = this.paletteUniforms();
    this.floorMat = shared(
      new THREE.ShaderMaterial({
        uniforms: {
          ...pal,
          uMat: { value: null },
          uSize: { value: new THREE.Vector2(1, 1) },
          uTime: { value: 0 },
          uForce: { value: -1 },
        },
        vertexShader: WORLD_VERT,
        fragmentShader: FLOOR_FRAG,
        ...flat,
      }),
    );
    this.floorMesh = add(
      this.world,
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.floorMat),
      0,
    );
    this.wallMat = shared(
      new THREE.ShaderMaterial({
        uniforms: { ...pal },
        vertexShader: WORLD_VERT,
        fragmentShader: WALL_FRAG,
        ...flat,
      }),
    );
    this.inkMat = shared(
      new THREE.MeshBasicMaterial({ color: raw(this.palette.theme.ink), ...flat }),
    );
    this.shadowMat = shared(
      new THREE.ShaderMaterial({ vertexShader: WORLD_VERT, fragmentShader: SHADOW_FRAG, ...flat }),
    );
    this.woodMat = shared(
      new THREE.MeshBasicMaterial({ color: raw(this.palette.level["door-wood"]), ...flat }),
    );
    this.ironMat = shared(
      new THREE.MeshBasicMaterial({ color: raw(this.palette.level["door-iron"]), ...flat }),
    );
    this.lightMat = shared(
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: LIGHT_VERT,
        fragmentShader: LIGHT_FRAG,
        blending: THREE.AdditiveBlending,
        ...flat,
      }),
    );
    this.glowMat = shared(
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        blending: THREE.AdditiveBlending,
        ...flat,
      }),
    );
    this.seesTex = this.maskTexture(1, 1);
    this.seenTex = this.maskTexture(1, 1);
    this.compMat = shared(
      new THREE.ShaderMaterial({
        uniforms: {
          ...pal,
          tA: { value: this.albedo.texture },
          tL: { value: null },
          tV: { value: null },
          tSees: { value: this.seesTex },
          tSeen: { value: this.seenTex },
          uAmb: { value: new THREE.Vector3() },
          uLit: { value: 1 },
          uView: { value: 0 },
          uGrid: { value: 1 },
          uDmFloor: { value: 0.16 },
          uCam: { value: new THREE.Vector4() },
          uBoard: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: COMPOSITE_VERT,
        fragmentShader: COMPOSITE_FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    );
    add(this.compScene, new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat));
    this.swingMs = this.duration("--dur-slow");
  }

  // ---------------------------------------------------------------------------
  // The palette

  private paletteUniforms() {
    return {
      uPal: { value: SHADER_COLOURS.map((name) => vec(this.palette.level[name])) },
      uInk: { value: vec(this.palette.theme.ink) },
    };
  }

  private duration(name: string): number {
    const value = getComputedStyle(this.host).getPropertyValue(name).trim();
    if (value.endsWith("ms")) return Number.parseFloat(value) || 0;
    if (value.endsWith("s")) return (Number.parseFloat(value) || 0) * 1000;
    return 0;
  }

  private maskTexture(columns: number, rows: number): THREE.DataTexture {
    const tex = new THREE.DataTexture(
      new Uint8Array(columns * rows),
      columns,
      rows,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    tex.unpackAlignment = 1;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // The level

  /**
   * Draw `level` as `reader` sees it, rebuilding only the parts whose arrays
   * changed since the last call.
   */
  setLevel(level: LevelLayout, reader: Reader) {
    const before = this.level;
    const readerChanged = reader !== this.reader;
    const resized =
      before === null || before.columns !== level.columns || before.rows !== level.rows;
    const floorChanged = resized || before.floor !== level.floor;
    const wallsChanged = resized || readerChanged || before.walls !== level.walls;
    const propsChanged = resized || readerChanged || before.props !== level.props;
    const lightsChanged =
      wallsChanged ||
      propsChanged ||
      before.lights !== level.lights ||
      before.feetPerCell !== level.feetPerCell;
    this.level = level;
    this.reader = reader;
    if (resized) this.sizeBoardTargets(level);
    if (floorChanged) this.rebuildFloor(level);
    if (wallsChanged) this.rebuildWalls(level, reader);
    if (propsChanged) this.rebuildProps(level, reader);
    if (lightsChanged) this.rebuildLights(level, reader);
    this.compMat.uniforms["uAmb"]!.value = vec(this.palette.level[`ambient-${level.ambient}`]);
    this.visionDirty = true;
  }

  private sizeBoardTargets(level: LevelLayout) {
    const longest = Math.max(level.columns, level.rows);
    const px = Math.max(
      BOARD_PX_MIN,
      Math.min(BOARD_PX_MAX, Math.floor(BOARD_TARGET_MAX / Math.max(1, longest))),
    );
    this.lightRT?.dispose();
    this.visRT?.dispose();
    this.lightRT = new THREE.WebGLRenderTarget(level.columns * px, level.rows * px, {
      type: THREE.HalfFloatType,
    });
    this.visRT = new THREE.WebGLRenderTarget(level.columns * px, level.rows * px);
    this.boardCam.left = 0;
    this.boardCam.right = level.columns;
    this.boardCam.top = 0;
    this.boardCam.bottom = level.rows;
    this.boardCam.updateProjectionMatrix();
    this.compMat.uniforms["tL"]!.value = this.lightRT.texture;
    this.compMat.uniforms["tV"]!.value = this.visRT.texture;
    (this.compMat.uniforms["uBoard"]!.value as THREE.Vector2).set(level.columns, level.rows);
    this.seesTex.dispose();
    this.seenTex.dispose();
    this.seesTex = this.maskTexture(level.columns, level.rows);
    this.seenTex = this.maskTexture(level.columns, level.rows);
    this.compMat.uniforms["tSees"]!.value = this.seesTex;
    this.compMat.uniforms["tSeen"]!.value = this.seenTex;
  }

  private rebuildFloor(level: LevelLayout) {
    const floor = describeFloor(level);
    const tex = this.floorTex;
    if (tex === null || tex.image.width !== floor.columns || tex.image.height !== floor.rows) {
      tex?.dispose();
      const next = new THREE.DataTexture(
        floor.materials,
        floor.columns,
        floor.rows,
        THREE.RedFormat,
        THREE.UnsignedByteType,
      );
      next.unpackAlignment = 1;
      next.magFilter = THREE.NearestFilter;
      next.minFilter = THREE.NearestFilter;
      next.needsUpdate = true;
      this.floorTex = next;
      this.floorMat.uniforms["uMat"]!.value = next;
      (this.floorMat.uniforms["uSize"]!.value as THREE.Vector2).set(floor.columns, floor.rows);
      this.floorMesh.geometry.dispose();
      this.floorMesh.geometry = new THREE.PlaneGeometry(floor.columns, floor.rows);
      this.floorMesh.position.set(floor.columns / 2, floor.rows / 2, 0);
      return;
    }
    (tex.image.data as Uint8Array).set(floor.materials);
    tex.needsUpdate = true;
  }

  private rebuildWalls(level: LevelLayout, reader: Reader) {
    clear(this.wallsGroup);
    const { solid, doors } = describeWalls(level, reader);
    if (solid.length > 0) {
      add(
        this.wallsGroup,
        new THREE.Mesh(stripGeometry(solid, 0.75, 0.2, 0.07, 0.1), this.shadowMat),
        1,
      );
      add(this.wallsGroup, new THREE.Mesh(stripGeometry(solid, INK_T, INK_T / 2), this.inkMat), 3);
      add(
        this.wallsGroup,
        new THREE.Mesh(stripGeometry(solid, WALL_T, WALL_T / 2), this.wallMat),
        4,
      );
    }
    const jambs = doors.flatMap((d) => d.jambs);
    if (jambs.length > 0) {
      add(
        this.wallsGroup,
        new THREE.Mesh(stripGeometry(jambs, INK_T + 0.06, 0.04), this.inkMat),
        3,
      );
      add(this.wallsGroup, new THREE.Mesh(stripGeometry(jambs, WALL_T + 0.06, 0), this.wallMat), 4);
    }
    const known = new Set(doors.map((d) => d.id));
    for (const id of [...this.swing.keys()]) if (!known.has(id)) this.swing.delete(id);
    for (const door of doors) {
      const target = door.open ? 1 : 0;
      const was = this.swing.get(door.id);
      this.swing.set(door.id, { amount: was?.amount ?? target, target });
    }
    this.doors = doors;
    this.rebuildLeaves();
  }

  /** The doors' leaves, each swung as far as it has got. */
  private rebuildLeaves() {
    clear(this.leavesGroup);
    if (this.doors.length === 0) return;
    const leaves: Array<Segment> = [];
    const handles: Array<Segment> = [];
    for (const door of this.doors) {
      const amount = this.swing.get(door.id)?.amount ?? 0;
      const end = leafEnd(door, amount);
      const lx = (end.x - door.hinge.x) / door.length;
      const ly = (end.y - door.hinge.y) / door.length;
      leaves.push({ x1: door.hinge.x, y1: door.hinge.y, x2: end.x, y2: end.y });
      handles.push({
        x1: end.x - lx * 0.2,
        y1: end.y - ly * 0.2,
        x2: end.x - lx * 0.12,
        y2: end.y - ly * 0.12,
      });
      if (door.locked) {
        const mx = (door.hinge.x + end.x) / 2;
        const my = (door.hinge.y + end.y) / 2;
        handles.push({
          x1: mx - lx * 0.05,
          y1: my - ly * 0.05,
          x2: mx + lx * 0.05,
          y2: my + ly * 0.05,
        });
      }
    }
    add(this.leavesGroup, new THREE.Mesh(stripGeometry(leaves, 0.24, 0.05), this.inkMat), 5);
    add(this.leavesGroup, new THREE.Mesh(stripGeometry(leaves, 0.13, 0), this.woodMat), 6);
    add(this.leavesGroup, new THREE.Mesh(stripGeometry(handles, 0.2, 0), this.ironMat), 7);
  }

  private propTexture(kind: LevelPropKind): THREE.CanvasTexture | null {
    const known = this.propTextures.get(kind);
    if (known !== undefined) return known;
    const canvas = drawProp(kind, this.palette);
    if (canvas === null) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.NoColorSpace;
    this.propTextures.set(kind, tex);
    return tex;
  }

  private rebuildProps(level: LevelLayout, reader: Reader) {
    clear(this.propsGroup);
    const byKind = describeProps(level, reader);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 0, 1);
    const scale = new THREE.Vector3(1, 1, 1);
    const shadowScale = new THREE.Vector3(1.03, 1.03, 1);
    for (const kind of LEVEL_PROP_KINDS) {
      const instances = byKind.get(kind) ?? [];
      if (instances.length === 0) continue;
      const tex = this.propTexture(kind);
      if (tex === null) continue;
      const spec = PROP_KINDS[kind];
      const geometry = new THREE.PlaneGeometry(spec.width, spec.height);
      const body = new THREE.InstancedMesh(
        geometry,
        new THREE.ShaderMaterial({
          uniforms: { map: { value: tex }, uOpacity: { value: 1 } },
          vertexShader: INSTANCED_VERT,
          fragmentShader: PROP_FRAG,
          ...flat,
        }),
        instances.length,
      );
      const shadow = spec.flat
        ? null
        : new THREE.InstancedMesh(
            geometry.clone(),
            new THREE.ShaderMaterial({
              uniforms: { map: { value: tex } },
              vertexShader: INSTANCED_VERT,
              fragmentShader: PROP_SHADOW_FRAG,
              ...flat,
            }),
            instances.length,
          );
      instances.forEach((p, k) => {
        turn.setFromAxisAngle(axis, (p.rotation * Math.PI) / 2);
        matrix.compose(position.set(p.cx, p.cy, 0), turn, scale);
        body.setMatrixAt(k, matrix);
        if (shadow !== null) {
          matrix.compose(position.set(p.cx + 0.09, p.cy + 0.13, 0), turn, shadowScale);
          shadow.setMatrixAt(k, matrix);
        }
      });
      body.instanceMatrix.needsUpdate = true;
      add(this.propsGroup, body, spec.flat ? 0.5 : 2);
      if (shadow !== null) {
        shadow.instanceMatrix.needsUpdate = true;
        add(this.propsGroup, shadow, 1.5);
      }
    }
  }

  private rebuildLights(level: LevelLayout, reader: Reader) {
    const started = performance.now();
    clear(this.lightsGroup);
    clear(this.glowGroup);
    this.glowMesh = null;
    const lights = describeLights(level, lightBlockers(level, reader));
    this.lights = lights;
    if (lights.length > 0) {
      let vertices = 0;
      let triangles = 0;
      for (const light of lights) {
        const n = light.polygon.vertices.length / 2;
        vertices += n + 1;
        triangles += n;
      }
      const pos = new Float32Array(vertices * 3);
      const centre = new Float32Array(vertices * 2);
      const radii = new Float32Array(vertices * 2);
      const colour = new Float32Array(vertices * 3);
      const flicker = new Float32Array(vertices * 2);
      const idx = new Uint32Array(triangles * 3);
      let v = 0;
      let t = 0;
      lights.forEach((light, k) => {
        const tone = this.palette.level[`light-${light.tone}`];
        const gain = lightGain(light.tone);
        const seed = (k * 37.77) % 100;
        const verts = light.polygon.vertices;
        const n = verts.length / 2;
        const base = v;
        for (let i = 0; i <= n; i++) {
          const x = i === 0 ? light.x : verts[(i - 1) * 2]!;
          const y = i === 0 ? light.y : verts[(i - 1) * 2 + 1]!;
          pos.set([x, y, 0], v * 3);
          centre.set([light.x, light.y], v * 2);
          radii.set([light.bright, light.dim], v * 2);
          colour.set([tone[0] * gain, tone[1] * gain, tone[2] * gain], v * 3);
          flicker.set([light.flicker ? 1 : 0, seed], v * 2);
          v++;
        }
        for (let i = 0; i < n; i++) {
          idx.set([base, base + i + 1, base + ((i + 1) % n) + 1], t * 3);
          t++;
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aCentre", new THREE.BufferAttribute(centre, 2));
      g.setAttribute("aRadii", new THREE.BufferAttribute(radii, 2));
      g.setAttribute("aColour", new THREE.BufferAttribute(colour, 3));
      g.setAttribute("aFlicker", new THREE.BufferAttribute(flicker, 2));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      add(this.lightsGroup, new THREE.Mesh(g, this.lightMat));
    }
    const glowing = lights.filter((light) => light.tone !== "moon");
    if (glowing.length > 0) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const colour = new Float32Array(glowing.length * 3);
      const flicker = new Float32Array(glowing.length * 2);
      const visible = new Float32Array(glowing.length).fill(1);
      const mesh = new THREE.InstancedMesh(geometry, this.glowMat, glowing.length);
      const matrix = new THREE.Matrix4();
      glowing.forEach((light, k) => {
        const tone = this.palette.level[`light-${light.tone}`];
        const gain = glowGain(light.tone);
        colour.set([tone[0] * gain, tone[1] * gain, tone[2] * gain], k * 3);
        flicker.set([light.flicker ? 1 : 0, (k * 37.77) % 100], k * 2);
        const s = light.fromProp ? 1.6 : 1.1;
        matrix.makeScale(s, s, 1).setPosition(light.x, light.y, 0);
        mesh.setMatrixAt(k, matrix);
      });
      geometry.setAttribute("aColour", new THREE.InstancedBufferAttribute(colour, 3));
      geometry.setAttribute("aFlicker", new THREE.InstancedBufferAttribute(flicker, 2));
      geometry.setAttribute("aVisible", new THREE.InstancedBufferAttribute(visible, 1));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData["lights"] = glowing;
      this.glowMesh = add(this.glowGroup, mesh);
    }
    this.lightMs = performance.now() - started;
  }

  // ---------------------------------------------------------------------------
  // The party's vision

  /** What the party sees and has seen, or `null` outside the party's view. */
  setVision(vision: { readonly part: VisionPart; readonly seen: Uint8Array } | null) {
    this.vision = vision?.part ?? null;
    clear(this.visGroup);
    if (vision === null) return;
    const sees = this.seesTex.image.data as Uint8Array;
    sees.fill(0);
    for (const square of vision.part.sees) if (square < sees.length) sees[square] = 255;
    this.seesTex.needsUpdate = true;
    const seen = this.seenTex.image.data as Uint8Array;
    for (let k = 0; k < seen.length && k < vision.seen.length; k++)
      seen[k] = vision.seen[k] ? 255 : 0;
    this.seenTex.needsUpdate = true;
    const blend = {
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      ...flat,
    };
    for (const viewer of vision.part.viewers) {
      const g = fanGeometry(viewer.origin.x, viewer.origin.y, viewer.polygon.vertices);
      const mk = (radius: number, out: readonly [number, number, number]) =>
        new THREE.ShaderMaterial({
          uniforms: {
            uC: { value: new THREE.Vector2(viewer.origin.x, viewer.origin.y) },
            uR: { value: radius },
            uOut: { value: new THREE.Vector3(...out) },
          },
          vertexShader: WORLD_VERT,
          fragmentShader: VISION_FRAG,
          ...blend,
        });
      add(this.visGroup, new THREE.Mesh(g, mk(viewer.polygon.radius, [1, 0, 0])));
      if (viewer.darkvision > 0) {
        add(this.visGroup, new THREE.Mesh(g.clone(), mk(viewer.darkvision, [0, 1, 0])));
      }
    }
    this.visionDirty = true;
  }

  /** Whether the party sees a light's flame: it stands inside some viewer's sight. */
  private flameSeen(light: LightPart): boolean {
    const vision = this.vision;
    if (vision === null) return false;
    return vision.viewers.some((v) => withinVisibility(v.polygon, { x: light.x, y: light.y }));
  }

  private updateGlowVisibility() {
    const mesh = this.glowMesh;
    if (mesh === null) return;
    const lights = mesh.userData["lights"] as ReadonlyArray<LightPart>;
    const attr = mesh.geometry.getAttribute("aVisible") as THREE.InstancedBufferAttribute;
    lights.forEach((light, k) => {
      const on = !this.options.lit ? 0 : !this.options.viewAs ? 1 : this.flameSeen(light) ? 1 : 0;
      attr.setX(k, on);
    });
    attr.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Options, the view and the marks

  setOptions(options: RendererOptions) {
    this.options = options;
    const u = this.compMat.uniforms;
    u["uLit"]!.value = options.lit ? 1 : 0;
    u["uGrid"]!.value = options.grid ? 1 : 0;
    u["uView"]!.value = options.viewAs ? 1 : 0;
    u["uDmFloor"]!.value = options.viewAs ? 0 : 0.16;
    this.visionDirty = true;
  }

  setView(view: LevelView) {
    this.view = view;
  }

  /** Match the canvas to its box, in CSS pixels. */
  resize(width: number, height: number) {
    this.size = { width: Math.max(1, width), height: Math.max(1, height) };
    this.renderer.setSize(this.size.width, this.size.height, false);
    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.albedo.setSize(buffer.x, buffer.y);
  }

  setOverlay(marks: ReadonlyArray<Mark>) {
    this.drawMarks(this.overlayGroup, marks);
  }

  setHover(marks: ReadonlyArray<Mark>) {
    this.drawMarks(this.hoverGroup, marks);
  }

  private markMaterial(colour: MarkColour, opacity: number): THREE.MeshBasicMaterial {
    const key = `${colour}:${opacity.toFixed(3)}`;
    let m = this.markMaterials.get(key);
    if (m === undefined) {
      m = shared(
        new THREE.MeshBasicMaterial({ color: raw(this.palette.theme[colour]), opacity, ...flat }),
      );
      this.markMaterials.set(key, m);
    }
    return m;
  }

  private drawMarks(group: THREE.Group, marks: ReadonlyArray<Mark>) {
    clear(group);
    const icons = new Map<LevelLightTone, Array<{ x: number; y: number }>>();
    for (const mark of marks) {
      switch (mark.type) {
        case "strip":
          if (mark.segments.length === 0) break;
          add(
            group,
            new THREE.Mesh(
              stripGeometry(mark.segments, mark.width, mark.width / 2),
              this.markMaterial(mark.colour, mark.opacity),
            ),
            11,
          );
          break;
        case "ring": {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(
              Math.max(0, mark.radius - mark.width / 2),
              mark.radius + mark.width / 2,
              64,
            ),
            this.markMaterial(mark.colour, mark.opacity),
          );
          ring.position.set(mark.x, mark.y, 0);
          add(group, ring, 11);
          break;
        }
        case "squares": {
          if (mark.squares.length === 0) break;
          const segs: Array<Segment> = mark.squares.map((at) => {
            const column = at % mark.columns;
            const row = Math.floor(at / mark.columns);
            return { x1: column, y1: row + 0.5, x2: column + 1, y2: row + 0.5 };
          });
          add(
            group,
            new THREE.Mesh(stripGeometry(segs, 1, 0), this.markMaterial(mark.colour, mark.opacity)),
            9,
          );
          break;
        }
        case "light": {
          const list = icons.get(mark.tone) ?? [];
          list.push({ x: mark.x, y: mark.y });
          icons.set(mark.tone, list);
          break;
        }
        case "viewer": {
          const tex = this.tokenTexture(mark.viewer.name, mark.index, mark.viewer.darkvision > 0);
          if (tex === null) break;
          const m = new THREE.Mesh(
            new THREE.PlaneGeometry(0.86, 0.86),
            new THREE.MeshBasicMaterial({ map: tex, ...flat }),
          );
          m.position.set(mark.viewer.column + 0.5, mark.viewer.row + 0.5, 0);
          add(group, m, 12);
          break;
        }
        case "ghost": {
          const tex = this.propTexture(mark.prop.kind);
          if (tex === null) break;
          const spec = PROP_KINDS[mark.prop.kind];
          const turned = mark.prop.rotation % 2 !== 0;
          const w = turned ? spec.height : spec.width;
          const h = turned ? spec.width : spec.height;
          const m = new THREE.Mesh(
            new THREE.PlaneGeometry(spec.width, spec.height),
            new THREE.ShaderMaterial({
              uniforms: { map: { value: tex }, uOpacity: { value: 0.6 } },
              vertexShader: WORLD_VERT,
              fragmentShader: PROP_FRAG,
              ...flat,
            }),
          );
          m.position.set(mark.prop.x + w / 2, mark.prop.y + h / 2, 0);
          m.rotation.z = (mark.prop.rotation * Math.PI) / 2;
          add(group, m, 10);
          break;
        }
      }
    }
    // One instanced batch of light icons per tone.
    const matrix = new THREE.Matrix4();
    for (const [tone, spots] of icons) {
      const tex = this.iconTexture(tone);
      if (tex === null) continue;
      const mesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.55, 0.55),
        new THREE.MeshBasicMaterial({ map: tex, ...flat }),
        spots.length,
      );
      spots.forEach((s, k) => mesh.setMatrixAt(k, matrix.makeTranslation(s.x, s.y, 0)));
      mesh.instanceMatrix.needsUpdate = true;
      add(group, mesh, 10);
    }
  }

  private canvas2d(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    let c: CanvasRenderingContext2D | null = null;
    try {
      c = canvas.getContext("2d");
    } catch {
      c = null;
    }
    return c === null ? null : { canvas, c };
  }

  private iconTexture(tone: LevelLightTone): THREE.CanvasTexture | null {
    const known = this.iconTextures.get(tone);
    if (known !== undefined) return known;
    const surface = this.canvas2d(64, 64);
    if (surface === null) return null;
    const { canvas, c } = surface;
    const colour = css(this.palette.level[`light-${tone}`]);
    const ink = css(this.palette.theme.ink);
    const stroke = (x1: number, y1: number, x2: number, y2: number, col: string, lw: number) => {
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.strokeStyle = col;
      c.lineWidth = lw;
      c.lineCap = "round";
      c.stroke();
    };
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const [cx, cy] = [Math.cos(a), Math.sin(a)];
      stroke(32 + cx * 16, 32 + cy * 16, 32 + cx * 26, 32 + cy * 26, ink, 7);
      stroke(32 + cx * 16, 32 + cy * 16, 32 + cx * 25, 32 + cy * 25, colour, 3);
    }
    c.beginPath();
    c.arc(32, 32, 11, 0, Math.PI * 2);
    c.fillStyle = colour;
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = ink;
    c.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    this.iconTextures.set(tone, tex);
    return tex;
  }

  /** A viewer's token: an inked disc in one of the party's colours, its initial, a darkvision badge. */
  private tokenTexture(
    name: string,
    index: number,
    darkvision: boolean,
  ): THREE.CanvasTexture | null {
    const key = `${name}:${String(index)}:${String(darkvision)}`;
    const known = this.tokenTextures.get(key);
    if (known !== undefined) return known;
    const surface = this.canvas2d(128, 128);
    if (surface === null) return null;
    const { canvas, c } = surface;
    const theme = this.palette.theme;
    const tones = [theme.accent, theme.success, theme.info, theme.magic];
    const font = getComputedStyle(this.host).getPropertyValue("--font-sans").trim() || "sans-serif";
    c.beginPath();
    c.arc(64, 64, 54, 0, Math.PI * 2);
    c.fillStyle = css(theme.card);
    c.fill();
    c.lineWidth = 10;
    c.strokeStyle = css(theme.ink);
    c.stroke();
    c.beginPath();
    c.arc(64, 64, 44, 0, Math.PI * 2);
    c.fillStyle = css(tones[index % tones.length]!);
    c.fill();
    c.fillStyle = css(theme.onAccent);
    c.font = `700 ${String(TOKEN_LETTER)}px ${font}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(name.slice(0, 1), 64, 67);
    if (darkvision) {
      c.beginPath();
      c.arc(100, 26, 14, 0, Math.PI * 2);
      c.fillStyle = css(theme.raised);
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = css(theme.ink);
      c.stroke();
      c.beginPath();
      c.arc(100, 26, 7, Math.PI / 2, (Math.PI * 3) / 2);
      c.fillStyle = css(theme.heading);
      c.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    this.tokenTextures.set(key, tex);
    return tex;
  }

  // ---------------------------------------------------------------------------
  // Thumbnails

  /** Each floor material painted by the floor shader itself, as an image URL, for the tray. */
  floorThumbnails(px = 96): ReadonlyArray<string> {
    const rt = new THREE.WebGLRenderTarget(px, px);
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.floorMat);
    mesh.position.set(1.3, 1.3, 0);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const camera = new THREE.OrthographicCamera(0.3, 2.3, 0.3, 2.3, -10, 10);
    camera.position.z = 5;
    const buf = new Uint8Array(px * px * 4);
    const out: Array<string> = [];
    const surface = this.canvas2d(px, px);
    for (let m = 0; m < LEVEL_MATERIALS.length; m++) {
      this.floorMat.uniforms["uForce"]!.value = m;
      this.renderer.setRenderTarget(rt);
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.clear();
      this.renderer.render(scene, camera);
      this.renderer.readRenderTargetPixels(rt, 0, 0, px, px, buf);
      if (surface === null) {
        out.push("");
        continue;
      }
      const img = surface.c.createImageData(px, px);
      for (let y = 0; y < px; y++) {
        img.data.set(buf.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
      }
      surface.c.putImageData(img, 0, 0);
      out.push(surface.canvas.toDataURL());
    }
    this.floorMat.uniforms["uForce"]!.value = -1;
    this.renderer.setRenderTarget(null);
    rt.dispose();
    mesh.geometry.dispose();
    return out;
  }

  // ---------------------------------------------------------------------------
  // The frame

  start() {
    if (this.raf !== undefined || this.dead) return;
    const frame = (now: number) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(frame);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stepDoors(dt: number): boolean {
    let moving = false;
    const step = this.swingMs <= 0 ? 1 : dt / this.swingMs;
    for (const s of this.swing.values()) {
      if (s.amount === s.target) continue;
      moving = true;
      s.amount =
        s.amount < s.target
          ? Math.min(s.target, s.amount + step)
          : Math.max(s.target, s.amount - step);
    }
    return moving;
  }

  private frame(now: number) {
    const level = this.level;
    if (level === null || this.lightRT === null || this.visRT === null) return;
    const dt = this.last === undefined ? 16 : Math.min(100, now - this.last);
    this.last = now;
    this.renderer.info.reset();
    if (this.stepDoors(dt)) this.rebuildLeaves();

    const { width, height } = this.size;
    const { cx, cy, zoom } = this.view;
    const w = width / zoom;
    const h = height / zoom;
    this.cam.left = cx - w / 2;
    this.cam.right = cx + w / 2;
    this.cam.top = cy - h / 2;
    this.cam.bottom = cy + h / 2;
    this.cam.updateProjectionMatrix();
    (this.compMat.uniforms["uCam"]!.value as THREE.Vector4).set(
      this.cam.left,
      this.cam.top,
      this.cam.right,
      this.cam.bottom,
    );
    const t = now / 1000;
    this.floorMat.uniforms["uTime"]!.value = t;
    this.lightMat.uniforms["uTime"]!.value = t;
    this.glowMat.uniforms["uTime"]!.value = t;

    const r = this.renderer;
    if (this.visionDirty) {
      this.visionDirty = false;
      r.setRenderTarget(this.visRT);
      r.setClearColor(0x000000, 1);
      r.clear();
      if (this.options.viewAs) r.render(this.visScene, this.boardCam);
      this.updateGlowVisibility();
    }
    const voidColour = raw(this.palette.level.void);
    r.setRenderTarget(this.albedo);
    r.setClearColor(voidColour, 1);
    r.clear();
    r.render(this.world, this.cam);
    r.setRenderTarget(this.lightRT);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(this.lightScene, this.boardCam);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(this.compScene, this.quadCam);
    r.render(this.glowScene, this.cam);
    r.render(this.overlayScene, this.cam);
    r.render(this.hoverScene, this.cam);
  }

  stats(): LevelStats {
    return {
      drawCalls: this.renderer.info.render.calls,
      lights: this.lights.length,
      lightMs: this.lightMs,
    };
  }

  dispose() {
    this.dead = true;
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    for (const group of [
      this.wallsGroup,
      this.leavesGroup,
      this.propsGroup,
      this.lightsGroup,
      this.glowGroup,
      this.visGroup,
      this.overlayGroup,
      this.hoverGroup,
    ]) {
      clear(group);
    }
    this.floorMesh.geometry.dispose();
    for (const child of this.compScene.children) (child as THREE.Mesh).geometry.dispose();
    for (const m of [
      this.floorMat,
      this.wallMat,
      this.inkMat,
      this.shadowMat,
      this.woodMat,
      this.ironMat,
      this.lightMat,
      this.glowMat,
      this.compMat,
      ...this.markMaterials.values(),
    ]) {
      m.dispose();
    }
    for (const tex of [
      ...this.propTextures.values(),
      ...this.iconTextures.values(),
      ...this.tokenTextures.values(),
    ]) {
      tex.dispose();
    }
    this.floorTex?.dispose();
    this.seesTex.dispose();
    this.seenTex.dispose();
    this.albedo.dispose();
    this.lightRT?.dispose();
    this.visRT?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
