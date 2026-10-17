import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { BoardStage } from "../fx/stage";
import { type GridOnPlane, projectionRows } from "./projection";

/**
 * The board's effects in three.js, after the designers' `Board Effects 3D`
 * draft (Claude Design, 2026-10-17): one transparent canvas over the board,
 * a top-down camera sheared so height reads (`projection.ts`), lit meshes
 * outlined in ink, two particle pools — a glow that adds light and inked
 * motes that cover it — flash lights at every impact, and bloom on what
 * burns white-hot.
 *
 * This file is the stage machinery: the scene, a clock that a hit-stop can
 * freeze, tweens and timed events on that clock, the pools, and the drawing
 * primitives. What each attack or area does with them is `choreography.ts`.
 * It renders only while something is playing, and clears when nothing is.
 *
 * Every beat is the theme's (`--dur-*`, `local-tokens.css`) and every colour
 * the effects palette (`--fx-*`), read at play time.
 */

/** A family's three colours: the glow under it, its body, its white-hot core. */
export interface Tones {
  readonly glow: THREE.Color;
  readonly body: THREE.Color;
  readonly core: THREE.Color;
}

/** The beats of a blow, in milliseconds (`--dur-*`), and how far a shake throws the board. */
export interface Beats {
  readonly anticipate: number;
  readonly flight: number;
  readonly impact: number;
  readonly hitstop: number;
  readonly hitstopCrit: number;
  readonly shake: number;
  readonly pop: number;
  readonly linger: number;
  readonly effect: number;
}

/** Shaping curves for the tweens, the designers' set. */
export const EASE = {
  lin: (p: number) => p,
  out: (p: number) => 1 - (1 - p) ** 3,
  in: (p: number) => p * p * p,
  inOut: (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
  back: (p: number) => {
    const c1 = 2.2;
    const c3 = c1 + 1;
    return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
  },
  strike: (p: number) => p ** 4,
} as const;

type Ease = (p: number) => number;

const VS = `attribute float size;attribute float alpha;attribute float shape;attribute vec3 pcol;
uniform float uScale;varying vec3 vC;varying float vA;varying float vS;
void main(){vC=pcol;vA=alpha;vS=shape;gl_PointSize=size*uScale;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const FS_GLOW = `varying vec3 vC;varying float vA;varying float vS;
void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.||vA<.01)discard;float a=pow(1.-d,1.8)*vA;gl_FragColor=vec4(vC*1.6,a);
#include <colorspace_fragment>
}`;
const FS_INK = `uniform vec3 uInk;varying vec3 vC;varying float vA;varying float vS;
void main(){vec2 p=gl_PointCoord-.5;float d=vS>.5?(abs(p.x)*1.6+abs(p.y))*2.:length(p)*2.;if(d>1.||vA<.02)discard;
vec3 c=d>.66?uInk:(d<.28?mix(vC,vec3(1.),.7):vC);gl_FragColor=vec4(c,vA);
#include <colorspace_fragment>
}`;

/** One particle as an effect throws it. */
export interface Mote {
  readonly p: { readonly x: number; readonly y: number; readonly z: number };
  readonly v?: readonly [number, number, number];
  readonly c: THREE.Color;
  /** Its size, in squares. */
  readonly s: number;
  /** Its life, in seconds. */
  readonly life: number;
  readonly drag?: number;
  readonly grav?: number;
  /** 1 a shard, 0 a disc (inked motes only). */
  readonly shape?: number;
  readonly shrink?: number;
}

interface Pool {
  readonly n: number;
  next: number;
  readonly pos: THREE.BufferAttribute;
  readonly col: THREE.BufferAttribute;
  readonly size: THREE.BufferAttribute;
  readonly alpha: THREE.BufferAttribute;
  readonly shape: THREE.BufferAttribute;
  readonly vel: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly s0: Float32Array;
  readonly drag: Float32Array;
  readonly grav: Float32Array;
  readonly shrink: Float32Array;
  readonly mat: THREE.ShaderMaterial;
  live: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export { rnd };

export class FxEngine {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.Camera();
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly glow: Pool;
  readonly ink: Pool;
  readonly stage: BoardStage;
  beats: Beats;
  private grid: GridOnPlane;
  private readonly host: HTMLElement;
  private readonly lights: Array<{ l: THREE.PointLight; used: number }>;
  private tws: Array<{ t0: number; dur: number; fn: (e: number, p: number) => void; ease: Ease }> =
    [];
  private evs: Array<{ t: number; fn: () => void }> = [];
  private temps: Array<THREE.Object3D> = [];
  private sim = 0;
  private freezeUntil = 0;
  private last: number | undefined;
  private raf: number | undefined;
  private dead = false;
  private readonly tones = new Map<string, Tones>();
  private pixelsPerSquare = 1;
  private quality = 1;
  private inFrame = false;
  private frameAvg = 16;
  private adapted = 0;

  constructor({ host, grid, stage }: { host: HTMLElement; grid: GridOnPlane; stage: BoardStage }) {
    this.host = host;
    this.grid = grid;
    this.stage = stage;
    this.beats = this.readBeats();
    const renderer = (this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    }));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const canvas = renderer.domElement;
    canvas.setAttribute("data-slot", "board-fx3d");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    host.appendChild(canvas);

    this.camera.matrixAutoUpdate = false;
    this.applyGrid();

    this.scene.add(
      new THREE.HemisphereLight(this.color("--fx-steel-core"), this.color("--fx-ink"), 1.4),
    );
    const key = new THREE.DirectionalLight(this.color("--fx-fire-core"), 1.1);
    key.position.set(-3, 10, -7);
    this.scene.add(key);
    this.lights = [0, 1, 2, 3].map(() => {
      const l = new THREE.PointLight(0xffffff, 0, 9, 1.25);
      this.scene.add(l);
      return { l, used: 0 };
    });
    this.glow = this.pool(1800, FS_GLOW, THREE.AdditiveBlending);
    this.ink = this.pool(1800, FS_INK, THREE.NormalBlending);
    this.ink.mat.uniforms["uInk"] = { value: this.color("--fx-ink") };

    const composer = (this.composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }),
    ));
    const render = new RenderPass(this.scene, this.camera);
    render.clearAlpha = 0;
    composer.addPass(render);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.55, 0.78));
    composer.addPass(new OutputPass());
    this.resize();
  }

  // ---------- the board ----------

  setGrid(grid: GridOnPlane) {
    this.grid = grid;
    this.applyGrid();
  }

  private applyGrid() {
    const rows = projectionRows(this.grid);
    this.camera.projectionMatrix.set(...(rows as Parameters<THREE.Matrix4["set"]>));
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }

  /** Size the canvas to the board as drawn now, zoom and all, so the effects stay sharp. */
  resize() {
    const box = this.host.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const scale =
      Math.min(1, 2048 / (box.width * ratio), 2048 / (box.height * ratio)) * this.quality;
    const width = Math.max(1, Math.round(box.width * ratio * scale));
    const height = Math.max(1, Math.round(box.height * ratio * scale));
    if (this.renderer.domElement.width !== width || this.renderer.domElement.height !== height) {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.composer.setPixelRatio(1);
      this.composer.setSize(width, height);
    }
    this.pixelsPerSquare = (width / this.grid.planeWidth) * this.grid.cell;
    for (const pool of [this.glow, this.ink]) {
      const uniform = pool.mat.uniforms["uScale"];
      if (uniform !== undefined) uniform.value = this.pixelsPerSquare;
    }
  }

  // ---------- the theme ----------

  private css(name: string): string {
    return getComputedStyle(this.host).getPropertyValue(name).trim();
  }

  color(name: string): THREE.Color {
    const value = this.css(name);
    return value === "" ? new THREE.Color(0, 0, 0) : new THREE.Color(value);
  }

  tonesOf(family: string): Tones {
    const cached = this.tones.get(family);
    if (cached !== undefined) return cached;
    const tones = {
      glow: this.color(`--fx-${family}-glow`),
      body: this.color(`--fx-${family}`),
      core: this.color(`--fx-${family}-core`),
    };
    this.tones.set(family, tones);
    return tones;
  }

  readBeats(): Beats {
    const ms = (name: string) => {
      const value = this.css(name);
      if (value.endsWith("ms")) return Number.parseFloat(value) || 0;
      if (value.endsWith("s")) return (Number.parseFloat(value) || 0) * 1000;
      return 0;
    };
    return {
      anticipate: ms("--dur-anticipate"),
      flight: ms("--dur-flight"),
      impact: ms("--dur-impact"),
      hitstop: ms("--dur-hitstop"),
      hitstopCrit: ms("--dur-hitstop-crit"),
      shake: ms("--dur-shake"),
      pop: ms("--dur-pop"),
      linger: ms("--dur-linger"),
      effect: ms("--dur-effect"),
    };
  }

  /** `n` squares as CSS pixels of the board as it is drawn, before any zoom. */
  squaresToPx(n: number): number {
    return (this.host.clientWidth / this.grid.planeWidth) * this.grid.cell * n;
  }

  /** How far the theme throws the board in a shake, in squares. */
  shakeAmp(): number {
    return Number.parseFloat(this.css("--shake-amp")) || 0;
  }

  // ---------- the clock ----------

  tw(delay: number, dur: number, fn: (e: number, p: number) => void, ease: Ease = EASE.lin) {
    this.tws.push({ t0: this.sim + delay, dur: Math.max(1, dur), fn, ease });
    this.wake();
  }

  later(delay: number, fn: () => void) {
    this.evs.push({ t: this.sim + delay, fn });
    this.wake();
  }

  /** The hit-stop: this clock and the board's DOM both hold for `ms`. */
  freeze(ms: number) {
    if (ms <= 0) return;
    this.freezeUntil = performance.now() + ms;
    void this.stage.hitStop(ms);
  }

  /**
   * Start the frames if they are stopped. Inside a frame the loop asks for the
   * next one itself, and the clock must not restart, or no time would pass.
   */
  private wake() {
    if (this.raf !== undefined || this.inFrame || this.dead) return;
    this.last = undefined;
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  private busy(): boolean {
    return (
      this.tws.length > 0 ||
      this.evs.length > 0 ||
      this.temps.length > 0 ||
      this.glow.live > 0 ||
      this.ink.live > 0
    );
  }

  private loop = (now: number) => {
    this.raf = undefined;
    if (this.dead) return;
    this.inFrame = true;
    const real = Math.min(50, now - (this.last ?? now));
    this.last = now;
    const frozen = now < this.freezeUntil;
    const dt = frozen ? 0 : real;
    this.sim += dt;
    if (this.evs.length > 0) {
      const due = this.evs.filter((e) => e.t <= this.sim);
      this.evs = this.evs.filter((e) => e.t > this.sim);
      for (const e of due) e.fn();
    }
    if (this.tws.length > 0) {
      const keep: typeof this.tws = [];
      for (const w of this.tws) {
        if (this.sim < w.t0) {
          keep.push(w);
          continue;
        }
        const p = Math.min(1, (this.sim - w.t0) / w.dur);
        w.fn(w.ease(p), p);
        if (p < 1) keep.push(w);
      }
      this.tws = keep;
    }
    if (dt > 0) {
      this.step(this.glow, dt / 1000);
      this.step(this.ink, dt / 1000);
    }
    this.composer.render();
    this.adapt(real);
    this.inFrame = false;
    // Anything emitted this frame has already asked for the next one (`wake`);
    // asking twice would double the frames every frame.
    if (this.busy()) {
      if (this.raf === undefined) this.raf = requestAnimationFrame(this.loop);
    } else {
      this.renderer.clear();
    }
  };

  /**
   * Resolution that follows the frame rate: frames slower than a 30fps budget
   * (a weak GPU, or software rendering) step the canvas down, to a third of
   * full at the least; frames comfortably inside 60fps step it back up.
   */
  private adapt(frame: number) {
    this.frameAvg = this.frameAvg * 0.85 + frame * 0.15;
    const now = performance.now();
    if (now - this.adapted < 400) return;
    if (this.frameAvg > 34 && this.quality > 0.34) {
      this.quality = Math.max(0.34, this.quality * 0.75);
    } else if (this.frameAvg < 20 && this.quality < 1) {
      this.quality = Math.min(1, this.quality * 1.15);
    } else {
      return;
    }
    this.adapted = now;
    this.resize();
  }

  dispose() {
    this.dead = true;
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    for (const o of [...this.temps]) this.kill(o);
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- particles ----------

  private pool(n: number, frag: string, blending: THREE.Blending): Pool {
    const geo = new THREE.BufferGeometry();
    const attr = (k: number) => new THREE.BufferAttribute(new Float32Array(n * k), k);
    const pool: Pool = {
      n,
      next: 0,
      pos: attr(3),
      col: attr(3),
      size: attr(1),
      alpha: attr(1),
      shape: attr(1),
      vel: new Float32Array(n * 3),
      age: new Float32Array(n),
      life: new Float32Array(n),
      s0: new Float32Array(n),
      drag: new Float32Array(n),
      grav: new Float32Array(n),
      shrink: new Float32Array(n),
      mat: new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 64 } },
        vertexShader: VS,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending,
      }),
      live: 0,
    };
    geo.setAttribute("position", pool.pos);
    geo.setAttribute("pcol", pool.col);
    geo.setAttribute("size", pool.size);
    geo.setAttribute("alpha", pool.alpha);
    geo.setAttribute("shape", pool.shape);
    const points = new THREE.Points(geo, pool.mat);
    points.frustumCulled = false;
    points.renderOrder = blending === THREE.AdditiveBlending ? 30 : 20;
    this.scene.add(points);
    return pool;
  }

  emit(pool: Pool, o: Mote) {
    const i = pool.next;
    pool.next = (i + 1) % pool.n;
    if (pool.life[i]! <= 0) pool.live += 1;
    pool.pos.array.set([o.p.x, o.p.y, o.p.z], i * 3);
    pool.vel.set(o.v ?? [0, 0, 0], i * 3);
    pool.col.array.set([o.c.r, o.c.g, o.c.b], i * 3);
    pool.s0[i] = o.s;
    pool.size.array[i] = o.s;
    pool.alpha.array[i] = 1;
    pool.shape.array[i] = o.shape ?? 0;
    pool.life[i] = o.life;
    pool.age[i] = 0;
    pool.drag[i] = o.drag ?? 1;
    pool.grav[i] = o.grav ?? 0;
    pool.shrink[i] = o.shrink ?? 0.7;
    this.wake();
  }

  private step(pool: Pool, dt: number) {
    const pa = pool.pos.array as Float32Array;
    const al = pool.alpha.array as Float32Array;
    const sz = pool.size.array as Float32Array;
    let live = 0;
    for (let i = 0; i < pool.n; i++) {
      if (pool.life[i]! <= 0) continue;
      pool.age[i]! += dt;
      const f = pool.age[i]! / pool.life[i]!;
      if (f >= 1) {
        pool.life[i] = 0;
        al[i] = 0;
        sz[i] = 0;
        continue;
      }
      live += 1;
      const k = i * 3;
      const d = Math.max(0, 1 - pool.drag[i]! * dt);
      pool.vel[k]! *= d;
      pool.vel[k + 1] = pool.vel[k + 1]! * d - pool.grav[i]! * dt;
      pool.vel[k + 2]! *= d;
      pa[k]! += pool.vel[k]! * dt;
      pa[k + 1]! += pool.vel[k + 1]! * dt;
      pa[k + 2]! += pool.vel[k + 2]! * dt;
      if (pa[k + 1]! < 0.02 && pool.grav[i]! > 0) {
        pa[k + 1] = 0.02;
        pool.vel[k + 1]! *= -0.3;
        pool.vel[k]! *= 0.6;
        pool.vel[k + 2]! *= 0.6;
      }
      al[i] = f < 0.55 ? 1 : 1 - (f - 0.55) / 0.45;
      sz[i] = pool.s0[i]! * (1 - f * pool.shrink[i]!);
    }
    pool.live = live;
    pool.pos.needsUpdate = true;
    pool.alpha.needsUpdate = true;
    pool.size.needsUpdate = true;
    pool.col.needsUpdate = true;
    pool.shape.needsUpdate = true;
  }

  // ---------- primitives ----------

  mat(color: THREE.Color, o: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      ...o,
    });
  }

  inkMat(o: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
    return this.mat(this.color("--fx-ink"), o);
  }

  /** Put `o` in the scene for `ms` (or until killed); it is never culled, the camera being its own. */
  temp<T extends THREE.Object3D>(o: T, ms?: number): T {
    o.traverse((m) => (m.frustumCulled = false));
    this.scene.add(o);
    this.temps.push(o);
    if (ms !== undefined && ms > 0) this.later(ms, () => this.kill(o));
    this.wake();
    return o;
  }

  kill(o: THREE.Object3D) {
    this.scene.remove(o);
    this.temps = this.temps.filter((x) => x !== o);
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.geometry !== undefined && mesh.geometry.userData["shared"] !== true) {
        mesh.geometry.dispose();
      }
      const material = mesh.material as THREE.Material | Array<THREE.Material> | undefined;
      for (const x of material === undefined
        ? []
        : Array.isArray(material)
          ? material
          : [material]) {
        if (x.userData["shared"] !== true) x.dispose();
      }
    });
  }

  /** Fade everything in `o` to `a` of the opacity it was made with. */
  op(o: THREE.Object3D, a: number) {
    o.traverse((m) => {
      const material = (m as THREE.Mesh).material as THREE.Material | undefined;
      if (material === undefined || Array.isArray(material)) return;
      if (material.userData["base"] === undefined) material.userData["base"] = material.opacity;
      material.opacity = (material.userData["base"] as number) * a;
    });
  }

  layer(geo: THREE.BufferGeometry, material: THREE.Material, order: number, y = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, material);
    m.renderOrder = order;
    if (y !== 0) m.position.y = y;
    return m;
  }

  /** An `n`-pointed star `r` across, in the ground plane (so the camera draws it true), jittered. */
  starGeo(r: number, n: number, inner: number, jitter: number): THREE.BufferGeometry {
    const s = new THREE.Shape();
    for (let i = 0; i < n * 2; i++) {
      const a = (Math.PI * i) / n - Math.PI / 2;
      const rr = (i % 2 ? r * inner : r) * (1 + (Math.random() - 0.5) * jitter);
      if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const geo = new THREE.ShapeGeometry(s);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  /** An ink outline behind a solid: the same shape, a touch larger, its back faces in ink. */
  hull(mesh: THREE.Mesh, k: number): THREE.Mesh {
    const h = new THREE.Mesh(
      mesh.geometry,
      this.inkMat({ side: THREE.BackSide, transparent: false }),
    );
    h.scale.setScalar(1 + k);
    h.renderOrder = mesh.renderOrder - 1;
    mesh.add(h);
    return h;
  }

  /** A flash of light at `p`: up in `rise` ms, down over the rest of `dur`. */
  light(
    p: THREE.Vector3,
    color: THREE.Color,
    peak: number,
    dur: number,
    rise = 50,
  ): THREE.PointLight {
    const slot = this.lights.reduce((a, b) => (a.used < b.used ? a : b));
    slot.used = performance.now();
    slot.l.color.copy(color);
    slot.l.position.set(p.x, p.y + 0.9, p.z);
    this.tw(0, dur, (_e, q) => {
      const t = q * dur;
      slot.l.intensity = t < rise ? (peak * t) / rise : peak * (1 - (t - rise) / (dur - rise)) ** 2;
    });
    return slot.l;
  }

  /** The impact frame's star at `p`, `r` squares across, popping out and fading. */
  star(p: THREE.Vector3, r: number, tones: Tones, crit: boolean) {
    const g = new THREE.Group();
    g.position.copy(p);
    const n = crit ? 12 : 9;
    g.add(this.layer(this.starGeo(1.25, n, 0.5, 0.3), this.inkMat({ depthTest: false }), 50));
    g.add(
      this.layer(this.starGeo(1, n, 0.42, 0.45), this.mat(tones.body, { depthTest: false }), 51),
    );
    g.add(
      this.layer(this.starGeo(0.55, n, 0.5, 0.3), this.mat(tones.core, { depthTest: false }), 52),
    );
    const total = Math.max(1, this.beats.impact);
    g.scale.setScalar(0.01);
    this.temp(g, total + 400);
    this.tw(0, total, (e) => g.scale.setScalar(r * (0.4 + 0.8 * e)), EASE.back);
    this.tw(
      total,
      260,
      (e) => {
        g.scale.setScalar(r * (1.2 + 0.6 * e));
        g.rotation.y = e * 0.3;
        this.op(g, 1 - e);
      },
      EASE.out,
    );
  }

  /** A shockwave on the ground: an inked ring from `r0` to `r1` squares. */
  ring(
    p: THREE.Vector3,
    color: THREE.Color,
    r0: number,
    r1: number,
    dur: number,
    w = 0.08,
    delay = 0,
  ) {
    const g = new THREE.Group();
    g.position.set(p.x, 0.04, p.z);
    g.rotation.x = -Math.PI / 2;
    g.add(this.layer(new THREE.RingGeometry(1 - w * 1.8, 1 + w * 0.8, 72), this.inkMat(), 5));
    g.add(this.layer(new THREE.RingGeometry(1 - w, 1, 72), this.mat(color), 6, 0.002));
    g.scale.setScalar(0.001);
    this.later(delay, () => this.temp(g, dur + 20));
    this.tw(
      delay,
      dur,
      (e) => {
        g.scale.setScalar(r0 + (r1 - r0) * e);
        this.op(g, e < 0.5 ? 1 : 1 - (e - 0.5) * 2);
      },
      EASE.out,
    );
  }

  /** Inked shards and glow thrown from `p`, `n` of them, fanned about `dir` when given. */
  burst(
    p: { readonly x: number; readonly y: number; readonly z: number },
    tones: Tones,
    n: number,
    o: { dir?: number; spread?: number; speed?: number; size?: number } = {},
  ) {
    const sp = o.speed ?? 1;
    for (let i = 0; i < n; i++) {
      const a =
        o.dir !== undefined
          ? o.dir + rnd(-(o.spread ?? 1) / 2, (o.spread ?? 1) / 2)
          : rnd(0, Math.PI * 2);
      const v = rnd(2, 5.5) * sp;
      this.emit(this.ink, {
        p,
        v: [Math.cos(a) * v, rnd(1, 4.5) * sp, Math.sin(a) * v],
        c: i % 3 ? tones.body : tones.core,
        s: rnd(0.09, 0.2) * (o.size ?? 1),
        life: rnd(0.45, 0.85),
        drag: 1.4,
        grav: 9,
        shape: 1,
        shrink: 0.4,
      });
    }
    for (let i = 0; i < n * 0.7; i++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(0.8, 3) * sp;
      this.emit(this.glow, {
        p,
        v: [Math.cos(a) * v, rnd(0.3, 2), Math.sin(a) * v],
        c: i % 2 ? tones.body : tones.glow,
        s: rnd(0.35, 0.7) * (o.size ?? 1),
        life: rnd(0.25, 0.5),
        drag: 3,
      });
    }
  }

  /** Embers rising from about `p`, `spread` squares around it. */
  embers(
    p: { readonly x: number; readonly y: number; readonly z: number },
    tones: Tones,
    n: number,
    spread = 0.4,
  ) {
    for (let i = 0; i < n; i++) {
      this.emit(this.ink, {
        p: { x: p.x + rnd(-spread, spread), y: p.y + rnd(0, 0.3), z: p.z + rnd(-spread, spread) },
        v: [rnd(-0.4, 0.4), rnd(0.8, 2), rnd(-0.4, 0.4)],
        c: Math.random() > 0.5 ? tones.core : tones.body,
        s: rnd(0.05, 0.1),
        life: rnd(0.7, 1.3),
        drag: 0.8,
      });
    }
  }

  /** A blow landing at `p`: the star, a flash of light, a burst, a ring, and the freeze `beats.impact` after. */
  impact(p: THREE.Vector3, tones: Tones, size: number, crit: boolean, delay = 0) {
    const go = () => {
      const k = size * (crit ? 1.35 : 1);
      this.star(p, 0.55 * k, tones, crit);
      this.light(p, tones.body, 55 * k, 560);
      this.emit(this.glow, { p, c: tones.core, s: 2.4 * k, life: 0.16, drag: 0, shrink: -0.5 });
      this.burst(p, tones, Math.round(24 * k), { size: Math.min(1.4, k) });
      this.ring(p, tones.body, 0.25, 1.4 * k, 360);
      if (crit) {
        const radiant = this.tonesOf("radiant");
        this.ring(p, radiant.body, 0.4, 2.6 * k, 520, 0.06, this.beats.impact);
        this.burst(p, radiant, 14);
      }
      this.later(this.beats.impact, () =>
        this.freeze(crit ? this.beats.hitstopCrit : this.beats.hitstop),
      );
    };
    if (delay > 0) this.later(delay, go);
    else go();
  }

  /** Six inked petals about a white core: a spell's orb, `s` times its size. */
  orb(tones: Tones, s: number): { g: THREE.Group; spin: THREE.Group } {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    const petal = new THREE.SphereGeometry(1, 14, 10);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        petal,
        this.mat(tones.body, { depthWrite: true, transparent: false }),
      );
      m.scale.set(0.24 * s, 0.08 * s, 0.1 * s);
      m.position.set(
        Math.cos((i * Math.PI) / 3) * 0.15 * s,
        0,
        Math.sin((i * Math.PI) / 3) * 0.15 * s,
      );
      m.rotation.y = (-i * Math.PI) / 3;
      m.renderOrder = 41;
      this.hull(m, 0.35);
      spin.add(m);
    }
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.11 * s, 16, 12),
      this.mat(tones.core, { transparent: false, depthWrite: true }),
    );
    core.renderOrder = 42;
    this.hull(core, 0.3);
    g.add(core);
    return { g, spin };
  }

  /** A point on the quadratic curve through `a`, `b`, `c` at `t`. */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number): THREE.Vector3 {
    const u = 1 - t;
    return new THREE.Vector3(
      u * u * a.x + 2 * u * t * b.x + t * t * c.x,
      u * u * a.y + 2 * u * t * b.y + t * t * c.y,
      u * u * a.z + 2 * u * t * b.z + t * t * c.z,
    );
  }

  /** A flat ribbon along `pts`, `w` squares either side, lying on the ground at its points' heights. */
  ribbon(
    pts: ReadonlyArray<THREE.Vector3>,
    w: number,
    material: THREE.Material,
    order: number,
    lift = 0,
  ): THREE.Mesh {
    const pos: Array<number> = [];
    const idx: Array<number> = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(pts.length - 1, i + 1)]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * w;
      const nz = (dx / l) * w;
      pos.push(p.x + nx, p.y + lift, p.z + nz, p.x - nx, p.y + lift, p.z - nz);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, material);
    m.renderOrder = order;
    return m;
  }
}
