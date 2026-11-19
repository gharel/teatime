/* ------------------------------------------------------------------
 * Emma — portrait vectoriel animé, style « flat » de face : longs cheveux
 * ondulés châtain foncé (mèches cuivrées), peau hâlée, regard en amande
 * souligné d'eye-liner, lèvres corail.
 * Les formes viennent de emmaShapes.ts (relevées au sous-pixel sur le
 * portrait de référence) ; ce fichier les assemble et les anime :
 *  - paupières (vrai clignement) : le liner et les cils suivent la paupière ;
 *  - bouche : lèvres relevées déformées selon les visèmes (largeur,
 *    commissures, ouverture), dents et langue dans l'ouverture ;
 *  - respiration, micro-mouvements de tête (cheveux solidaires), regard,
 *    sourcils.
 * Animation en requestAnimationFrame, écriture directe dans le DOM SVG.
 * ------------------------------------------------------------------ */
import { useEffect, useId, useRef } from 'react';
import { lerpShape, lipsync, VISEMES, type MouthShape } from '../lib/lipsync';
import { EYES, HAIR, LIPS, SHAPES as S, type EyeData } from './emmaShapes';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type AvatarMood = 'neutral' | 'happy' | 'concerned';

interface Props {
  state: AvatarState;
  mood?: AvatarMood;
  className?: string;
  label?: string;
}

type P = [number, number];
const f = (n: number) => n.toFixed(2);
const pt = (p: P) => `${f(p[0])},${f(p[1])}`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpP = (a: P, b: P, t: number): P => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Segments de Bézier d'une courbe de Catmull-Rom passant par les points (pts[0] = point courant). */
function through(pts: P[], closed = false): string {
  const n = pts.length;
  const at = (i: number): P => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = '';
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}
const smoothPath = (pts: P[]) => `M${pt(pts[0])}${through(pts)}`;

/* ------------------------------ Palette ------------------------------ */

const C = {
  hair: '#352224',
  hairLine: '#140a09',
  mouth: '#6b2320',
  tongue: '#d9665e',
  teeth: '#fffaf5',
};

/* ------------------------------ Cheveux ------------------------------ */

/** Silhouette extérieure : bas de la mèche gauche → sommet → pointe droite. */
const HAIR_EDGE: P[] = [
  [45.3, 480], [46.4, 474], [42.6, 468], [38.7, 462], [35.4, 456], [32, 450], [28.8, 444], [26.2, 438],
  [23.6, 432], [21.5, 426], [20.2, 420], [19.2, 414], [18.8, 408], [19.2, 402], [20.1, 396], [21.5, 390],
  [23.8, 384], [26.8, 378], [30.3, 372], [34.6, 366], [39.5, 360], [45.4, 354], [51.4, 348], [57.3, 342],
  [62.3, 336], [66.6, 330], [69.6, 324], [71.8, 318], [73, 312], [73.7, 306], [73.7, 300], [72.8, 294],
  [71.5, 288], [70.5, 282], [69.6, 276], [68.2, 270], [67.3, 264], [66.8, 258], [66.9, 252], [67.4, 246],
  [68.6, 240], [70.3, 234], [72.4, 228], [74.9, 222], [77.8, 216], [81.2, 210], [84.6, 204], [88.5, 198],
  [92.5, 192], [96.6, 186], [100.6, 180], [105.1, 174], [109, 168], [112.7, 162], [116.3, 156], [119.6, 150],
  [122.8, 144], [125.7, 138], [128.5, 132], [131.4, 126], [134.1, 120], [136.9, 114], [139.7, 108], [142.4, 102],
  [145.5, 96], [150, 87.9], [156, 78.2], [162, 69.6], [168, 62.4], [174, 55.6], [180, 50], [186, 44.5],
  [192, 39.9], [198, 35.9], [204, 32.3], [210, 29.2], [216, 26.6], [222, 24.7], [228, 23.4], [234, 22.7],
  [240, 22.6], [246, 23.2], [252, 24.4], [258, 26.5], [264, 30.4], [270, 35.1], [276, 36.3], [282, 33.6],
  [288, 31.1], [294, 29.8], [300, 29.5], [306, 29.8], [312, 30.8], [318, 32.5], [324, 35.1], [330, 38.3],
  [336, 42.3], [342, 47.1], [348, 52.9], [354, 59.4], [357.7, 64], [362.4, 70], [366.7, 76], [370.7, 82],
  [374.6, 88], [378.2, 94], [381.7, 100], [385.4, 106], [388.7, 112], [392.4, 118], [395.8, 124], [398.5, 128],
  [400.8, 132], [403.5, 136], [406.4, 140], [409.1, 144], [412, 148], [415.2, 152], [418, 156], [421.2, 160],
  [424.2, 164], [426.9, 168], [429.8, 172], [432.5, 176], [435, 180], [437.5, 184], [439.8, 188], [442, 192],
  [443.8, 196], [445.6, 200], [447.1, 204], [448.3, 208], [449.1, 212], [449.5, 216], [449.6, 220], [449.4, 224],
  [449.2, 228], [449.2, 232], [449.7, 236], [450.9, 240], [452.8, 244], [455.1, 250], [456.6, 256], [457.4, 262],
  [457.5, 268], [457.3, 274], [456.4, 280], [454.9, 286], [453, 292], [450.6, 298], [447.5, 304], [444.1, 310],
  [440.7, 316], [437.1, 322], [433.8, 328], [430.6, 334], [428.1, 340], [426.1, 346], [424.7, 352], [423.7, 358],
  [423.4, 364], [423.6, 370], [424.4, 376], [425.6, 382], [427.5, 388], [429.9, 394], [432.8, 400], [436.6, 406],
  [441, 412], [446.3, 418], [452.1, 424], [458.4, 430], [465.1, 436], [472.6, 442], [479.7, 448], [486.8, 454],
  [496.5, 463], [501, 468], [504.5, 473], [507, 477], [509, 481], [511.2, 486], [512.8, 492], [513.3, 500],
  [513.2, 508], [512, 514], [510.4, 520], [508.6, 526], [506.8, 531], [505, 535],
];
const HAIR_OUTLINE = smoothPath(HAIR_EDGE);
/** Masse arrière fermée derrière le buste. */
const HAIR_BACK = `${HAIR_OUTLINE}L494,546 L468,562 L120,568 L60,540 L48,500Z`;

/* ------------------------------ Buste ------------------------------ */

/** Remplissage caché sous la mèche gauche (relie l'épaule gauche au buste quand la tête bouge). */
const UNDER_LOCK = `M201,424${through([
  [201, 424], [197.5, 432], [192, 440], [189, 448], [189, 456], [192, 464], [196, 472], [198.5, 480], [198.5, 488],
  [197, 496], [193, 504], [186, 512], [177, 520], [171, 528], [163, 536], [159, 544], [157, 552], [156, 560],
  [157, 568], [160.5, 576], [162.5, 592],
])}L36,592 L40,500 L46,484 L90,469 L150,453Z`;

/** Ombre du cou prolongée sous le bord droit de la mèche (visible quand la tête bouge). */
const NECK_UNDER_LOCK = `M199.3,399${through([
  [199.3, 399], [198.5, 408], [196, 416], [193, 424], [189.5, 432], [184, 440], [181, 448], [181, 456], [184, 464],
  [188, 472], [190.5, 480],
])}L190.5,481.6 L199,481.6${through([
  [199, 481.6], [198.5, 480], [196, 472], [192, 464], [189, 456], [189, 448], [192, 440], [197.5, 432], [201, 424],
  [204, 416], [206.5, 408], [207, 399],
])}Z`;

/* ------------------------------ Visage ------------------------------ */


/* ------------------------------ Bouche ------------------------------ */

/** Centre de la bouche, ligne de jonction au centre, demi-largeur au repos (relevés). */
const CX = (LIPS.top[0][0] + LIPS.top[LIPS.top.length - 1][0]) / 2;
const CY = LIPS.seam[Math.floor(LIPS.seam.length / 2)][1];
const LIP_W = (LIPS.top[LIPS.top.length - 1][0] - LIPS.top[0][0]) / 2;

function mouthGeo(s: MouthShape, smile: number) {
  const w = LIP_W * (0.6 + 0.4 * s.wide) * (1 - 0.24 * (s.round - 0.1)) + (smile - 1) * 0.5;
  return {
    sx: w / LIP_W,
    a: w * (0.64 - 0.14 * s.round),
    t: s.open * 8,
    b: s.open * 15,
    lift: (smile - 1) * 0.8,
  };
}
type MouthGeo = ReturnType<typeof mouthGeo>;

/** Profil d'ouverture : 1 au centre, 0 au-delà de la demi-largeur a. */
const openAt = (dx: number, a: number) => {
  const k = dx / Math.max(1, a);
  return Math.abs(k) >= 1 ? 0 : Math.pow(1 - k * k, 0.85);
};

/** Déplace les points relevés : largeur, commissures relevées, ouverture. */
function lipPts(pts: readonly (readonly number[])[], g: MouthGeo, dy: (u: number, o: number) => number): P[] {
  return pts.map((q) => {
    const u = (q[0] - CX) / LIP_W;
    const dx = (q[0] - CX) * g.sx;
    return [CX + dx, q[1] - g.lift * u * u + dy(u, openAt(dx, g.a))];
  });
}

const chainPath = (a: P[], b: P[]) => `M${pt(a[0])}${through(a)}L${pt(b[0])}${through(b)}Z`;

function mouthPaths(g: MouthGeo) {
  const top = lipPts(LIPS.top, g, (u) => -g.t * 0.35 * (1 - u * u));
  const bottom = lipPts(LIPS.bottom, g, (u) => g.b * 0.92 * (1 - 0.85 * u * u));
  const seamUp = lipPts(LIPS.seam, g, (_, o) => -g.t * o);
  const seamLo = lipPts(LIPS.seam, g, (_, o) => g.b * o);
  return {
    upper: chainPath(top, [...seamUp].reverse()),
    lower: chainPath(seamLo, bottom),
    inner: chainPath(seamUp, [...seamLo].reverse()),
    drop: g.b * 0.92,
  };
}

/* ------------------------------ Yeux ------------------------------ */

const bezAt = (p0: P, p1: P, p2: P, p3: P, t: number, k: 0 | 1) => {
  const u = 1 - t;
  return u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k];
};

/** Paramètre t de la paupière ouverte au droit de x (bissection), ou -1 hors de l'œil. */
function lidT(e: EyeData, x: number): number {
  if (x <= Math.min(e.inner[0], e.outer[0]) || x >= Math.max(e.inner[0], e.outer[0])) return -1;
  const dir = Math.sign(e.outer[0] - e.inner[0]);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if ((bezAt(e.inner, e.upOpen[0], e.upOpen[1], e.outer, mid, 0) - x) * dir < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Paupière fermée : posée juste au-dessus de la paupière inférieure. */
const closedLid = (e: EyeData): [P, P] => [
  [e.low[1][0], e.low[1][1] - 1.2],
  [e.low[0][0], e.low[0][1] - 1.2],
];

/** Paramètre de paupière de chaque point du liner (précalculé). */
const LINER_T = {
  L: EYES.L.liner.map((c) => c.map((q) => lidT(EYES.L, q[0]))),
  R: EYES.R.liner.map((c) => c.map((q) => lidT(EYES.R, q[0]))),
};

function eyePaths(side: 'L' | 'R', lid: number) {
  const e = EYES[side];
  const cl = closedLid(e);
  const u1 = lerpP(cl[0], e.upOpen[0], lid);
  const u2 = lerpP(cl[1], e.upOpen[1], lid);
  const upper = `M${pt(e.inner)} C${pt(u1)} ${pt(u2)} ${pt(e.outer)}`;
  const opening = `${upper}${through(e.lowPts)}Z`;
  /* le liner (cils compris) suit la paupière */
  const ts = LINER_T[side];
  let liner = '';
  e.liner.forEach((chain, ci) => {
    const moved = chain.map((q, k): P => {
      const t = ts[ci][k];
      if (t < 0 || lid === 1) return q;
      const dy = bezAt(e.inner, u1, u2, e.outer, t, 1) - bezAt(e.inner, e.upOpen[0], e.upOpen[1], e.outer, t, 1);
      return [q[0], q[1] + dy];
    });
    if (ci === 0) liner += `M${pt(moved[0])}`;
    liner += e.linerClosed ? through(moved.slice(0, -1), true) : through(moved);
  });
  return { opening, liner: `${liner}Z` };
}

/* ------------------------------ Composant ------------------------------ */

export default function Avatar({ state, mood = 'neutral', className, label = 'Emma, votre prof d’anglais' }: Props) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${n}-${uid}`;
  const url = (n: string) => `url(#${id(n)})`;
  const stateRef = useRef(state);
  const moodRef = useRef(mood);
  stateRef.current = state;
  moodRef.current = mood;

  const head = useRef<SVGGElement>(null);
  const headBack = useRef<SVGGElement>(null);
  const headLock = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const browL = useRef<SVGGElement>(null);
  const browR = useRef<SVGGElement>(null);
  const lips = useRef<SVGPathElement>(null);
  const upperLip = useRef<SVGPathElement>(null);
  const inner = useRef<SVGPathElement>(null);
  const mclip = useRef<SVGPathElement>(null);
  const teeth = useRef<SVGRectElement>(null);
  const tongue = useRef<SVGEllipseElement>(null);
  const seam = useRef<SVGPathElement>(null);
  const cornerL = useRef<SVGPathElement>(null);
  const cornerR = useRef<SVGPathElement>(null);
  const chinShade = useRef<SVGGElement>(null);
  const lWhite = useRef<SVGPathElement>(null);
  const lClip = useRef<SVGPathElement>(null);
  const lLiner = useRef<SVGPathElement>(null);
  const lIris = useRef<SVGGElement>(null);
  const lBall = useRef<SVGGElement>(null);
  const rBall = useRef<SVGGElement>(null);
  const rWhite = useRef<SVGPathElement>(null);
  const rClip = useRef<SVGPathElement>(null);
  const rLiner = useRef<SVGPathElement>(null);
  const rIris = useRef<SVGGElement>(null);
  const eyeRefs = {
    L: { white: lWhite, clip: lClip, liner: lLiner, iris: lIris, ball: lBall },
    R: { white: rWhite, clip: rClip, liner: rLiner, iris: rIris, ball: rBall },
  };

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    let cur: MouthShape = { ...VISEMES.rest };
    let nextBlink = t0 + 1600 + Math.random() * 2500;
    let blinkStart = -1;
    let blinkDur = 140;
    let gaze: P = [0, 0];
    let gazeTarget: P = [0, 0];
    let nextSaccade = t0 + 1200;
    let brow = 0;
    let smileCur = 1;
    let lidBase = 1;
    let tiltCur = 0;
    let wasSpeaking = false;
    const setD = (r: { current: SVGPathElement | null }, d: string) => r.current?.setAttribute('d', d);

    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const time = now - t0;
      const st = stateRef.current;
      const md = moodRef.current;
      const ease = (tau: number) => 1 - Math.exp(-dt / tau);

      /* respiration */
      const breath = reduce ? 0 : Math.sin((time / 4300) * Math.PI * 2);
      body.current?.setAttribute('transform', `translate(0 ${f(-breath * 1.6)})`);

      /* bouche */
      const speaking = lipsync.isSpeaking(now);
      let target: MouthShape;
      let intensity = 0;
      if (speaking) {
        const s = lipsync.sample(now);
        intensity = s.intensity;
        target = lerpShape(VISEMES[s.v], VISEMES[s.next], s.mix);
        const closing = s.v === 'MBP' || s.v === 'FV';
        if (!closing) target = { ...target, open: target.open * 0.9 * Math.min(1.1, s.intensity || 1) };
      } else {
        target = { ...VISEMES.rest, open: md === 'happy' ? 0.06 : 0.01 };
      }
      cur = lerpShape(cur, target, ease(speaking ? 55 : 110));
      const smileTarget = md === 'happy' ? 3 : md === 'concerned' ? -0.6 : st === 'listening' ? 2.2 : 1;
      smileCur += (smileTarget - smileCur) * ease(220);
      const smile = 1 + (smileCur - 1) * (1 - cur.open * 0.8) * (1 - cur.round * 0.9);
      const g = mouthGeo(cur, smile);
      const mp = mouthPaths(g);
      setD(lips, mp.lower);
      setD(upperLip, mp.upper);
      setD(inner, mp.inner);
      setD(mclip, mp.inner);
      const visible = cur.open > 0.04 ? 1 : 0;
      inner.current?.setAttribute('opacity', String(visible));
      seam.current?.setAttribute('transform', `translate(${f(CX * (1 - g.sx))} 0) scale(${f(g.sx)} 1)`);
      seam.current?.setAttribute('opacity', String(1 - visible));
      const cornerOp = f(1 - 0.7 * cur.round);
      for (const [ref, x] of [
        [cornerL, LIPS.top[0][0]],
        [cornerR, LIPS.top[LIPS.top.length - 1][0]],
      ] as const) {
        ref.current?.setAttribute('transform', `translate(${f((g.sx - 1) * (x - CX))} ${f(-g.lift)})`);
        ref.current?.setAttribute('opacity', cornerOp);
      }
      if (teeth.current) {
        teeth.current.setAttribute('x', f(CX - g.a * 0.86));
        teeth.current.setAttribute('y', f(CY - g.t - 0.8));
        teeth.current.setAttribute('width', f(g.a * 1.72));
        teeth.current.setAttribute('height', f((2 + 4.5 * cur.teeth) * (cur.teeth > 0.05 ? 1 : 0)));
      }
      if (tongue.current) {
        tongue.current.setAttribute('cy', f(CY + g.b - (g.b + g.t) * 0.3 * cur.tongue));
        tongue.current.setAttribute('rx', f(g.a * 0.62));
        tongue.current.setAttribute('ry', f(Math.max(0.1, (g.b * 0.5 + 2) * (0.4 + cur.tongue))));
      }
      const shadeX = Math.min(1, g.sx);
      chinShade.current?.setAttribute('transform', `translate(${f(CX * (1 - shadeX))} ${f(mp.drop)}) scale(${f(shadeX)} 1)`);

      /* paupières */
      if (speaking && !wasSpeaking && Math.random() < 0.5) nextBlink = Math.min(nextBlink, now + 120);
      wasSpeaking = speaking;
      if (now > nextBlink && blinkStart < 0) {
        blinkStart = now;
        blinkDur = 120 + Math.random() * 60;
      }
      let blink = 0;
      if (blinkStart >= 0) {
        const p = (now - blinkStart) / blinkDur;
        if (p >= 1) {
          blinkStart = -1;
          nextBlink = now + 2400 + Math.random() * 4200;
          if (Math.random() < 0.18) nextBlink = now + 180;
        } else blink = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
      }
      const lidTarget = md === 'happy' ? 0.95 : st === 'listening' ? 1.04 : st === 'thinking' ? 0.92 : 1;
      lidBase += (lidTarget - lidBase) * ease(200);
      const lid = Math.max(0, lidBase * (1 - blink));

      /* regard */
      if (now > nextSaccade) {
        nextSaccade = now + 700 + Math.random() * 2300;
        gazeTarget = [(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 1.6];
        if (st === 'listening' || speaking) gazeTarget = [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1];
      }
      const gz: P = st === 'thinking' ? [-4, -2.6] : gazeTarget;
      gaze = [gaze[0] + (gz[0] - gaze[0]) * ease(45), gaze[1] + (gz[1] - gaze[1]) * ease(45)];
      for (const side of ['L', 'R'] as const) {
        const r = eyeRefs[side];
        const ep = eyePaths(side, lid);
        setD(r.white, ep.opening);
        setD(r.clip, ep.opening);
        setD(r.liner, ep.liner);
        r.ball.current?.setAttribute('opacity', lid < 0.07 ? '0' : '1');
        r.iris.current?.setAttribute('transform', `translate(${f(gaze[0])} ${f(gaze[1] + (1 - Math.min(1, lid)) * 1.6)})`);
      }

      /* sourcils */
      const browTarget = st === 'listening' ? -3.5 : md === 'happy' ? -2 : md === 'concerned' ? 1.4 : st === 'thinking' ? -1.6 : 0;
      brow += (browTarget - brow) * ease(140);
      const talkBrow = speaking ? Math.max(0, Math.sin(time / 520)) * intensity * -1.7 : 0;
      browL.current?.setAttribute('transform', `translate(0 ${f(brow + talkBrow)}) rotate(${md === 'concerned' ? -5 : 0} 242 196)`);
      browR.current?.setAttribute(
        'transform',
        `translate(0 ${f(brow + talkBrow + (st === 'thinking' ? -3 : 0))}) rotate(${md === 'concerned' ? 5 : 0} 286 196)`,
      );

      /* tête (les cheveux suivent) */
      if (!reduce) {
        const tiltTarget = (st === 'listening' ? 2.2 : 0) + (st === 'thinking' ? -1.6 : 0);
        tiltCur += (tiltTarget - tiltCur) * ease(400);
        const tilt = tiltCur + Math.sin(time / 2300) * 0.8 + Math.sin(time / 1270 + 1.3) * 0.35;
        const nod = speaking ? Math.sin(time / 190) * 1.1 * intensity + Math.sin(time / 470) * 0.7 * intensity : 0;
        const dx = Math.sin(time / 2700) * 1.4 + Math.sin(time / 1630 + 0.7) * 0.6;
        const dy = -breath * 0.9 + Math.sin(time / 1900 + 2) * 0.7 + nod;
        const tr = `translate(${f(dx)} ${f(dy)}) rotate(${f(tilt)} 265 390)`;
        head.current?.setAttribute('transform', tr);
        headBack.current?.setAttribute('transform', tr);
        headLock.current?.setAttribute('transform', tr);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initL = eyePaths('L', 1);
  const initR = eyePaths('R', 1);
  const initMouth = mouthPaths(mouthGeo(VISEMES.rest, 1));

  const renderEye = (side: 'L' | 'R', init: ReturnType<typeof eyePaths>) => {
    const e = EYES[side];
    const r = eyeRefs[side];
    const [cx, cy, R] = e.iris;
    return (
      <g>
        <path d={e.crease} stroke={e.colCrease} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <clipPath id={id(`eyeclip-${side}`)}>
          <path ref={r.clip} d={init.opening} />
        </clipPath>
        <g ref={r.ball} clipPath={url(`eyeclip-${side}`)}>
          <path ref={r.white} d={init.opening} fill={e.colSclera} />
          <g ref={r.iris}>
            <circle cx={cx} cy={cy} r={R} fill={e.colIrisDark} />
            <path d={e.irisLight} fill={e.colIrisLight} />
            <circle cx={cx} cy={cy} r={R - 0.65} fill="none" stroke={e.colIrisRing} strokeWidth="1.3" />
            <path d={e.catch} fill="#fff" />
          </g>
        </g>
        <path d={e.lowLashes} fill={e.colLiner} />
        <path ref={r.liner} d={init.liner} fill={e.colLiner} />
      </g>
    );
  };

  return (
    <svg viewBox="0 0 527 581" className={className} role="img" aria-label={label}>
      <defs>
        <radialGradient id={id('bg')} gradientUnits="userSpaceOnUse" cx="263" cy="250" r="420">
          <stop offset="0%" stopColor="var(--avatar-bg-1)" />
          <stop offset="100%" stopColor="var(--avatar-bg-2)" />
        </radialGradient>
        <clipPath id={id('hair')}>
          <path d={HAIR_BACK} />
        </clipPath>
        <clipPath id={id('bodyMain')}>
          <path d={S.bodyMain.d} />
        </clipPath>
        <clipPath id={id('face')}>
          <path d={S.face.d} />
        </clipPath>
        <clipPath id={id('mclip')}>
          <path ref={mclip} d={initMouth.inner} />
        </clipPath>
      </defs>

      <rect width="527" height="581" fill={url('bg')} />
      {/* les relevés sont en indices de pixel : centre du pixel = +0,5 */}
      <g transform="translate(0.5 0.5)">

        {/* ---------- cheveux (masse arrière) ---------- */}
        <g ref={headBack}>
          <path d={HAIR_BACK} fill={C.hair} />
          <g clipPath={url('hair')}>
            <path d={HAIR.hairMid.back} fill={HAIR.hairMid.color} />
            <path d={HAIR.hairLight.back} fill={HAIR.hairLight.color} />
            <path d={HAIR.hairShine.back} fill={HAIR.hairShine.color} />
            <path d={HAIR_OUTLINE} stroke={C.hairLine} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
          </g>
          {/* jours entre les mèches (couleur du fond) */}
          <path d={HAIR.gaps} fill={url('bg')} />
        </g>

        {/* ---------- buste (respiration) ---------- */}
        <g ref={body}>
          <path d={UNDER_LOCK} fill={S.bodyMain.fill} />
          <path d={S.bodyMain.d} fill={S.bodyMain.fill} />
          <path d={S.bodyLeft.d} fill={S.bodyLeft.fill} />
          {/* ombre du cou, prolongée sous le menton */}
          <rect x="206" y="325" width="115.5" height="28" fill={S.neckShade.fill} />
          <path d={S.neckShade.d} fill={S.neckShade.fill} clipPath={url('bodyMain')} />
          <path d={NECK_UNDER_LOCK} fill={S.neckShade.fill} />
          <path d={S.strapEdge.d} fill="#f6d6ba" />
          <path d={S.strap.d} fill={S.strap.fill} />
        </g>

        {/* ---------- mèche gauche, devant l'épaule ---------- */}
        <g ref={headLock}>
          <path d={HAIR.lock} fill={C.hair} />
          <g clipPath={url('hair')}>
            <path d={HAIR.hairMid.front} fill={HAIR.hairMid.color} />
            <path d={HAIR.hairLight.front} fill={HAIR.hairLight.color} />
            <path d={HAIR.hairShine.front} fill={HAIR.hairShine.color} />
          </g>
        </g>

        {/* ---------- tête ---------- */}
        <g ref={head}>
          {/* oreilles */}
          {[S.earL, S.earLightL, S.earMidL, S.earDarkL, S.earR, S.earLightR, S.earMidR, S.earDarkR].map((sh) => (
            <path key={sh.d} d={sh.d} fill={sh.fill} />
          ))}

          {/* visage et ombres portées */}
          <path d={S.face.d} fill={S.face.fill} />
          <g clipPath={url('face')}>
            {[S.templeR, S.hairlineL, S.philtrum, S.alaL, S.alaR].map((sh) => (
              <path key={sh.d} d={sh.d} fill={sh.fill} />
            ))}
            <g ref={chinShade}>
              <path d={S.underLip.d} fill={S.underLip.fill} />
            </g>
          </g>
          <path d={HAIR.part.d} fill={HAIR.part.color} />

          {/* nez */}
          {[S.noseHi, S.nostrilL, S.nostrilR].map((sh) => (
            <path key={sh.d} d={sh.d} fill={sh.fill} />
          ))}

          {/* yeux */}
          {renderEye('L', initL)}
          {renderEye('R', initR)}

          {/* sourcils */}
          <g ref={browL}>
            <path d={S.browL.d} fill={S.browL.fill} />
          </g>
          <g ref={browR}>
            <path d={S.browR.d} fill={S.browR.fill} />
          </g>

          {/* bouche */}
          <path ref={lips} d={initMouth.lower} fill={LIPS.colLow} />
          <path ref={upperLip} d={initMouth.upper} fill={LIPS.colUp} />
          <path ref={inner} d={initMouth.inner} fill={C.mouth} opacity="0" />
          <g clipPath={url('mclip')}>
            <ellipse ref={tongue} cx={CX} cy={CY + 6} rx="10" ry="4" fill={C.tongue} />
            <rect ref={teeth} x={CX - 18} y={CY - 6} width="36" height="0" rx="2" fill={C.teeth} />
          </g>
          <path ref={seam} d={LIPS.seamDark} fill={LIPS.colSeam} />
          <path ref={cornerL} d={LIPS.cornerL} fill={LIPS.colCorner} />
          <path ref={cornerR} d={LIPS.cornerR} fill={LIPS.colCorner} />
        </g>
      </g>
    </svg>
  );
}
