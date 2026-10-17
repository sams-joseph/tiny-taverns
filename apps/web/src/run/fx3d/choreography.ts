import type { BoardSquare, CombatantId, DamageType } from "@taverns/api";
import * as THREE from "three";
import type { BlastPlay, StrikePlay } from "../useBoardEffects";
import { EASE, type FxEngine, rnd } from "./engine";

/**
 * What each blow does on the three.js stage (`engine.ts`), after the
 * designers' `Board Effects 3D` draft: the attacker winds up, the blow
 * travels, and it lands in an impact frame — a star, a flash of light,
 * shards and glow, a shockwave — that freezes the board for a beat. The
 * target's knock-back, the shake and the waiting damage number are the
 * board's own (`BoardStage`), so they agree with the DOM tokens.
 *
 * Positions are in grid squares (`projection.ts`): a square's centre is
 * `(column + 0.5, row + 0.5)` on the ground.
 */

/** Which palette family a damage type is drawn in; a weapon's own three share steel. */
export const familyOf = (type: DamageType | null, fallback: string): string =>
  type === null
    ? fallback
    : type === "piercing" || type === "slashing" || type === "bludgeoning"
      ? "steel"
      : type;

const crackles = (type: DamageType | null) => type === "lightning" || type === "thunder";

const ground = (square: BoardSquare, y = 0) =>
  new THREE.Vector3(square.column + 0.5, y, square.row + 0.5);

/** What a blow does to the board once it lands: shake it, knock back who it hit, let their numbers play. */
const land = (
  fx: FxEngine,
  at: number,
  squares: ReadonlyArray<BoardSquare>,
  hits: ReadonlyArray<{ readonly id: CombatantId; readonly away: { x: number; y: number } }>,
  shake: number,
  crit: boolean,
) => {
  fx.later(at, () => {
    for (const square of squares) fx.stage.landed(square);
    for (const hit of hits) fx.stage.recoil([hit.id], hit.away, crit ? 6 : 4);
  });
  fx.later(at + fx.beats.impact + 1, () => {
    const amp = fx.shakeAmp() * shake * (crit ? 2 : 1);
    fx.stage.shake(fx.squaresToPx(amp), fx.beats.shake * (shake > 1.4 ? 1.4 : 1));
  });
};

/** The attacker drawing back, then lunging (`lunge`) or holding while its spell flies. */
const windup = (fx: FxEngine, id: CombatantId, dir: THREE.Vector3): number => {
  fx.stage.recoil([id], { x: -dir.x, y: -dir.z }, 3, false);
  return fx.beats.anticipate;
};

/** One attack, played from the attacker's square to the target's; `onEnd` once all of it has gone. */
export const playStrike = (fx: FxEngine, strike: StrikePlay, onEnd: () => void) => {
  const spell = strike.delivery === "ranged-spell" || strike.delivery === "melee-spell";
  const tones = fx.tonesOf(familyOf(strike.damageType, spell ? "force" : "steel"));
  const crit = strike.outcome === "crit";
  const missed = strike.outcome === "miss" || strike.outcome === "fumble";
  const a = ground(strike.from);
  const b = ground(strike.to);
  const dir = b.clone().sub(a).setY(0);
  if (dir.lengthSq() === 0) dir.set(1, 0, 0);
  dir.normalize();
  // A miss carries on a square past the target and a little aside.
  const end = missed
    ? b
        .clone()
        .addScaledVector(dir, 0.6)
        .add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.5))
    : b.clone();
  const ant = windup(fx, strike.fromId, dir);
  const hit = { id: strike.toId, away: { x: dir.x, y: dir.z } };
  let at: number;
  let shake = 1;

  if (strike.delivery === "melee-weapon") {
    at = slash(fx, a, dir, tones, crit, ant);
  } else if (strike.delivery === "ranged-weapon") {
    at = arrow(fx, a, end, dir, tones, crit, ant);
  } else if (crackles(strike.damageType)) {
    at = forkTo(fx, a, end, tones, crit, ant);
    shake = 1.4;
  } else if (strike.delivery === "melee-spell") {
    at = grasp(fx, end.clone().setY(0.45), tones, ant);
    shake = 1.3;
  } else {
    at = bolt(fx, a, end, dir, tones, crit, ant);
    shake = 1.1;
  }

  if (missed) {
    fx.later(at, () => {
      for (let i = 0; i < 10; i++) {
        fx.emit(fx.ink, {
          p: end.clone().setY(0.15),
          v: [rnd(-1.2, 1.2), rnd(0.4, 1.4), rnd(-1.2, 1.2)],
          c: fx.color("--fx-steel-glow"),
          s: rnd(0.12, 0.22),
          life: rnd(0.4, 0.7),
          drag: 2,
          shrink: -0.4,
        });
      }
      fx.stage.landed(strike.to);
    });
  } else {
    const p = end.clone().setY(0.5);
    fx.impact(p, tones, strike.delivery === "ranged-spell" ? 1.2 : 1, crit, at);
    fx.later(at, () =>
      fx.burst(p, tones, 14, { dir: Math.atan2(dir.z, dir.x), spread: 1.2, speed: 1.3 }),
    );
    land(fx, at, [strike.to], [hit], shake, crit);
  }
  fx.later(at + fx.beats.impact + fx.beats.linger + 700, onEnd);
};

/** A crescent swept across from the attacker's side: the drawing's "Crescent" frame. */
const slash = (
  fx: FxEngine,
  a: THREE.Vector3,
  dir: THREE.Vector3,
  tones: ReturnType<FxEngine["tonesOf"]>,
  crit: boolean,
  ant: number,
): number => {
  const radius = 1.05;
  const thick = 0.34;
  const crescent = (r: number, th: number, a1: number, a2: number) => {
    const s = new THREE.Shape();
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = a1 + ((a2 - a1) * i) / n;
      if (i === 0) s.moveTo(Math.cos(t) * r, Math.sin(t) * r);
      else s.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    for (let i = n; i >= 0; i--) {
      const t = a1 + ((a2 - a1) * i) / n;
      const w = th * Math.sin((Math.PI * i) / n);
      s.lineTo(Math.cos(t) * (r - w), Math.sin(t) * (r - w));
    }
    return new THREE.ShapeGeometry(s);
  };
  const outer = new THREE.Group();
  const g = new THREE.Group();
  outer.add(g);
  g.rotation.x = -Math.PI / 2 + 0.35;
  g.add(
    fx.layer(
      crescent(radius + 0.06, thick + 0.12, -1.32, 1.32),
      fx.inkMat({ depthTest: false }),
      44,
    ),
  );
  g.add(
    fx.layer(crescent(radius, thick, -1.25, 1.25), fx.mat(tones.body, { depthTest: false }), 45),
  );
  g.add(
    fx.layer(
      crescent(radius - 0.03, thick * 0.32, -1.1, 1.1),
      fx.mat(tones.core, { depthTest: false }),
      46,
    ),
  );
  outer.position.copy(a).addScaledVector(dir, 0.1).setY(0.55);
  const yaw = Math.atan2(-dir.z, dir.x);
  const s = crit ? 1.3 : 1;
  outer.scale.setScalar(s);
  outer.visible = false;
  fx.temp(outer, ant + 900);
  fx.later(Math.max(0, ant - 20), () => (outer.visible = true));
  fx.tw(
    Math.max(0, ant - 20),
    120,
    (e) => {
      outer.rotation.y = yaw + 1.5 - 1.75 * e;
      const tip = yaw + 1.5 - 1.75 * e - 0.9;
      for (let i = 0; i < 3; i++) {
        fx.emit(fx.glow, {
          p: {
            x: outer.position.x + Math.cos(tip) * radius * s,
            y: 0.55,
            z: outer.position.z - Math.sin(tip) * radius * s,
          },
          c: tones.body,
          s: rnd(0.3, 0.5),
          life: 0.25,
          drag: 2,
        });
      }
    },
    EASE.out,
  );
  fx.tw(
    ant + 100 + fx.beats.impact,
    fx.beats.linger,
    (e) => {
      fx.op(outer, 1 - e);
      outer.rotation.y = yaw - 0.25 - 0.15 * e;
    },
    EASE.out,
  );
  return ant + 70;
};

/** An inked arrow arcing over its own shadow, trailing light. */
const arrow = (
  fx: FxEngine,
  a: THREE.Vector3,
  end: THREE.Vector3,
  dir: THREE.Vector3,
  tones: ReturnType<FxEngine["tonesOf"]>,
  crit: boolean,
  ant: number,
): number => {
  const p0 = a.clone().addScaledVector(dir, 0.4).setY(0.5);
  const p2 = end.clone().setY(0.45);
  const dist = p0.distanceTo(p2);
  const p1 = p0
    .clone()
    .lerp(p2, 0.5)
    .setY(0.6 + dist * 0.14);
  const flight = Math.max(180, (fx.beats.flight * dist) / 6);
  const g = new THREE.Group();
  const shaft = new THREE.BoxGeometry(0.62, 0.05, 0.05);
  const inkShaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.1, 0.1),
    fx.inkMat({ transparent: false }),
  );
  inkShaft.renderOrder = 40;
  const body = new THREE.Mesh(
    shaft,
    fx.mat(fx.color("--fx-steel"), { transparent: false, depthWrite: true }),
  );
  body.renderOrder = 41;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.2, 8),
    fx.mat(tones.core, { transparent: false, depthWrite: true }),
  );
  head.rotation.z = -Math.PI / 2;
  head.position.x = 0.38;
  head.renderOrder = 42;
  fx.hull(head, 0.4);
  g.add(inkShaft, body, head);
  g.scale.setScalar(crit ? 1.3 : 1.1);
  g.visible = false;
  fx.temp(g, ant + flight + 20);
  const shadow = fx.layer(new THREE.CircleGeometry(0.18, 24), fx.inkMat({ opacity: 0.5 }), 3);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.8, 0.6, 1);
  fx.temp(shadow, ant + flight);
  shadow.visible = false;
  const x = new THREE.Vector3(1, 0, 0);
  fx.later(ant, () => {
    g.visible = true;
    shadow.visible = true;
  });
  fx.tw(
    ant,
    flight,
    (e) => {
      const p = fx.quad(p0, p1, p2, e);
      const ahead = fx.quad(p0, p1, p2, Math.min(1, e + 0.02));
      g.position.copy(p);
      const tangent = ahead.clone().sub(p);
      if (tangent.lengthSq() > 0) g.quaternion.setFromUnitVectors(x, tangent.normalize());
      shadow.position.set(p.x, 0.02, p.z);
      shadow.rotation.z = -Math.atan2(dir.z, dir.x);
      fx.emit(fx.glow, { p, c: tones.core, s: rnd(0.18, 0.3), life: 0.2, drag: 3 });
    },
    EASE.lin,
  );
  return ant + flight;
};

/** A spell's orb of petals on a low arc, burning as it goes: the drawing's "Petal bloom". */
const bolt = (
  fx: FxEngine,
  a: THREE.Vector3,
  end: THREE.Vector3,
  dir: THREE.Vector3,
  tones: ReturnType<FxEngine["tonesOf"]>,
  crit: boolean,
  ant: number,
): number => {
  const p0 = a.clone().addScaledVector(dir, 0.5).setY(0.6);
  const p2 = end.clone().setY(0.5);
  const p1 = p0.clone().lerp(p2, 0.5).setY(1.4);
  const flight = Math.max(260, ((fx.beats.flight * p0.distanceTo(p2)) / 6) * 1.15);
  const s = crit ? 1.35 : 1;
  const o = fx.orb(tones, s);
  o.g.position.copy(p0);
  o.g.scale.setScalar(0.01);
  fx.temp(o.g, ant + flight + 10);
  const lamp = fx.light(p0, tones.body, 22, ant + flight + 40, Math.max(1, ant));
  fx.tw(
    0,
    Math.max(1, ant),
    (e) => {
      o.g.scale.setScalar(1.3 * e);
      o.spin.rotation.y += 0.3;
      if (Math.random() < 0.7) {
        fx.emit(fx.glow, {
          p: { x: p0.x + rnd(-0.5, 0.5), y: p0.y + rnd(-0.3, 0.4), z: p0.z + rnd(-0.5, 0.5) },
          c: tones.glow,
          s: 0.4,
          life: 0.18,
        });
      }
    },
    EASE.back,
  );
  fx.tw(
    ant,
    flight,
    (e) => {
      const p = fx.quad(p0, p1, p2, e);
      o.g.position.copy(p);
      o.g.scale.setScalar(1.3 - 0.3 * e);
      o.spin.rotation.y += 0.5;
      o.spin.rotation.z = Math.sin(e * 9) * 0.4;
      lamp.position.set(p.x, p.y + 0.4, p.z);
      for (let i = 0; i < 3; i++) {
        fx.emit(fx.glow, {
          p,
          v: [rnd(-0.5, 0.5), rnd(0, 0.8), rnd(-0.5, 0.5)],
          c: i ? tones.body : tones.glow,
          s: rnd(0.45, 0.8) * s,
          life: rnd(0.18, 0.32),
          drag: 2,
        });
      }
      if (Math.random() < 0.8) {
        fx.emit(fx.ink, {
          p,
          v: [rnd(-1, 1), rnd(0.3, 1.6), rnd(-1, 1)],
          c: Math.random() > 0.5 ? tones.core : tones.body,
          s: rnd(0.07, 0.13),
          life: rnd(0.4, 0.7),
          drag: 1,
          grav: 2,
        });
      }
    },
    EASE.in,
  );
  const at = ant + flight;
  fx.later(at, () => fx.embers(p2, tones, 14));
  return at;
};

/** A jagged bolt between two points, flickering through six strokes with branches: the drawing's "Fork". */
const fork = (
  fx: FxEngine,
  s: THREE.Vector3,
  e: THREE.Vector3,
  tones: ReturnType<FxEngine["tonesOf"]>,
  width: number,
  at: number,
) => {
  let cur: THREE.Group | null = null;
  const len = s.distanceTo(e);
  const along = e.clone().sub(s).normalize();
  const side = new THREE.Vector3(-along.z, 0, along.x);
  const build = (w: number) => {
    if (cur !== null) fx.kill(cur);
    const g = new THREE.Group();
    const pts: Array<THREE.Vector3> = [];
    const steps = Math.max(4, Math.round(len / 0.42));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const off = i === 0 || i === steps ? 0 : rnd(-0.24, 0.24);
      pts.push(
        s
          .clone()
          .addScaledVector(along, len * t)
          .addScaledVector(side, off)
          .setY(0.5 + rnd(-0.12, 0.12)),
      );
    }
    const add = (ps: ReadonlyArray<THREE.Vector3>, k: number) => {
      g.add(fx.ribbon(ps, 0.15 * k * w, fx.inkMat({ depthTest: false }), 44));
      g.add(fx.ribbon(ps, 0.085 * k * w, fx.mat(tones.body, { depthTest: false }), 45, 0.004));
      g.add(fx.ribbon(ps, 0.034 * k * w, fx.mat(tones.core, { depthTest: false }), 46, 0.008));
    };
    add(pts, 1);
    for (let k = 0; k < Math.min(4, Math.floor(steps / 3)); k++) {
      const i0 = 1 + Math.floor(Math.random() * (pts.length - 3));
      const dz = Math.random() > 0.5 ? 1 : -1;
      const branch = [pts[i0]!.clone()];
      for (let j = 0; j < 3; j++) {
        const l = branch[branch.length - 1]!;
        branch.push(
          l
            .clone()
            .addScaledVector(along, rnd(0.25, 0.45))
            .addScaledVector(side, dz * rnd(0.15, 0.35))
            .setY(0.5),
        );
      }
      add(branch, 0.55);
    }
    cur = fx.temp(g);
    return pts;
  };
  for (let k = 0; k < 6; k++) {
    fx.later(at + k * 55, () => {
      const pts = build(width * (k === 0 ? 1.3 : 1));
      if (cur !== null) fx.op(cur, k % 2 ? 0.65 : 1);
      if (k < 4)
        fx.light(pts[Math.floor(pts.length * (k % 2 ? 0.66 : 0.33))]!, tones.body, 70, 160, 10);
      if (k === 0)
        for (let i = 0; i < pts.length; i += 2)
          fx.emit(fx.glow, { p: pts[i]!, c: tones.body, s: rnd(0.8, 1.3), life: 0.25 });
    });
  }
  fx.later(at + 6 * 55 + fx.beats.impact, () => {
    const c = cur;
    cur = null;
    if (c === null) return;
    fx.tw(0, fx.beats.linger * 0.6, (q) => fx.op(c, 1 - q));
    fx.later(fx.beats.linger * 0.6, () => fx.kill(c));
  });
};

/** Lightning or thunder at one target: the charge gathering, then the fork. */
const forkTo = (
  fx: FxEngine,
  a: THREE.Vector3,
  end: THREE.Vector3,
  tones: ReturnType<FxEngine["tonesOf"]>,
  crit: boolean,
  ant: number,
): number => {
  const s = a.clone().setY(0.5);
  const charge = Math.max(ant, 240);
  const lamp = fx.light(s, tones.body, 18, charge + 380, charge);
  fx.tw(0, charge, () => {
    for (let i = 0; i < 3; i++) {
      const an = rnd(0, Math.PI * 2);
      const rr = rnd(0.5, 1.1);
      const off = [Math.cos(an) * rr, rnd(-0.2, 0.6), Math.sin(an) * rr] as const;
      fx.emit(fx.glow, {
        p: { x: s.x + off[0], y: s.y + off[1], z: s.z + off[2] },
        v: [-off[0] * 5, -off[1] * 5, -off[2] * 5],
        c: Math.random() > 0.5 ? tones.core : tones.body,
        s: 0.3,
        life: 0.2,
        drag: 0,
      });
    }
    lamp.intensity *= rnd(0.6, 1.2);
  });
  fork(fx, s, end.clone().setY(0.5), tones, crit ? 1.4 : 1, charge);
  return charge + 10;
};

/** Darkness gathering in a ring about the target and collapsing into it: the drawing's "Implosion". */
const grasp = (
  fx: FxEngine,
  p: THREE.Vector3,
  tones: ReturnType<FxEngine["tonesOf"]>,
  ant: number,
): number => {
  const sweep = 440;
  const collapse = 110;
  fx.light(p, tones.body, 30, ant + sweep + collapse + 500, ant + sweep);
  fx.tw(
    ant,
    sweep,
    (e) => {
      for (let k = 0; k < 5; k++) {
        const an = (k * Math.PI * 2) / 5 + e * 7.5;
        const rr = 1.9 * (1 - e) + 0.25;
        const q = {
          x: p.x + Math.cos(an) * rr,
          y: 0.25 + 0.5 * (1 - e) + Math.sin(e * 12 + k) * 0.08,
          z: p.z + Math.sin(an) * rr,
        };
        fx.emit(fx.ink, {
          p: q,
          c: k % 2 ? tones.body : tones.core,
          s: rnd(0.1, 0.16),
          life: 0.26,
          drag: 0,
          shrink: 0.9,
        });
        fx.emit(fx.glow, { p: q, c: tones.glow, s: 0.55, life: 0.2 });
      }
    },
    EASE.in,
  );
  const g = new THREE.Group();
  g.position.copy(p);
  const void_ = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 32, 20),
    fx.inkMat({ transparent: false }),
  );
  void_.renderOrder = 41;
  g.add(void_);
  const rim = new THREE.Mesh(void_.geometry, fx.mat(tones.body, { side: THREE.BackSide }));
  rim.scale.setScalar(1.14);
  rim.renderOrder = 40;
  void_.add(rim);
  g.scale.setScalar(0.01);
  fx.temp(g, ant + sweep + collapse + 20);
  const rimMat = rim.material as THREE.MeshBasicMaterial;
  fx.tw(
    ant + 60,
    sweep - 60,
    (e) => {
      g.scale.setScalar(e);
      rimMat.color.copy(tones.body).lerp(tones.core, Math.sin(e * 30) * 0.5 + 0.5);
    },
    EASE.back,
  );
  fx.tw(ant + sweep, collapse, (e) => g.scale.setScalar(1 - 0.88 * e), EASE.strike);
  const at = ant + sweep + collapse;
  fx.later(at, () => {
    fx.ring(p, tones.core, 0.2, 2.2, 420, 0.07);
    fx.embers(p, tones, 20, 0.5);
  });
  return at;
};

/** One area, over the template's own squares; `onEnd` once all of it has gone. */
export const playBlast = (
  fx: FxEngine,
  blast: BlastPlay,
  squares: ReadonlyArray<BoardSquare>,
  feetPerCell: number,
  onEnd: () => void,
) => {
  const { area } = blast;
  const tones = fx.tonesOf(familyOf(blast.damageType, "force"));
  const origin = ground(area.origin);
  const size = area.feet / feetPerCell;
  const aim = "toward" in area ? ground(area.toward) : origin.clone();
  const dir = aim.clone().sub(origin).setY(0);
  if (dir.lengthSq() === 0) dir.set(1, 0, 0);
  dir.normalize();
  const caught = fx.stage.standing(squares).map(({ id, square }) => {
    const there = ground(square);
    const off = there.clone().sub(origin).setY(0);
    const away =
      off.lengthSq() === 0 ? { x: 0, y: 0 } : { x: off.x / off.length(), y: off.z / off.length() };
    return { id, away };
  });
  let at: number;
  let shake = 1.2;
  if (area.shape === "sphere" || area.shape === "cube") {
    const radius = area.shape === "sphere" ? size : size / 2;
    const from = blast.from === undefined ? undefined : ground(blast.from);
    const lobbed = from !== undefined && (from.x !== origin.x || from.z !== origin.z);
    if (blast.fromId !== undefined) windup(fx, blast.fromId, dir);
    at = lobbed && from !== undefined ? lob(fx, from, origin, radius, tones) : fx.beats.anticipate;
    explosion(fx, origin, radius, tones, at);
    shake = 1.8;
  } else if (area.shape === "cone") {
    if (blast.fromId !== undefined) windup(fx, blast.fromId, dir);
    at = spikes(fx, origin, dir, size, tones, squares);
  } else {
    if (blast.fromId !== undefined) windup(fx, blast.fromId, dir);
    const end = origin.clone().addScaledVector(dir, size).setY(0.5);
    at = Math.max(fx.beats.anticipate, 240);
    if (crackles(blast.damageType)) fork(fx, origin.clone().setY(0.5), end, tones, 1.2, at);
    else beam(fx, origin.clone().setY(0.5), end, tones, at);
    shake = 1.4;
  }
  land(fx, at, squares, caught, shake, false);
  fx.later(at + fx.beats.impact + fx.beats.linger + 1200, onEnd);
};

/** The orb lobbed high from its creature onto where it bursts, over a telegraph ring: the drawing's "Dome". */
const lob = (
  fx: FxEngine,
  from: THREE.Vector3,
  at: THREE.Vector3,
  radius: number,
  tones: ReturnType<FxEngine["tonesOf"]>,
): number => {
  const ant = fx.beats.anticipate;
  const p0 = from.clone().setY(0.7);
  const dist = p0.distanceTo(at);
  const flight = Math.max(560, ((fx.beats.flight * dist) / 6) * 1.8);
  const p1 = p0.clone().lerp(at, 0.5).setY(4.2);
  const tele = new THREE.Group();
  tele.position.set(at.x, 0.05, at.z);
  tele.rotation.x = -Math.PI / 2;
  tele.add(
    fx.layer(
      new THREE.RingGeometry(radius - 0.12, radius + 0.04, 96),
      fx.inkMat({ opacity: 0.9 }),
      4,
    ),
  );
  tele.add(
    fx.layer(new THREE.RingGeometry(radius - 0.07, radius, 96), fx.mat(tones.body), 5, 0.002),
  );
  tele.scale.setScalar(0.01);
  fx.temp(tele, ant + flight + 30);
  fx.tw(0, ant + flight, (e) => {
    tele.scale.setScalar(0.6 + 0.4 * EASE.out(Math.min(1, e * 2.5)));
    tele.rotation.z = e * 1.2;
    fx.op(tele, 0.3 + 0.7 * e);
  });
  const shadow = fx.layer(new THREE.CircleGeometry(0.5, 32), fx.inkMat({ opacity: 0.55 }), 3);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  fx.temp(shadow, ant + flight);
  const o = fx.orb(tones, 1.6);
  o.g.position.copy(p0);
  o.g.scale.setScalar(0.01);
  fx.temp(o.g, ant + flight + 10);
  const lamp = fx.light(p0, tones.body, 30, ant + flight + 30, Math.max(1, ant));
  fx.tw(
    0,
    Math.max(1, ant),
    (e) => {
      o.g.scale.setScalar(e);
      o.spin.rotation.y += 0.25;
    },
    EASE.back,
  );
  fx.tw(
    ant,
    flight,
    (e) => {
      const p = fx.quad(p0, p1, at, e);
      o.g.position.copy(p);
      o.spin.rotation.y += 0.35;
      o.spin.rotation.x += 0.12;
      lamp.position.set(p.x, p.y + 0.3, p.z);
      shadow.position.x = p.x;
      shadow.position.z = p.z;
      shadow.scale.setScalar(0.4 + e * 1.2);
      fx.op(shadow, 0.2 + 0.8 * e);
      for (let i = 0; i < 4; i++) {
        fx.emit(fx.glow, {
          p,
          v: [rnd(-0.6, 0.6), rnd(-0.2, 0.6), rnd(-0.6, 0.6)],
          c: i % 2 ? tones.body : tones.glow,
          s: rnd(0.6, 1.1),
          life: rnd(0.2, 0.4),
          drag: 2,
        });
      }
      for (let i = 0; i < 2; i++) {
        fx.emit(fx.ink, {
          p,
          v: [rnd(-1.2, 1.2), rnd(0, 1.5), rnd(-1.2, 1.2)],
          c: Math.random() > 0.4 ? tones.body : tones.core,
          s: rnd(0.08, 0.15),
          life: rnd(0.5, 0.8),
          drag: 1,
          grav: 3,
        });
      }
    },
    EASE.inOut,
  );
  return ant + flight;
};

/** The burst: an inked dome swelling over the area, its rings and its fallout, and a scorch left behind. */
const explosion = (
  fx: FxEngine,
  p: THREE.Vector3,
  radius: number,
  tones: ReturnType<FxEngine["tonesOf"]>,
  at: number,
) => {
  const { impact, linger } = fx.beats;
  fx.later(at, () => {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      fx.mat(tones.body, { opacity: 0.92 }),
    );
    dome.renderOrder = 41;
    fx.hull(dome, 0.05);
    g.add(dome);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      fx.mat(tones.core, { opacity: 0.95 }),
    );
    core.renderOrder = 42;
    g.add(core);
    g.scale.setScalar(0.1);
    fx.temp(g, 170 + impact + linger + 320);
    fx.tw(0, 170, (e) => g.scale.set(radius * e, radius * 0.85 * e, radius * e), EASE.back);
    fx.tw(
      170 + impact,
      linger + 300,
      (e) => {
        g.scale.set(radius * (1 + 0.1 * e), radius * 0.85 * (1 + 0.25 * e), radius * (1 + 0.1 * e));
        core.scale.setScalar(1 - e);
        fx.op(g, 1 - e);
        g.position.y = e * 0.3;
      },
      EASE.out,
    );
    const scorch = fx.layer(
      new THREE.CircleGeometry(radius * 0.9, 48),
      fx.inkMat({ opacity: 0.6 }),
      2,
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(p.x, 0.015, p.z);
    fx.temp(scorch, 2200);
    fx.tw(400, 1800, (e) => fx.op(scorch, 1 - e));
    const up = p.clone().setY(0.6);
    fx.star(up, 1.1, tones, false);
    fx.light(p.clone().setY(0.4), tones.body, 120, 900);
    fx.emit(fx.glow, {
      p: up,
      c: tones.core,
      s: (4.5 * radius) / 2.3,
      life: 0.2,
      drag: 0,
      shrink: -0.3,
    });
    fx.ring(p, tones.body, 0.5, radius * 1.45, 480, 0.05);
    fx.ring(p, tones.core, 0.3, radius * 1.05, 320, 0.08, 40);
    for (let i = 0; i < 110; i++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(2.5, 8);
      fx.emit(fx.ink, {
        p: { x: p.x + Math.cos(a) * 0.3, y: rnd(0.2, 1), z: p.z + Math.sin(a) * 0.3 },
        v: [Math.cos(a) * v, rnd(2, 7), Math.sin(a) * v],
        c: i % 4 === 0 ? tones.core : i % 4 === 1 ? tones.glow : tones.body,
        s: rnd(0.1, 0.24),
        life: rnd(0.6, 1.1),
        drag: 1.1,
        grav: 11,
        shape: i % 2,
        shrink: 0.3,
      });
    }
    for (let i = 0; i < 60; i++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(1, 4);
      fx.emit(fx.glow, {
        p: { x: p.x, y: rnd(0.2, 1.2), z: p.z },
        v: [Math.cos(a) * v, rnd(0.5, 3), Math.sin(a) * v],
        c: i % 2 ? tones.body : tones.glow,
        s: rnd(0.7, 1.5),
        life: rnd(0.3, 0.6),
        drag: 2.5,
      });
    }
    fx.later(impact + 60, () => fx.embers(p, tones, 40, radius * 0.7));
    fx.later(impact, () => fx.freeze(fx.beats.hitstop * 1.4));
  });
};

/** A field of inked spikes bursting up across a cone, nearest first: the drawing's "Spike field". */
const spikes = (
  fx: FxEngine,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  tones: ReturnType<FxEngine["tonesOf"]>,
  squares: ReadonlyArray<BoardSquare>,
): number => {
  const ant = fx.beats.anticipate;
  const spray = 300;
  const { impact, hitstop } = fx.beats;
  const half = Math.atan(0.5);
  const heading = Math.atan2(dir.z, dir.x);
  const fan = fx.layer(
    new THREE.CircleGeometry(length, 40, -half, 2 * half),
    fx.mat(tones.glow, { opacity: 0.45 }),
    3,
  );
  fan.rotation.x = -Math.PI / 2;
  fan.rotation.z = -heading;
  fan.position.set(origin.x, 0.03, origin.z);
  fan.scale.setScalar(0.01);
  fx.temp(fan, ant + spray + 900);
  fx.tw(ant, spray, (e) => fan.scale.setScalar(e), EASE.out);
  fx.tw(ant + spray + 200, 600, (e) => fx.op(fan, 1 - e));
  fx.light(
    origin.clone().addScaledVector(dir, length * 0.45),
    tones.body,
    60,
    ant + spray + 700,
    ant + spray * 0.6,
  );
  fx.tw(ant, spray, () => {
    for (let i = 0; i < 4; i++) {
      const an = heading + rnd(-half, half);
      const v = rnd(5, 9);
      fx.emit(fx.glow, {
        p: { x: origin.x, y: 0.45, z: origin.z },
        v: [Math.cos(an) * v, rnd(-0.2, 0.4), Math.sin(an) * v],
        c: i % 2 ? tones.body : tones.core,
        s: rnd(0.4, 0.8),
        life: rnd(0.35, 0.5),
        drag: 3,
      });
    }
  });
  const cone = new THREE.ConeGeometry(1, 1, 5);
  cone.translate(0, 0.5, 0);
  cone.userData["shared"] = true;
  const solid = new THREE.MeshStandardMaterial({
    color: tones.body,
    emissive: tones.glow,
    emissiveIntensity: 0.9,
    flatShading: true,
    roughness: 0.25,
    metalness: 0.1,
  });
  solid.userData["shared"] = true;
  const inked = new THREE.MeshBasicMaterial({ color: fx.color("--fx-ink"), side: THREE.BackSide });
  inked.userData["shared"] = true;
  const hot = new THREE.MeshBasicMaterial({ color: tones.core, toneMapped: false });
  hot.userData["shared"] = true;
  const inside = (x: number, z: number) =>
    squares.some((sq) => Math.floor(x) === sq.column && Math.floor(z) === sq.row);
  for (let i = 0; i < 34; i++) {
    const d = 0.5 + Math.sqrt(Math.random()) * (length - 0.5);
    const an = heading + rnd(-half, half) * ((d / length) * 0.3 + 0.7);
    const x = origin.x + Math.cos(an) * d;
    const z = origin.z + Math.sin(an) * d;
    if (!inside(x, z)) continue;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = -an;
    const tilt = new THREE.Group();
    tilt.rotation.z = -rnd(0.15, 0.5);
    g.add(tilt);
    const r = rnd(0.1, 0.2);
    const height = rnd(0.45, 0.95) + d * 0.08;
    const m = new THREE.Mesh(cone, solid);
    m.scale.set(r, height, r);
    tilt.add(m);
    const hull = new THREE.Mesh(cone, inked);
    hull.scale.set(r * 1.35, height * 1.08, r * 1.35);
    hull.position.y = -0.02;
    tilt.add(hull);
    const tip = new THREE.Mesh(cone, hot);
    tip.scale.set(r * 0.35, height * 0.55, r * 0.35);
    tip.position.set(r * 0.15, height * 0.32, 0);
    tilt.add(tip);
    tilt.scale.set(1, 0.001, 1);
    const te = ant + (spray * d) / length;
    fx.later(te, () => {
      fx.temp(g);
      for (let k = 0; k < 2; k++)
        fx.emit(fx.glow, {
          p: { x, y: 0.1, z },
          v: [rnd(-0.5, 0.5), rnd(0.3, 1), rnd(-0.5, 0.5)],
          c: tones.body,
          s: 0.5,
          life: 0.3,
        });
    });
    fx.tw(te, 140, (e) => tilt.scale.set(1, Math.max(0.001, e), 1), EASE.back);
    const tb = te + 140 + impact + hitstop + 420 + rnd(0, 160);
    fx.later(tb, () => {
      for (let k = 0; k < 5; k++)
        fx.emit(fx.ink, {
          p: { x, y: rnd(0.1, height), z },
          v: [rnd(-2, 2), rnd(1, 3.5), rnd(-2, 2)],
          c: k % 2 ? tones.body : tones.core,
          s: rnd(0.08, 0.15),
          life: rnd(0.4, 0.7),
          drag: 1,
          grav: 9,
          shape: 1,
        });
    });
    fx.tw(
      tb,
      110,
      (e) => tilt.scale.set(1 - e * 0.7, Math.max(0.001, 1 - e), 1 - e * 0.7),
      EASE.in,
    );
    fx.later(tb + 120, () => fx.kill(g));
  }
  const at = ant + spray * 0.6;
  fx.impact(
    origin
      .clone()
      .addScaledVector(dir, length * 0.6)
      .setY(0.5),
    tones,
    0.85,
    false,
    at,
  );
  return at;
};

/** A straight beam drawn out along a line, inked, with light flaring along it. */
const beam = (
  fx: FxEngine,
  s: THREE.Vector3,
  e: THREE.Vector3,
  tones: ReturnType<FxEngine["tonesOf"]>,
  at: number,
) => {
  const steps = 24;
  const pts = Array.from({ length: steps + 1 }, (_, i) => s.clone().lerp(e, i / steps));
  const g = new THREE.Group();
  g.add(fx.ribbon(pts, 0.32, fx.inkMat({ depthTest: false }), 44));
  g.add(fx.ribbon(pts, 0.22, fx.mat(tones.body, { depthTest: false }), 45, 0.004));
  g.add(fx.ribbon(pts, 0.08, fx.mat(tones.core, { depthTest: false }), 46, 0.008));
  g.scale.set(0.001, 1, 1);
  fx.later(at - fx.beats.anticipate, () =>
    fx.temp(g, fx.beats.anticipate + fx.beats.impact + fx.beats.linger + 400),
  );
  // Grow along the line from its source: scaled about `s`, so a vertex v lands at s + q(v − s).
  fx.tw(
    at - fx.beats.anticipate,
    fx.beats.anticipate,
    (q) => {
      g.position.set(s.x * (1 - q), 0, s.z * (1 - q));
      g.scale.set(q, 1, q);
    },
    EASE.strike,
  );
  fx.later(at, () => {
    for (let i = 0; i < pts.length; i += 3)
      fx.emit(fx.glow, { p: pts[i]!, c: tones.body, s: rnd(0.8, 1.3), life: 0.3 });
    fx.light(s.clone().lerp(e, 0.5), tones.body, 80, 400, 20);
  });
  fx.tw(at + fx.beats.impact, fx.beats.linger + 300, (q) => fx.op(g, 1 - q), EASE.out);
};

/** Healing: light rising off the token in rings, motes spiralling up: the drawing's "Rising rings". */
export const playHeal = (fx: FxEngine, at: BoardSquare, onEnd: () => void) => {
  const tones = fx.tonesOf("heal");
  const p = ground(at);
  const dur = 620;
  fx.light(p.clone().setY(0.5), tones.body, 34, dur + 500, 160);
  fx.tw(0, dur, (e) => {
    for (let k = 0; k < 3; k++) {
      const an = e * 13 + (k * Math.PI * 2) / 3;
      const rr = 0.58 - e * 0.18;
      const q = { x: p.x + Math.cos(an) * rr, y: 0.1 + e * 1.7, z: p.z + Math.sin(an) * rr };
      fx.emit(fx.glow, { p: q, c: k ? tones.body : tones.glow, s: 0.45, life: 0.35, drag: 0 });
      fx.emit(fx.ink, {
        p: q,
        v: [0, 0.5, 0],
        c: k % 2 ? tones.core : tones.body,
        s: rnd(0.07, 0.12),
        life: 0.5,
        drag: 0.5,
      });
    }
  });
  for (const delay of [0, 150, 300]) {
    const g = new THREE.Group();
    g.position.set(p.x, 0.05, p.z);
    g.rotation.x = -Math.PI / 2;
    g.add(fx.layer(new THREE.RingGeometry(0.86, 1.05, 64), fx.inkMat(), 4));
    g.add(fx.layer(new THREE.RingGeometry(0.9, 1, 64), fx.mat(tones.body), 5, 0.002));
    g.scale.setScalar(0.01);
    fx.later(delay, () => fx.temp(g, 720));
    fx.tw(
      delay,
      700,
      (e) => {
        g.position.y = 0.05 + e * 1.3;
        g.scale.setScalar(0.45 + 0.35 * e);
        fx.op(g, e < 0.2 ? e * 5 : 1 - (e - 0.2) / 0.8);
      },
      EASE.out,
    );
  }
  fx.later(220, () => fx.embers(p, tones, 18, 0.45));
  fx.later(dur + 900, onEnd);
};
