/* =========================================================
   Cherry Grove — a voxel world rendered in WebGL.
   No external libraries; all geometry is generated here and
   all art is original (no game assets).
   ========================================================= */

const canvas = document.getElementById('scene');
const gl = canvas.getContext('webgl', { alpha: true, antialias: true });

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let isNight = true;

/* ---------------- palettes ---------------- */
/* Lighting: a single directional light plus a coloured sky ambient.
   sunDir points from the world toward the light. The ground-shadow
   offset below is derived from the same vector so shading and shadows
   agree instead of contradicting each other. */
const SUN_DIR = (function () {
  const v = [-0.42, 0.78, 0.47];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/* Time of day supplies the light and haze; the biome supplies the block
   colours. Keeping them independent means either can change on its own. */
const TIME = {
  day:   { sunColor: [1.02, 0.94, 0.78], ambColor: [0.46, 0.53, 0.64], lampOn: false, amb: 1.0 },
  night: { sunColor: [0.44, 0.50, 0.76], ambColor: [0.26, 0.25, 0.40], lampOn: true,  amb: 1.0 }
};

const glow = (col, stop) =>
  `radial-gradient(circle at 24% 15%, ${col} 0%, rgba(255,255,255,0) ${stop}),`;

const BIOMES = {
  cherry: {
    label: 'Cherry Grove',
    grass: '#63a844', grassAlt: '#5fa340', grassAlt2: '#68ad49', dirt: '#7a5638',
    water: '#4b8fd4', trunk: '#6b4a34',
    leaf: ['#ffb0d0', '#f79bc0', '#ffc8de', '#e98cb2'],
    flower: ['#ffffff', '#ff8fb8', '#ffd35e'],
    petalDay: [1.0, 0.93, 0.96], petalNight: [0.87, 0.56, 0.69],
    skyDay: glow('rgba(255,244,200,0.72)', '38%') + 'linear-gradient(#4fa8e0 0%, #8ccdee 42%, #cbe9f7 72%, #ffd7e6 100%)',
    skyNight: glow('rgba(150,170,235,0.30)', '42%') + 'linear-gradient(#0f0b20 0%, #241640 38%, #4d2a4f 68%, #8a4a68 100%)',
    fogDay: [0.86, 0.88, 0.92], fogNight: [0.42, 0.24, 0.34]
  },
  plains: {
    label: 'Plains',
    grass: '#7cb342', grassAlt: '#74a93c', grassAlt2: '#84bb4b', dirt: '#7a5638',
    water: '#3d7fc4', trunk: '#6b4a34',
    leaf: ['#4a7c2f', '#558b35', '#3f6b28', '#61994a'],
    flower: ['#ffd35e', '#ff8fb8', '#ffffff'],
    petalDay: [1.0, 0.98, 0.86], petalNight: [0.72, 0.74, 0.62],
    skyDay: glow('rgba(255,248,214,0.70)', '38%') + 'linear-gradient(#4a9fd8 0%, #86c6ea 44%, #c3e4f4 74%, #e8f3fb 100%)',
    skyNight: glow('rgba(150,170,235,0.28)', '42%') + 'linear-gradient(#0b1024 0%, #16224a 40%, #2c3c66 72%, #4a5c80 100%)',
    fogDay: [0.84, 0.89, 0.94], fogNight: [0.20, 0.26, 0.40]
  },
  savanna: {
    label: 'Savanna',
    grass: '#b8a04a', grassAlt: '#ad9642', grassAlt2: '#c2aa54', dirt: '#8a6a3a',
    water: '#4a8fb8', trunk: '#7a6a4a',
    leaf: ['#9aa84a', '#8a9840', '#a8b455', '#7d8c39'],
    flower: ['#e8c04a', '#d9a441', '#fff0c0'],
    petalDay: [1.0, 0.94, 0.72], petalNight: [0.72, 0.62, 0.44],
    skyDay: glow('rgba(255,226,160,0.85)', '44%') + 'linear-gradient(#6aa8cc 0%, #a8c8d8 38%, #f0d8a8 74%, #ffc98a 100%)',
    skyNight: glow('rgba(220,190,150,0.26)', '42%') + 'linear-gradient(#140f1a 0%, #2a1d24 40%, #4a3226 74%, #6b4630 100%)',
    fogDay: [0.92, 0.86, 0.72], fogNight: [0.32, 0.24, 0.20]
  },
  storage: {
    label: 'Storage Room',
    interior: true,
    grass: '#6f6f6f', grassAlt: '#7a7a7a', grassAlt2: '#656565', dirt: '#4a3b28',
    water: '#3a2f22', trunk: '#4f3b26',
    leaf: ['#8a6a3c', '#7a5a34', '#946f42', '#6f5330'],
    flower: ['#ffd98a', '#e8c06a', '#fff0c8'],
    petalDay: [0.92, 0.80, 0.55], petalNight: [0.88, 0.74, 0.48],
    // lit by lanterns, not by the sky — override the time-of-day light
    sunColor: [0.26, 0.20, 0.13], ambColor: [0.40, 0.31, 0.21],
    skyDay: 'linear-gradient(#161009 0%, #100c08 100%)',
    skyNight: 'linear-gradient(#120d07 0%, #0b0806 100%)',
    fogDay: [0.10, 0.07, 0.04], fogNight: [0.08, 0.06, 0.04]
  },
  end: {
    label: 'The End',
    grass: '#dcd9a0', grassAlt: '#d4d199', grassAlt2: '#e2dfa8', dirt: '#b8b57e',
    water: '#241634', trunk: '#2a2038',
    leaf: ['#4a3a6b', '#3d2f5a', '#56447a', '#332748'],
    flower: ['#b088d8', '#8a66b8', '#d8c8f0'],
    petalDay: [0.78, 0.62, 0.92], petalNight: [0.68, 0.52, 0.86],
    skyDay: glow('rgba(190,160,235,0.26)', '46%') + 'linear-gradient(#080610 0%, #140d22 40%, #1e1433 72%, #2a1d44 100%)',
    skyNight: glow('rgba(190,160,235,0.22)', '46%') + 'linear-gradient(#050409 0%, #0e0918 40%, #160f26 72%, #201634 100%)',
    fogDay: [0.14, 0.10, 0.22], fogNight: [0.10, 0.07, 0.17]
  },
  beach: {
    label: 'Beach',
    grass: '#e8d9a8', grassAlt: '#e0d09c', grassAlt2: '#efe0b4', dirt: '#c8b888',
    water: '#3aa8d8', trunk: '#7a5a3a',
    leaf: ['#4a9a4a', '#3f8a40', '#55a855', '#368038'],
    flower: ['#ffffff', '#ff9a6a', '#ffd35e'],
    petalDay: [1.0, 0.96, 0.88], petalNight: [0.74, 0.78, 0.82],
    skyDay: glow('rgba(255,242,200,0.78)', '40%') + 'linear-gradient(#3fb0dd 0%, #86d2ee 42%, #cdeaf6 72%, #ffe6c8 100%)',
    skyNight: glow('rgba(160,190,240,0.28)', '44%') + 'linear-gradient(#060f1e 0%, #0e2038 40%, #1b3652 72%, #2f5470 100%)',
    fogDay: [0.84, 0.92, 0.95], fogNight: [0.14, 0.24, 0.36]
  }
};

let biomeId = 'cherry';
let CURRENT_PAL = null;

/* Flattens the current biome + time into the single object the world
   builder reads, so pal() stays a cheap lookup inside the render loop. */
function refreshPalette() {
  const b = BIOMES[biomeId] || BIOMES.cherry;
  const t = isNight ? TIME.night : TIME.day;
  CURRENT_PAL = {
    label: b.label,
    interior: !!b.interior,
    grass: b.grass, grassAlt: b.grassAlt, grassAlt2: b.grassAlt2,
    dirt: b.dirt, water: b.water, trunk: b.trunk,
    leaf: b.leaf, flower: b.flower,
    petal: isNight ? b.petalNight : b.petalDay,
    skyCss: isNight ? b.skyNight : b.skyDay,
    fog: isNight ? b.fogNight : b.fogDay,
    sunColor: b.sunColor || t.sunColor,
    ambColor: b.ambColor || t.ambColor,
    lampOn: b.interior ? true : t.lampOn,
    amb: t.amb
  };
  const el = document.getElementById('biomeName');
  if (el) el.textContent = b.label;
  return CURRENT_PAL;
}

const pal = () => CURRENT_PAL || refreshPalette();

/* ---------------- tiny matrix helpers ---------------- */
function mat4() { return new Float32Array(16); }

function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  out.set([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  return out;
}

function lookAt(out, eye, center, up) {
  let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
  let len = Math.hypot(z0, z1, z2); z0 /= len; z1 /= len; z2 /= len;
  let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2) || 1; x0 /= len; x1 /= len; x2 /= len;
  const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
  out.set([
    x0, y0, z0, 0,
    x1, y1, z1, 0,
    x2, y2, z2, 0,
    -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
    -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
    -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
    1
  ]);
  return out;
}

function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/* ---------------- shaders ---------------- */
const VS = `
attribute vec3 aPos;
attribute vec3 aColor;
attribute vec2 aUV;
uniform mat4 uMVP;
uniform float uPointSize;
varying vec3 vColor;
varying vec2 vUV;
varying float vFog;
void main() {
  vec4 clip = uMVP * vec4(aPos, 1.0);
  gl_Position = clip;
  gl_PointSize = uPointSize;
  vColor = aColor;
  vUV = aUV;
  vFog = clamp((clip.w - 14.0) / 34.0, 0.0, 1.0);
}`;

const FS = `
precision mediump float;
varying vec3 vColor;
varying vec2 vUV;
varying float vFog;
uniform vec3 uFog;
uniform sampler2D uTex;
uniform float uUseTex;
uniform float uAlphaTest;
void main() {
  vec3 c = vColor;
  if (uUseTex > 0.5) {
    vec4 t = texture2D(uTex, vUV);
    // the skin's second layer is mostly transparent; cut it out
    if (uAlphaTest > 0.5 && t.a < 0.5) discard;
    c *= t.rgb;
  }
  gl_FragColor = vec4(mix(c, uFog, vFog * 0.85), 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}

let program, loc;
function initGL() {
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);
  loc = {
    aPos: gl.getAttribLocation(program, 'aPos'),
    aColor: gl.getAttribLocation(program, 'aColor'),
    aUV: gl.getAttribLocation(program, 'aUV'),
    uMVP: gl.getUniformLocation(program, 'uMVP'),
    uFog: gl.getUniformLocation(program, 'uFog'),
    uTex: gl.getUniformLocation(program, 'uTex'),
    uUseTex: gl.getUniformLocation(program, 'uUseTex'),
    uAlphaTest: gl.getUniformLocation(program, 'uAlphaTest'),
    uPointSize: gl.getUniformLocation(program, 'uPointSize')
  };
  gl.enableVertexAttribArray(loc.aPos);
  gl.enableVertexAttribArray(loc.aColor);
  gl.enableVertexAttribArray(loc.aUV);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(loc.uTex, 0);
  atlasTex = uploadTexture(makeAtlas());
  skinTex = uploadTexture(makeSkinTexture());
}

let atlasTex, skinTex;

/* NEAREST filtering throughout — the whole look depends on texels staying
   square rather than being smoothed. */
function uploadTexture(source) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/* ---------------- texture atlas ----------------
   Grayscale patterns multiplied by each block's tint, so one small
   atlas textures grass, wood, stone and leaves alike. */
const TILE = {
  SMOOTH: 0, SPECKLE: 1, STONE: 2, PLANK: 3, LOG: 4, LEAF: 5, WATER: 6, GRASS: 7,
  // full-colour tiles — drawn with a white tint so their own colours show
  CHEST_TOP: 8, CHEST_SIDE: 9, CHEST_FRONT: 10
};
const ATLAS_COLS = 4, ATLAS_ROWS = 3, TILE_PX = 16;

function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = ATLAS_COLS * TILE_PX;
  c.height = ATLAS_ROWS * TILE_PX;
  const g = c.getContext('2d');
  const rng = mulberry32(9182);
  const px = (x, y, v) => { g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1); };
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const at = (i) => [(i % ATLAS_COLS) * TILE_PX, Math.floor(i / ATLAS_COLS) * TILE_PX];

  let [ox, oy] = at(TILE.SMOOTH);
  g.fillStyle = '#fff'; g.fillRect(ox, oy, TILE_PX, TILE_PX);

  [ox, oy] = at(TILE.SPECKLE);
  for (let i = 0; i < TILE_PX; i++) for (let j = 0; j < TILE_PX; j++) px(ox + i, oy + j, 214 + Math.floor(rng() * 42));

  [ox, oy] = at(TILE.STONE);
  for (let i = 0; i < TILE_PX; i++) for (let j = 0; j < TILE_PX; j++) {
    const blot = rng() > 0.86 ? -34 : 0;
    px(ox + i, oy + j, 218 + Math.floor(rng() * 30) + blot);
  }

  [ox, oy] = at(TILE.PLANK);
  for (let j = 0; j < TILE_PX; j++) for (let i = 0; i < TILE_PX; i++) {
    const seam = j % 5 === 0 ? -46 : 0;
    const knot = (i + j * 3) % 13 === 0 ? -16 : 0;
    px(ox + i, oy + j, 226 + Math.floor(rng() * 22) + seam + knot);
  }

  [ox, oy] = at(TILE.LOG);
  for (let i = 0; i < TILE_PX; i++) {
    const streak = i % 4 === 0 ? -40 : i % 3 === 0 ? -18 : 0;
    for (let j = 0; j < TILE_PX; j++) px(ox + i, oy + j, 228 + Math.floor(rng() * 18) + streak);
  }

  [ox, oy] = at(TILE.LEAF);
  for (let i = 0; i < TILE_PX; i++) for (let j = 0; j < TILE_PX; j++) {
    const hole = rng() > 0.80 ? -58 : rng() > 0.6 ? -22 : 0;
    px(ox + i, oy + j, 232 + Math.floor(rng() * 20) + hole);
  }

  [ox, oy] = at(TILE.WATER);
  for (let j = 0; j < TILE_PX; j++) {
    const band = Math.sin(j * 0.9) * 12;
    for (let i = 0; i < TILE_PX; i++) px(ox + i, oy + j, 226 + Math.round(band) + Math.floor(rng() * 14));
  }

  [ox, oy] = at(TILE.GRASS);
  for (let i = 0; i < TILE_PX; i++) for (let j = 0; j < TILE_PX; j++) {
    const blade = rng() > 0.72 ? -30 : rng() > 0.4 ? 10 : 0;
    px(ox + i, oy + j, 220 + Math.floor(rng() * 26) + blade);
  }

  /* ---- chest, painted in full colour ----
     Dark outline on every edge, planked wood, a seam under the lid and a
     metal latch on the front. Drawn with a white tint so these colours
     survive rather than being multiplied by a block colour. */
  const OUTLINE = '#38270f';
  const WOOD = ['#a5782f', '#b78a3f', '#946a28', '#c19a4e'];

  const planks = (px0, py0, w, h) => {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        // brick-laid segments, offset every other row
        const seg = Math.floor((i + (j % 2 ? 3 : 0)) / 4);
        const tone = WOOD[(seg + j) % WOOD.length];
        R(px0 + i, py0 + j, 1, 1, rng() < 0.16 ? WOOD[2] : tone);
      }
    }
  };
  const framed = (i, seam) => {
    const [bx, by] = at(i);
    R(bx, by, TILE_PX, TILE_PX, OUTLINE);
    planks(bx + 1, by + 1, TILE_PX - 2, TILE_PX - 2);
    if (seam) {
      R(bx + 1, by + 5, TILE_PX - 2, 1, OUTLINE);   // lid seam
      R(bx + 1, by + 6, TILE_PX - 2, 1, '#5a4018');
    }
    return [bx, by];
  };

  framed(TILE.CHEST_TOP, false);
  framed(TILE.CHEST_SIDE, true);
  const [fx, fy] = framed(TILE.CHEST_FRONT, true);
  R(fx + 7, fy + 4, 2, 5, '#3a3a3a');              // latch shadow
  R(fx + 7, fy + 4, 2, 4, '#b4b4b4');              // latch body
  R(fx + 7, fy + 5, 1, 2, '#dcdcdc');              // latch highlight

  return c;
}

function tileUV(i) {
  const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
  const e = 0.5 / TILE_PX;   // half-texel inset stops neighbouring tiles bleeding
  return [
    (col + e) / ATLAS_COLS, (row + e) / ATLAS_ROWS,
    (col + 1 - e) / ATLAS_COLS, (row + 1 - e) / ATLAS_ROWS
  ];
}

/* ---------------- mesh building ---------------- */
/* Per-face lighting: ambient sky colour plus N·L from the sun. Computed
   once per world build, so this costs nothing at render time. */
const NORMALS = {
  t: [0, 1, 0], f: [0, 0, 1], b: [0, 0, -1],
  l: [-1, 0, 0], r: [1, 0, 0], s: [0, -1, 0]
};

let LIGHT = null;
const EMISSIVE_LIGHT = [1.35, 1.22, 0.92];   // lit windows ignore the sun
let emissive = false;

function computeLight(p) {
  const out = {};
  for (const k in NORMALS) {
    const n = NORMALS[k];
    const d = Math.max(0, n[0] * SUN_DIR[0] + n[1] * SUN_DIR[1] + n[2] * SUN_DIR[2]);
    // a little extra fill downward so undersides never go pure black
    const fill = k === 's' ? 0.12 : 0;
    out[k] = [
      p.ambColor[0] + p.sunColor[0] * d + fill,
      p.ambColor[1] + p.sunColor[1] * d + fill,
      p.ambColor[2] + p.sunColor[2] * d + fill
    ];
  }
  return out;
}

function hexRGB(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}

let positions = [], colors = [], uvs = [];

/* An optional rotation applied to every vertex as it is emitted, used to
   swing the character's limbs about their joints. Pivots are in world units. */
let xform = null;

/* sin/cos are precomputed here so the per-vertex path does no trigonometry. */
function setXform(px, py, pz, rx, ry, rz) {
  rx = rx || 0; ry = ry || 0; rz = rz || 0;
  xform = {
    px, py, pz, rx, ry, rz,
    sx: Math.sin(rx), cx: Math.cos(rx),
    sy: Math.sin(ry), cy: Math.cos(ry),
    sz: Math.sin(rz), cz: Math.cos(rz)
  };
}
function clearXform() { xform = null; }

/* When set, vertices are written straight into preallocated typed arrays
   instead of growing JS arrays — used for the per-frame character mesh so
   the render loop allocates nothing. */
let sink = null;

/* Writes one vertex. Scalars only — this runs thousands of times per
   frame for the character, so it must not allocate. */
function vertex(x, y, z, r, g, b, u, v) {
  if (xform) {
    let dx = x - xform.px, dy = y - xform.py, dz = z - xform.pz, n;
    if (xform.rz) { n = dx * xform.cz - dy * xform.sz; dy = dx * xform.sz + dy * xform.cz; dx = n; }
    if (xform.rx) { n = dy * xform.cx - dz * xform.sx; dz = dy * xform.sx + dz * xform.cx; dy = n; }
    if (xform.ry) { n = dx * xform.cy + dz * xform.sy; dz = -dx * xform.sy + dz * xform.cy; dx = n; }
    x = dx + xform.px; y = dy + xform.py; z = dz + xform.pz;
  }
  if (sink) {
    const i = sink.n;
    if (i < sink.cap) {                       // bounds-checked; a short write just grows next frame
      const i3 = i * 3, i2 = i * 2;
      sink.pos[i3] = x; sink.pos[i3 + 1] = y; sink.pos[i3 + 2] = z;
      sink.col[i3] = r; sink.col[i3 + 1] = g; sink.col[i3 + 2] = b;
      sink.uv[i2] = u; sink.uv[i2 + 1] = v;
    }
    sink.n = i + 1;
    return;
  }
  positions.push(x, y, z);
  colors.push(r, g, b);
  uvs.push(u, v);
}

/* Tile UV rects, resolved once instead of per quad. */
const TILE_UVS = (function () {
  const out = [], e = 0.5 / TILE_PX;
  for (let i = 0; i < ATLAS_COLS * ATLAS_ROWS; i++) {
    const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
    out.push([
      (col + e) / ATLAS_COLS, (row + e) / ATLAS_ROWS,
      (col + 1 - e) / ATLAS_COLS, (row + 1 - e) / ATLAS_ROWS
    ]);
  }
  return out;
})();

/* Splits a face into roughly block-sized cells so the texture tiles at a
   consistent scale instead of stretching across large walls. */
function face(ox, oy, oz, dux, duy, duz, dvx, dvy, dvz, r, g, b, light, amb, tile, aoLow) {
  const nu = Math.max(1, Math.round(Math.hypot(dux, duy, duz)));
  const nv = Math.max(1, Math.round(Math.hypot(dvx, dvy, dvz)));
  const uv = TILE_UVS[tile] || TILE_UVS[0];
  const u0 = uv[0], v0 = uv[1], u1 = uv[2], v1 = uv[3];
  const cr = r * light[0] * amb, cg = g * light[1] * amb, cb = b * light[2] * amb;

  for (let i = 0; i < nu; i++) {
    const s0 = i / nu, s1 = (i + 1) / nu;
    for (let j = 0; j < nv; j++) {
      const t0 = j / nv, t1 = (j + 1) / nv;
      // darken toward the bottom of vertical faces for a grounded look
      const a0 = aoLow ? 1 - 0.26 * (1 - t0) : 1;
      const a1 = aoLow ? 1 - 0.26 * (1 - t1) : 1;
      const r0 = cr * a0, g0 = cg * a0, b0 = cb * a0;
      const r1 = cr * a1, g1 = cg * a1, b1 = cb * a1;

      const xA = ox + dux * s0 + dvx * t0, yA = oy + duy * s0 + dvy * t0, zA = oz + duz * s0 + dvz * t0;
      const xB = ox + dux * s1 + dvx * t0, yB = oy + duy * s1 + dvy * t0, zB = oz + duz * s1 + dvz * t0;
      const xC = ox + dux * s1 + dvx * t1, yC = oy + duy * s1 + dvy * t1, zC = oz + duz * s1 + dvz * t1;
      const xD = ox + dux * s0 + dvx * t1, yD = oy + duy * s0 + dvy * t1, zD = oz + duz * s0 + dvz * t1;

      vertex(xA, yA, zA, r0, g0, b0, u0, v1);
      vertex(xB, yB, zB, r0, g0, b0, u1, v1);
      vertex(xC, yC, zC, r1, g1, b1, u1, v0);

      vertex(xA, yA, zA, r0, g0, b0, u0, v1);
      vertex(xC, yC, zC, r1, g1, b1, u1, v0);
      vertex(xD, yD, zD, r1, g1, b1, u0, v0);
    }
  }
}

/* Adds an axis-aligned box. `faces` limits which sides are emitted so
   buried geometry (like the underside of the ground) is never built. */
function box(x0, y0, z0, x1, y1, z1, hex, amb, faces, tile, sideTile) {
  const rgb = typeof hex === 'string' ? hexRGB(hex) : hex;
  const r = rgb[0], g = rgb[1], b = rgb[2];
  const f = faces || 'tfbslr';
  const t = tile === undefined ? TILE.SMOOTH : tile;
  const st = sideTile === undefined ? t : sideTile;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;

  const L = emissive ? null : LIGHT;
  const lit = (key) => (emissive ? EMISSIVE_LIGHT : L[key]);

  if (f.includes('t')) face(x0, y1, z1, dx, 0, 0, 0, 0, -dz, r, g, b, lit('t'), amb, t, false);
  if (f.includes('f')) face(x0, y0, z1, dx, 0, 0, 0, dy, 0, r, g, b, lit('f'), amb, st, true);
  if (f.includes('b')) face(x1, y0, z0, -dx, 0, 0, 0, dy, 0, r, g, b, lit('b'), amb, st, true);
  if (f.includes('l')) face(x0, y0, z0, 0, 0, dz, 0, dy, 0, r, g, b, lit('l'), amb, st, true);
  if (f.includes('r')) face(x1, y0, z1, 0, 0, -dz, 0, dy, 0, r, g, b, lit('r'), amb, st, true);
  if (f.includes('s')) face(x0, y0, z0, dx, 0, 0, 0, 0, dz, r, g, b, lit('s'), amb, t, false);
}

/* ---------------- deterministic RNG ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- the character ----------------
   Built the way the game actually builds one: six flat boxes plus a
   slightly larger second layer, with every detail painted into a 64x64
   skin texture rather than modelled as geometry. */

const SKIN_TEX = 64;

const SC = {
  skin: '#f0bf9b', skinSh: '#dca77f', skinDk: '#c48d68',
  hair: '#101010', hairSh: '#050505', hairHi: '#1e1e1e',
  brow: '#080808',
  eyeW: '#f4f4f4', iris: '#4a3a24', pupil: '#140d08',
  mouth: '#c07f68',
  tee: '#f7f7f7', teeSh: '#e6e6e6', teeDk: '#d5d5d5',
  chain: '#b9b9b9', chainHi: '#e0e0e0',
  pants: '#111111', pantsSh: '#080808', pantsHi: '#1c1c1c',
  shoe: '#fafafa', shoeSh: '#d2d2d2', sole: '#9a9a9a'
};

function makeSkinTexture() {
  const c = document.createElement('canvas');
  c.width = SKIN_TEX; c.height = SKIN_TEX;
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const rng = mulberry32(5150);
  // scatters a few darker texels so flat areas aren't dead flat
  const noise = (x, y, w, h, col, chance) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
      if (rng() < chance) R(x + i, y + j, 1, 1, col);
    }
  };

  /* ---- head, base layer (origin 0,0) ---- */
  R(8, 0, 8, 8, SC.hair);                    // top
  R(16, 0, 8, 8, SC.skinDk);                 // bottom (under the chin)
  R(0, 8, 8, 8, SC.skin);                    // right side
  R(16, 8, 8, 8, SC.skin);                   // left side
  R(24, 8, 8, 8, SC.hair);                   // back
  R(8, 8, 8, 8, SC.skin);                    // front

  // sides: hair sweeps down over the temples, jaw shading below
  for (const sx of [0, 16]) {
    R(sx, 8, 8, 3, SC.hair);
    R(sx, 11, 8, 1, SC.hairHi);
    R(sx + (sx === 0 ? 6 : 0), 11, 2, 2, SC.hair);   // sideburn toward the face
    R(sx, 14, 8, 2, SC.skinSh);
  }
  R(24, 8, 8, 2, SC.hairHi);                 // light catching the back of the head
  noise(8, 0, 8, 8, SC.hairSh, 0.28);

  /* face: hair fringe, brows, eyes, nose, mouth */
  R(8, 8, 8, 3, SC.hair);                    // fringe across the brow
  R(8, 11, 1, 1, SC.hair); R(11, 11, 1, 1, SC.hair); R(15, 11, 1, 1, SC.hair);
  R(9, 11, 1, 1, SC.hairHi); R(13, 11, 1, 1, SC.hairHi);
  R(9, 11, 2, 1, SC.brow); R(13, 11, 2, 1, SC.brow);        // eyebrows
  R(9, 12, 1, 1, SC.eyeW); R(10, 12, 1, 1, SC.pupil);       // right eye
  R(13, 12, 1, 1, SC.pupil); R(14, 12, 1, 1, SC.eyeW);      // left eye
  R(11, 13, 2, 1, SC.skinSh);                               // nose
  R(11, 14, 2, 1, SC.mouth);                                // mouth
  R(8, 15, 8, 1, SC.skinSh);                                // chin shadow
  R(8, 12, 1, 3, SC.skinSh); R(15, 12, 1, 3, SC.skinSh);    // cheek planes

  /* ---- head, second layer (origin 32,0): the shaggy hair shell ---- */
  R(40, 0, 8, 8, SC.hair);                   // top
  R(32, 8, 8, 6, SC.hair);                   // right side
  R(48, 8, 8, 6, SC.hair);                   // left side
  R(56, 8, 8, 7, SC.hair);                   // back, longer at the nape
  /* Front fringe stops above the eyes — one row lower and the jagged
     strands sit right on top of them. */
  R(40, 8, 8, 3, SC.hair);
  // jagged lower edge, dipping only as far as the brow row
  R(41, 11, 1, 1, SC.hair); R(44, 11, 1, 1, SC.hair); R(46, 11, 1, 1, SC.hair);
  R(43, 11, 1, 1, SC.hairHi);
  // ragged ends on the sides and back
  R(33, 14, 2, 1, SC.hair); R(37, 14, 2, 1, SC.hair);
  R(49, 14, 2, 1, SC.hair); R(53, 14, 2, 1, SC.hair);
  R(57, 15, 2, 1, SC.hair); R(61, 15, 2, 1, SC.hair);
  noise(40, 0, 8, 8, SC.hairHi, 0.22);
  noise(56, 8, 8, 7, SC.hairHi, 0.16);

  /* ---- body (origin 16,16) ---- */
  R(20, 16, 8, 4, SC.tee);                   // top (shoulders)
  R(28, 16, 8, 4, SC.teeSh);                 // bottom
  R(16, 20, 4, 12, SC.teeSh);                // right side
  R(28, 20, 4, 12, SC.teeSh);                // left side
  R(32, 20, 8, 12, SC.tee);                  // back
  R(20, 20, 8, 12, SC.tee);                  // front

  R(23, 16, 2, 2, SC.skinSh);                // neck hole
  R(23, 20, 2, 2, SC.skin);                  // v-neck opening
  R(22, 20, 1, 1, SC.teeSh); R(25, 20, 1, 1, SC.teeSh);
  R(22, 21, 1, 1, SC.chain); R(25, 21, 1, 1, SC.chain);     // chain shoulders
  R(23, 22, 2, 1, SC.chain);                                // chain across
  R(24, 23, 1, 2, SC.chain);                                // cross, vertical
  R(23, 24, 3, 1, SC.chain);                                // cross, arms
  R(24, 23, 1, 1, SC.chainHi);
  R(20, 30, 8, 2, SC.teeSh); R(32, 30, 8, 2, SC.teeSh);     // hem
  R(20, 29, 8, 1, SC.teeDk); R(32, 29, 8, 1, SC.teeDk);
  noise(20, 20, 8, 12, SC.teeSh, 0.10);
  noise(32, 20, 8, 12, SC.teeSh, 0.10);

  /* ---- arms: white sleeve over bare forearm ---- */
  const arm = (ox, oy) => {
    R(ox + 4, oy, 4, 4, SC.tee);             // top
    R(ox + 8, oy, 4, 4, SC.skinDk);          // bottom (the hand)
    R(ox, oy + 4, 4, 12, SC.teeSh);          // right
    R(ox + 4, oy + 4, 4, 12, SC.tee);        // front
    R(ox + 8, oy + 4, 4, 12, SC.teeSh);      // left
    R(ox + 12, oy + 4, 4, 12, SC.tee);       // back
    // sleeve ends partway down; skin below
    for (const [fx, fw, base, shade] of [
      [ox, 4, SC.skin, SC.skinSh], [ox + 4, 4, SC.skin, SC.skinSh],
      [ox + 8, 4, SC.skin, SC.skinSh], [ox + 12, 4, SC.skin, SC.skinSh]
    ]) {
      R(fx, oy + 9, fw, 7, base);
      R(fx, oy + 9, fw, 1, shade);           // shadow under the cuff
      R(fx, oy + 14, fw, 2, SC.skinSh);      // hand
    }
    R(ox, oy + 8, 16, 1, SC.teeDk);          // sleeve hem stitch
  };
  arm(40, 16);   // right arm
  arm(32, 48);   // left arm

  /* ---- legs: black trousers over white sneakers ---- */
  const leg = (ox, oy) => {
    R(ox + 4, oy, 4, 4, SC.pants);           // top
    R(ox + 8, oy, 4, 4, SC.sole);            // bottom (the sole)
    R(ox, oy + 4, 4, 12, SC.pantsSh);        // right
    R(ox + 4, oy + 4, 4, 12, SC.pants);      // front
    R(ox + 8, oy + 4, 4, 12, SC.pantsSh);    // left
    R(ox + 12, oy + 4, 4, 12, SC.pants);     // back
    for (const fx of [ox, ox + 4, ox + 8, ox + 12]) {
      R(fx, oy + 13, 4, 2, SC.shoe);         // sneaker upper
      R(fx, oy + 15, 4, 1, SC.shoeSh);       // sole edge
      R(fx, oy + 12, 4, 1, SC.pantsHi);      // trouser cuff
    }
    noise(ox + 4, oy + 4, 4, 8, SC.pantsHi, 0.12);
    noise(ox + 12, oy + 4, 4, 8, SC.pantsHi, 0.12);
  };
  leg(0, 16);    // right leg
  leg(16, 48);   // left leg

  return c;
}

/* Maps a rectangle of the skin texture, inset by a hair to stop bleeding. */
function uvRect(ou, ov, uw, uh) {
  const e = 0.02;
  return [
    (ou + e) / SKIN_TEX, (ov + e) / SKIN_TEX,
    (ou + uw - e) / SKIN_TEX, (ov + uh - e) / SKIN_TEX
  ];
}

/* One box of the model, UV-unwrapped the way the game lays a skin out.
   Coordinates are skin pixels; `grow` inflates it for the second layer. */
function skinPart(bx, by, bz, w, h, d, ou, ov, grow) {
  const S = 1 / 16, gr = grow || 0;
  const x0 = (bx - gr) * S, y0 = (by - gr) * S, z0 = (bz - gr) * S;
  const x1 = (bx + w + gr) * S, y1 = (by + h + gr) * S, z1 = (bz + d + gr) * S;

  const uTop = uvRect(ou + d, ov, w, d);
  const uBot = uvRect(ou + d + w, ov, w, d);
  const uRight = uvRect(ou, ov + d, d, h);
  const uFront = uvRect(ou + d, ov + d, w, h);
  const uLeft = uvRect(ou + d + w, ov + d, d, h);
  const uBack = uvRect(ou + d + w + d, ov + d, w, h);

  const q = (ax, ay, az, bx2, by2, bz2, cx, cy, cz, dx2, dy2, dz2, L, uv) => {
    const r = L[0], g2 = L[1], b2 = L[2];
    vertex(ax, ay, az, r, g2, b2, uv[0], uv[3]);
    vertex(bx2, by2, bz2, r, g2, b2, uv[2], uv[3]);
    vertex(cx, cy, cz, r, g2, b2, uv[2], uv[1]);
    vertex(ax, ay, az, r, g2, b2, uv[0], uv[3]);
    vertex(cx, cy, cz, r, g2, b2, uv[2], uv[1]);
    vertex(dx2, dy2, dz2, r, g2, b2, uv[0], uv[1]);
  };

  q(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, LIGHT.t, uTop);
  q(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, LIGHT.f, uFront);
  q(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, LIGHT.b, uBack);
  q(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, LIGHT.l, uRight);
  q(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, LIGHT.r, uLeft);
  q(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, LIGHT.s, uBot);
}

/* ---------------- the character ---------------- */
/* Built from real boxes at Minecraft proportions. Units are skin
   pixels (16 px = 1 block); px() converts to world units.
   Dark skin, black afro, round glasses, white tee with a chain,
   black belt and jeans, white shoes. */


/* Animation state, in skin-pixel space. `t` is milliseconds.
   Mutates one shared object rather than allocating per frame. */
/* armLz / armRz are shoulder roll — positive swings the +x arm outward
   and up, so the -x arm mirrors it with a negative value. */
/* TARGET is what the animation asks for this instant; POSE is what the
   model actually shows, easing toward it. Without that damping, cutting
   one gesture short to start another snapped the arms through ~150° in a
   single frame. */
const TARGET = {
  bob: 0, lean: 0, armL: 0, armR: 0, armLz: 0, armRz: 0,
  legL: 0, legR: 0, headY: 0, headX: 0
};
const POSE = {
  bob: 0, lean: 0, armL: 0, armR: 0, armLz: 0, armRz: 0,
  legL: 0, legR: 0, headY: 0, headX: 0
};

/* One-shot gestures, played when the visitor changes section. Each is a
   target pose; the envelope below eases into it and back out. */
const GESTURES = {
  wave:    { dur: 1700, lrz: 0,     rrz: 2.55, lrx: 0,    rrx: 0,    rock: true },
  cheer:   { dur: 1500, lrz: -2.60, rrz: 2.60, lrx: 0,    rrx: 0,    hop: true },
  present: { dur: 1500, lrz: -1.25, rrz: 1.25, lrx: -0.2, rrx: -0.2 },
  inspect: { dur: 1700, lrz: -0.35, rrz: 0.35, lrx: -1.5, rrx: -1.5, look: true },
  cast:    { dur: 1700, lrz: -1.95, rrz: 1.95, lrx: -0.3, rrx: -0.3 }
};

let gesture = null;

/* Idle personalities. Each section gets its own resting behaviour, and
   because POSE eases toward TARGET the change blends rather than snaps.
   rate scales the breathing/sway speed; armOut holds the arms away from
   the body; headTilt biases the head up or down. */
const IDLES = {
  calm:    { rate: 1.00, bob: 0.40, lean: 0.020, armSwing: 0.11, legSwing: 0.05, headAmp: 0.18, headRate: 1.0, armOut: 0.00, headTilt: 0.00 },
  eager:   { rate: 1.45, bob: 0.62, lean: 0.035, armSwing: 0.21, legSwing: 0.09, headAmp: 0.11, headRate: 1.7, armOut: 0.07, headTilt: -0.04 },
  proud:   { rate: 0.72, bob: 0.34, lean: 0.012, armSwing: 0.05, legSwing: 0.02, headAmp: 0.24, headRate: 0.7, armOut: 0.34, headTilt: -0.10 },
  curious: { rate: 1.10, bob: 0.44, lean: 0.028, armSwing: 0.09, legSwing: 0.04, headAmp: 0.46, headRate: 1.9, armOut: 0.05, headTilt: 0.06 },
  drift:   { rate: 0.52, bob: 0.95, lean: 0.045, armSwing: 0.17, legSwing: 0.03, headAmp: 0.13, headRate: 0.5, armOut: 0.52, headTilt: -0.12 },
  relaxed: { rate: 0.84, bob: 0.56, lean: 0.040, armSwing: 0.16, legSwing: 0.07, headAmp: 0.32, headRate: 0.9, armOut: 0.14, headTilt: 0.02 }
};

let idleStyle = 'calm';
function setIdle(style) { if (IDLES[style]) idleStyle = style; }

function playGesture(kind) {
  if (reduceMotion || !GESTURES[kind]) return;
  gesture = { kind, start: performance.now() };
}

function characterPose(t, dt) {
  if (reduceMotion) return POSE;

  const I = IDLES[idleStyle] || IDLES.calm;
  const breathe = Math.sin((t * I.rate) / 1500);
  const swing = Math.sin((t * I.rate) / 1750);

  // bob upward only, so the feet never sink through the ground
  TARGET.bob = (breathe * 0.5 + 0.5) * I.bob;
  TARGET.lean = Math.sin(t / 2600) * I.lean;
  TARGET.armL = swing * I.armSwing;
  TARGET.armR = swing * -I.armSwing;
  TARGET.armLz = -I.armOut;
  TARGET.armRz = I.armOut;
  TARGET.legL = swing * -I.legSwing;
  TARGET.legR = swing * I.legSwing;
  TARGET.headY = Math.sin((t * I.headRate) / 2900) * I.headAmp;
  TARGET.headX = breathe * 0.05 + I.headTilt;

  // idle wave roughly every 9s, unless a triggered gesture is running
  let e = 0, G = null;
  if (gesture) {
    const u = (t - gesture.start) / GESTURES[gesture.kind].dur;
    if (u >= 1) gesture = null;
    else {
      G = GESTURES[gesture.kind];
      // ease in, hold, ease out
      const raw = u < 0.22 ? u / 0.22 : u < 0.68 ? 1 : 1 - (u - 0.68) / 0.32;
      e = raw * raw * (3 - 2 * raw);
    }
  }
  if (!G) {
    const cycle = (t % 9000) / 9000;
    if (cycle > 0.70 && cycle < 0.93) {
      G = GESTURES.wave;
      e = Math.sin(((cycle - 0.70) / 0.23) * Math.PI);
    }
  }

  if (G) {
    const rest = 1 - e;
    TARGET.armL = G.lrx * e + TARGET.armL * rest;
    TARGET.armR = G.rrx * e + TARGET.armR * rest;
    TARGET.armLz = G.lrz * e;
    TARGET.armRz = G.rrz * e;
    if (G.rock) TARGET.armRz += Math.sin(t / 165) * 0.20 * e;
    if (G.hop) TARGET.bob += e * 1.4;
    if (G.look) TARGET.headX = 0.28 * e + TARGET.headX * rest;
  }

  /* Critically-ish damped follow, frame-rate independent so it eases the
     same at 60Hz and 144Hz. Fast enough that the idle sine is untouched,
     slow enough to round off any abrupt target change. */
  const k = 1 - Math.pow(0.0000012, dt || 1 / 60);
  for (const key in TARGET) POSE[key] += (TARGET[key] - POSE[key]) * k;
  return POSE;
}

function buildCharacter(amb, t, dt) {
  const P = characterPose(t || 0, dt);
  const y = P.bob;

  // legs swing from the hips
  // [x, swing, baseU, baseV, overlayU, overlayV]
  const legs = [
    [-4, P.legL, 0, 16, 0, 32],    // right leg
    [0, P.legR, 16, 48, 0, 48]     // left leg
  ];
  for (const [sx, angle, ou, ov, ou2, ov2] of legs) {
    setXform((sx + 2) / 16, (12 + y) / 16, 0, angle, 0, 0);
    skinPart(sx, 0 + y, -2, 4, 12, 4, ou, ov, 0);
    skinPart(sx, 0 + y, -2, 4, 12, 4, ou2, ov2, 0.28);
    clearXform();
  }

  // torso leans very slightly with the sway
  setXform(0, (12 + y) / 16, 0, 0, 0, P.lean);
  skinPart(-4, 12 + y, -2, 8, 12, 4, 16, 16, 0);
  skinPart(-4, 12 + y, -2, 8, 12, 4, 16, 32, 0.28);
  clearXform();

  /* Arms swing from the shoulder. Pitch and roll both come from the pose,
     so idle sway and triggered gestures drive the same joints.
     [x, pitch, roll, baseU, baseV, overlayU, overlayV] */
  const arms = [
    [-8, P.armL, P.armLz, 40, 16, 40, 32],   // right arm (-x side)
    [4, P.armR, P.armRz, 32, 48, 48, 48]     // left arm  (+x side)
  ];
  for (const [sx, rx, rz, ou, ov, ou2, ov2] of arms) {
    setXform((sx + (sx < 0 ? 4 : 0)) / 16, (24 + y) / 16, 0, rx, 0, rz);
    skinPart(sx, 12 + y, -2, 4, 12, 4, ou, ov, 0);
    skinPart(sx, 12 + y, -2, 4, 12, 4, ou2, ov2, 0.28);
    clearXform();
  }

  // head turns on the neck; the second layer carries the shaggy hair
  setXform(0, (24 + y) / 16, 0, P.headX, P.headY, 0);
  skinPart(-4, 24 + y, -4, 8, 8, 8, 0, 0, 0);
  skinPart(-4, 24 + y, -4, 8, 8, 8, 32, 0, 0.5);
  clearXform();
}

/* ---------------- the world ---------------- */
let indexCount = 0, posBuf, colBuf, uvBuf;
const GROUND = 36;        // half-extent of the ground plane, in blocks
const WATER_X = -8;       // everything west of this is water

/* Occluders that cast a soft baked shadow onto the ground. The offset
   is the light direction, so shadows all fall the same way. */
let shadowCasters = [];
// shadows fall directly away from the sun, at a length set by its elevation
const SHADOW_LEN = 3.4 / SUN_DIR[1];
const LIGHT_DX = -SUN_DIR[0] * SHADOW_LEN;
const LIGHT_DZ = -SUN_DIR[2] * SHADOW_LEN;

function addShadow(x, z, radius, strength) {
  shadowCasters.push({ x: x + LIGHT_DX, z: z + LIGHT_DZ, r: radius, s: strength });
}

function shadowAt(x, z) {
  let dark = 0;
  for (const c of shadowCasters) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d >= c.r) continue;
    const t = 1 - d / c.r;
    dark = Math.max(dark, c.s * t * t * (3 - 2 * t) * 0.5);   // smooth falloff
  }
  return Math.min(dark, 0.62);
}

function darken(hex, factor) {
  const rgb = hexRGB(hex);
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
}

/* Warm pools of lamplight baked into indoor surfaces — the inverse of the
   outdoor shadow pass. */
let lightPools = [];

function addLight(x, z, radius, strength) {
  lightPools.push({ x, z, r: radius, s: strength });
}

function lightAt(x, z) {
  let v = 0;
  for (const l of lightPools) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d >= l.r) continue;
    const t = 1 - d / l.r;
    v = Math.max(v, l.s * t * t * (3 - 2 * t));
  }
  return v;
}

/* Lifts a colour toward warm lamplight without letting it blow out. */
function lamplit(hex, amount) {
  const rgb = hexRGB(hex);
  const k = 1 + amount * 0.85;
  return [
    Math.min(rgb[0] * k + amount * 0.10, 1.25),
    Math.min(rgb[1] * k + amount * 0.07, 1.25),
    Math.min(rgb[2] * k + amount * 0.02, 1.25)
  ];
}

/* ---------------- the storage room ----------------
   An enclosed interior: stone floor, plank walls, rows of chests and
   hanging lanterns that actually light the surfaces beneath them. */
function buildStorageRoom(amb, p, rng) {
  const W = 13;          // half-width / half-depth of the room
  const H = 6;           // ceiling height — low enough that lanterns stay in frame
  const floorA = '#6f6f6f', floorB = '#7a7a7a', floorC = '#656565';
  const wall = '#8a6a42', wallDark = '#6f5334', beam = '#4f3b26';
  const ceil = '#4a3b28';

  // lantern grid — register the lights first so surfaces can sample them
  const lanterns = [];
  for (let lx = -7; lx <= 7; lx += 7) {
    for (let lz = -7; lz <= 7; lz += 7) {
      lanterns.push([lx, lz]);
      addLight(lx + 0.5, lz + 0.5, 5.2, 1.0);
    }
  }

  // floor
  for (let x = -W; x < W; x++) {
    for (let z = -W; z < W; z++) {
      const n = (Math.imul(x * 73856093 ^ z * 19349663, 0x45d9f3b) >>> 28) % 3;
      const base = n === 0 ? floorA : n === 1 ? floorB : floorC;
      box(x, -1, z, x + 1, 0, z + 1, lamplit(base, lightAt(x + 0.5, z + 0.5)), amb, 't', TILE.STONE);
    }
  }

  // ceiling, seen from below
  for (let x = -W; x < W; x++) {
    for (let z = -W; z < W; z++) {
      box(x, H, z, x + 1, H + 1, z + 1, darken(ceil, 0.9), amb, 's', TILE.PLANK);
    }
  }

  // four walls, with a darker wainscot and corner beams
  const wallAt = (x0, z0, x1, z1) => {
    box(x0, 0, z0, x1, H, z1, wall, amb, 'tfbslr', TILE.PLANK);
    box(x0, 0, z0, x1, 2.2, z1, wallDark, amb, 'tfbslr', TILE.PLANK);
  };
  wallAt(-W, -W, W, -W + 0.6);
  wallAt(-W, W - 0.6, W, W);
  wallAt(-W, -W, -W + 0.6, W);
  wallAt(W - 0.6, -W, W, W);
  for (const [cx, cz] of [[-W, -W], [W - 0.8, -W], [-W, W - 0.8], [W - 0.8, W - 0.8]]) {
    box(cx, 0, cz, cx + 0.8, H, cz + 0.8, beam, amb, 'tfbslr', TILE.LOG);
  }

  // chests: rows along three walls, some stacked two high
  const chestRow = (fromX, toX, z, stackChance) => {
    for (let x = fromX; x <= toX; x += 1) {
      buildChest(x, 0, z, amb, rng);
      if (rng() < stackChance) buildChest(x, 1, z, amb, rng);
    }
  };
  chestRow(-W + 2, W - 3, -W + 1, 0.45);
  chestRow(-W + 2, W - 3, W - 2, 0.30);
  for (let z = -W + 3; z <= W - 4; z++) {
    buildChest(-W + 1, 0, z, amb, rng);
    if (rng() < 0.35) buildChest(-W + 1, 1, z, amb, rng);
    buildChest(W - 2, 0, z, amb, rng);
  }
  // a short island of crates behind the character
  for (let x = -3; x <= 2; x++) {
    buildChest(x, 0, -6, amb, rng);
    if (rng() < 0.5) buildChest(x, 1, -6, amb, rng);
  }

  // hanging lanterns
  for (const [lx, lz] of lanterns) {
    box(lx + 0.45, H - 1.8, lz + 0.45, lx + 0.55, H, lz + 0.55, '#3a3a3a', amb, 'tfbslr', TILE.SMOOTH);
    emissive = true;
    box(lx + 0.18, H - 2.5, lz + 0.18, lx + 0.82, H - 1.8, lz + 0.82, '#ffd98a', amb, 'tfbslr', TILE.SMOOTH);
    emissive = false;
    box(lx + 0.1, H - 2.68, lz + 0.1, lx + 0.9, H - 2.45, lz + 0.9, '#6b5a3a', amb, 'tfbslr', TILE.SMOOTH);
    box(lx + 0.1, H - 1.85, lz + 0.1, lx + 0.9, H - 1.62, lz + 0.9, '#6b5a3a', amb, 'tfbslr', TILE.SMOOTH);
  }
}

/* A chest. The texture carries the outline, planks, lid seam and latch,
   so this is one box plus a thin plate for the latched front face.
   Tinted white so the tile's own colours come through unmodified. */
function buildChest(x, level, z, amb, rng) {
  const y = level;
  const lit = lightAt(x + 0.5, z + 0.5);
  const tint = lamplit('#ffffff', lit * 0.55);
  const s = 0.06;                       // chests sit a touch inside their block

  box(x + s, y, z + s, x + 1 - s, y + 0.9, z + 1 - s, tint, amb,
      'tbslr', TILE.CHEST_TOP, TILE.CHEST_SIDE);
  // front face gets the latch
  box(x + s, y, z + 1 - s, x + 1 - s, y + 0.9, z + 1 - s + 0.012, tint, amb,
      'f', TILE.CHEST_FRONT, TILE.CHEST_FRONT);
}

function buildWorld() {
  positions = [];
  colors = [];
  uvs = [];
  shadowCasters = [];
  lightPools = [];
  const p = pal();
  const amb = p.amb;
  LIGHT = computeLight(p);
  const rng = mulberry32(20260825);

  if (p.interior) buildStorageRoom(amb, p, rng);
  else buildOutdoors(amb, p, rng);

  uploadWorld(p);
}

function buildOutdoors(amb, p, rng) {

  const innerTrees = [[-8, -7], [7, -8], [8, 6], [-7, 7]];
  const outerTrees = [
    [-9, -14], [2, -16], [14, -7], [15, 6], [9, 13],
    [-3, 16], [-14, 9], [18, -15], [-16, -5], [-14, 15]
  ];
  const houses = [[-28, -19], [-19, -27], [15, -29]];

  // register shadow casters before the ground is laid down
  for (const [tx, tz] of innerTrees) addShadow(tx + 0.5, tz + 0.5, 6.2, 0.95);
  for (const [tx, tz] of outerTrees) addShadow(tx + 0.5, tz + 0.5, 4.0, 0.9);
  for (const [hx, hz] of houses) addShadow(hx + 3.5, hz + 3, 6.5, 0.9);
  addShadow(0, 0, 1.1, 1.0);   // the character

  // ground: grass to the east, a sunken water basin to the west
  for (let x = -GROUND; x < GROUND; x++) {
    for (let z = -GROUND; z < GROUND; z++) {
      if (x < WATER_X) {
        box(x, -0.35, z, x + 1, -0.2, z + 1, p.water, amb, 't', TILE.WATER);
      } else {
        // hashed variation, not a strict checkerboard, so it reads organic
        const n = (Math.imul(x * 73856093 ^ z * 19349663, 0x45d9f3b) >>> 28) % 3;
        const base = n === 0 ? p.grass : n === 1 ? p.grassAlt : p.grassAlt2;
        const dark = shadowAt(x + 0.5, z + 0.5);
        box(x, -1, z, x + 1, 0, z + 1, darken(base, 1 - dark), amb, 't', TILE.GRASS);
      }
    }
  }
  // the bank where grass meets water
  for (let z = -GROUND; z < GROUND; z++) {
    box(WATER_X, -0.4, z, WATER_X + 0.06, 0, z + 1, p.dirt, amb, 'lr');
  }

  // flowers and tufts scattered on the grass
  for (let i = 0; i < 90; i++) {
    const x = WATER_X + 1 + rng() * (GROUND - WATER_X - 2);
    const z = -GROUND + rng() * (GROUND * 2 - 1);
    if (Math.abs(x) < 1.2 && Math.abs(z) < 1.2) continue;   // keep the clearing tidy
    const c = p.flower[Math.floor(rng() * 3)];
    box(x, 0, z, x + 0.07, 0.22, z + 0.07, '#2f5a2b', amb);           // stem
    box(x - 0.02, 0.22, z - 0.02, x + 0.09, 0.44, z + 0.09, c, amb);  // bloom
  }

  // clouds drifting high above
  for (let i = 0; i < 14; i++) {
    const cx = -30 + rng() * 60, cz = -30 + rng() * 60;
    const cy = 17 + rng() * 5;
    const w = 3 + rng() * 5, d = 3 + rng() * 5;
    box(cx, cy, cz, cx + w, cy + 1, cz + d, isNight ? '#3b2f52' : '#ffffff', amb);
  }

  /* Cherry trees, kept well clear of the clearing so the camera has
     room to orbit without a trunk in its face. */
  for (const [tx, tz] of innerTrees) buildTree(tx, tz, rng, amb, p, true);
  for (const [tx, tz] of outerTrees) buildTree(tx, tz, rng, amb, p, false);
  for (const [hx, hz] of houses) buildHouse(hx, hz, amb, p);
  // the character lives in its own buffer so it can be re-posed per frame

}

function uploadWorld(p) {
  const pos = new Float32Array(positions);
  const col = new Float32Array(colors);
  const uv = new Float32Array(uvs);
  if (!posBuf) { posBuf = gl.createBuffer(); colBuf = gl.createBuffer(); uvBuf = gl.createBuffer(); }
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, col, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  indexCount = pos.length / 3;

  canvas.style.background = p.skyCss;
}

/* A simple village cottage: plank walls on a log frame, glass
   windows, a door, and a stepped gable roof. */
function buildHouse(hx, hz, amb, p) {
  const w = 7, d = 6, wallH = 4;
  const plank = '#a5793f', plankDark = '#8c6432', log = '#5f4224';
  const roof = '#7a3f2a', roofDark = '#5e2f1f';
  const stone = '#8a8a8a', glass = isNight ? '#e8c25a' : '#a8d8ee';

  box(hx - 0.3, -0.1, hz - 0.3, hx + w + 0.3, 0.25, hz + d + 0.3, stone, amb, 'tfbslr', TILE.STONE);
  box(hx, 0.25, hz, hx + w, wallH, hz + 0.35, plank, amb, 'tfbslr', TILE.PLANK);
  box(hx, 0.25, hz + d - 0.35, hx + w, wallH, hz + d, plankDark, amb, 'tfbslr', TILE.PLANK);
  box(hx, 0.25, hz, hx + 0.35, wallH, hz + d, plank, amb, 'tfbslr', TILE.PLANK);
  box(hx + w - 0.35, 0.25, hz, hx + w, wallH, hz + d, plank, amb, 'tfbslr', TILE.PLANK);

  for (const [cx, cz] of [[hx, hz], [hx + w - 0.45, hz], [hx, hz + d - 0.45], [hx + w - 0.45, hz + d - 0.45]]) {
    box(cx, 0.25, cz, cx + 0.45, wallH, cz + 0.45, log, amb, 'tfbslr', TILE.LOG);
  }

  box(hx + w / 2 - 0.7, 0.25, hz + d - 0.4, hx + w / 2 + 0.7, 2.4, hz + d + 0.02, log, amb, 'tfbslr', TILE.LOG);

  // windows glow from the inside after dark
  emissive = p.lampOn;
  box(hx + 1, 1.9, hz + d - 0.4, hx + 2.2, 3.1, hz + d + 0.02, glass, amb, 'tfbslr', TILE.SMOOTH);
  box(hx + w - 2.2, 1.9, hz + d - 0.4, hx + w - 1, 3.1, hz + d + 0.02, glass, amb, 'tfbslr', TILE.SMOOTH);
  emissive = false;

  for (let i = 0; i < 4; i++) {
    box(
      hx - 0.7 + i * 0.75, wallH + i * 0.62, hz - 0.7 + i * 0.75,
      hx + w + 0.7 - i * 0.75, wallH + 0.62 + i * 0.62, hz + d + 0.7 - i * 0.75,
      i % 2 ? roofDark : roof, amb, 'tfbslr', TILE.PLANK
    );
  }
}

/* Shared canopy occupancy grid, stamped per tree so it never needs
   clearing, plus the 64 possible face strings resolved up front so the
   inner loop does no string building. */
const LEAF_GEN = new Uint16Array(1 << 15);
const LEAF_COL = new Uint8Array(1 << 15);
let leafGen = 0;

const FACE_MASKS = (function () {
  const out = [];
  for (let m = 0; m < 64; m++) {
    let s = '';
    if (m & 1) s += 't';
    if (m & 2) s += 's';
    if (m & 4) s += 'f';
    if (m & 8) s += 'b';
    if (m & 16) s += 'l';
    if (m & 32) s += 'r';
    out.push(s);
  }
  return out;
})();

function buildTree(tx, tz, rng, amb, p, big) {
  const h = big ? 9 + Math.floor(rng() * 3) : 5 + Math.floor(rng() * 4);
  for (let y = 0; y < h; y++) {
    box(tx, y, tz, tx + 1, y + 1, tz + 1, y % 2 ? p.trunk : '#3d2a1e', amb, 'tfbslr', TILE.LOG);
  }
  // canopy: an ellipsoid of leaf blocks
  const rx = (big ? 4.6 : 2.5) + rng() * 1.2;
  const ry = (big ? 2.0 : 1.6) + rng() * 0.6;
  const rz = (big ? 4.6 : 2.5) + rng() * 1.2;
  const cy = h + ry - 0.4;
  const reach = big ? 6 : 4;

  /* Two passes. The first records which cells are leaves — it has to be
     stored rather than recomputed, because the ragged edge uses random
     jitter and so isn't a pure function of position. The second emits
     only faces with no leaf behind them: the inside of a canopy is never
     visible, and skipping it removes most of the world's geometry.
     The occupancy grid is a shared typed array stamped with a per-tree
     generation, so no allocation or clearing happens per tree. */
  leafGen++;
  const K = (dx, dy, dz) => ((dx + 8) << 10) | ((dy + 8) << 5) | (dz + 8);

  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dy = -3; dy <= 3; dy++) {
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz);
        if (d > 1 + (rng() - 0.5) * 0.35) continue;
        const k = K(dx, dy, dz);
        LEAF_GEN[k] = leafGen;
        LEAF_COL[k] = Math.floor(rng() * p.leaf.length);
      }
    }
  }

  const solid = (dx, dy, dz) => LEAF_GEN[K(dx, dy, dz)] === leafGen;

  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dy = -3; dy <= 3; dy++) {
        const k = K(dx, dy, dz);
        if (LEAF_GEN[k] !== leafGen) continue;
        let m = 0;
        if (!solid(dx, dy + 1, dz)) m |= 1;
        if (!solid(dx, dy - 1, dz)) m |= 2;
        if (!solid(dx, dy, dz + 1)) m |= 4;
        if (!solid(dx, dy, dz - 1)) m |= 8;
        if (!solid(dx - 1, dy, dz)) m |= 16;
        if (!solid(dx + 1, dy, dz)) m |= 32;
        if (!m) continue;
        box(tx + dx, cy + dy, tz + dz, tx + dx + 1, cy + dy + 1, tz + dz + 1,
            p.leaf[LEAF_COL[k]], amb, FACE_MASKS[m], TILE.LEAF);
      }
    }
  }
}

/* The sun itself is deliberately not modelled: the key light sits over
   the viewer's shoulder so the faces you can see are the lit ones, which
   puts the sun behind the camera. The warm radial in the sky gradient
   carries its direction instead. */

/* ---------------- animated character mesh ----------------
   Rebuilt every frame (only a few hundred quads) so the limbs can be
   posed without a skinning pipeline. */
let charCount = 0, charPosBuf, charColBuf, charUvBuf;
const charSink = { pos: null, col: null, uv: null, n: 0, cap: 0 };

function allocCharacter(cap) {
  charSink.cap = cap;
  charSink.pos = new Float32Array(cap * 3);
  charSink.col = new Float32Array(cap * 3);
  charSink.uv = new Float32Array(cap * 2);
  if (!charPosBuf) {
    charPosBuf = gl.createBuffer();
    charColBuf = gl.createBuffer();
    charUvBuf = gl.createBuffer();
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, charPosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, charSink.pos.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, charColBuf);
  gl.bufferData(gl.ARRAY_BUFFER, charSink.col.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, charUvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, charSink.uv.byteLength, gl.DYNAMIC_DRAW);
}

function updateCharacterMesh(t, amb, dt) {
  if (!charSink.cap) allocCharacter(1024);

  // build straight into the typed arrays; grow and retry if it ever overflows
  for (let attempt = 0; attempt < 2; attempt++) {
    charSink.n = 0;
    sink = charSink;
    buildCharacter(amb, t, dt);
    sink = null;
    if (charSink.n <= charSink.cap) break;
    allocCharacter(charSink.n);
  }
  charCount = Math.min(charSink.n, charSink.cap);

  gl.bindBuffer(gl.ARRAY_BUFFER, charPosBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, charSink.pos);
  gl.bindBuffer(gl.ARRAY_BUFFER, charColBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, charSink.col);
  gl.bindBuffer(gl.ARRAY_BUFFER, charUvBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, charSink.uv);
}

/* ---------------- petals ---------------- */
const PETALS = 140;
let petalPos, petalCol, petalPosBuf, petalColBuf, petals = [];

function buildPetals() {
  const rng = mulberry32(77);
  petals = [];
  for (let i = 0; i < PETALS; i++) {
    petals.push({
      x: -GROUND + rng() * GROUND * 2,
      y: rng() * 14,
      z: -GROUND + rng() * GROUND * 2,
      vy: 0.4 + rng() * 0.9,
      phase: rng() * Math.PI * 2
    });
  }
  petalPos = new Float32Array(PETALS * 3);
  petalCol = new Float32Array(PETALS * 3);
  petalPosBuf = gl.createBuffer();
  petalColBuf = gl.createBuffer();
  // allocate storage once; frames only ever bufferSubData into it
  gl.bindBuffer(gl.ARRAY_BUFFER, petalPosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, petalPos.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, petalColBuf);
  gl.bufferData(gl.ARRAY_BUFFER, petalCol.byteLength, gl.DYNAMIC_DRAW);
}

function updatePetals(dt, p) {
  for (let i = 0; i < PETALS; i++) {
    const pt = petals[i];
    if (!reduceMotion) {
      pt.y -= pt.vy * dt;
      pt.x += Math.sin(pt.phase + pt.y * 0.5) * 0.35 * dt;
      if (pt.y < 0.2) { pt.y = 13 + Math.random() * 3; }
    }
    petalPos[i * 3] = pt.x;
    petalPos[i * 3 + 1] = pt.y;
    petalPos[i * 3 + 2] = pt.z;
    petalCol[i * 3] = p.petal[0];
    petalCol[i * 3 + 1] = p.petal[1];
    petalCol[i * 3 + 2] = p.petal[2];
  }
}

/* ---------------- camera ----------------
   The scene is ambient scenery, not a control surface: it takes no
   input at all. Only the HUD is interactive. */
let yaw = 0.3, pitch = 0.22, targetYaw = 0.3, targetPitch = 0.22;

/* ---------------- render loop ---------------- */
const mvp = mat4(), proj = mat4(), view = mat4();
let last = 0;

function resize() {
  const w = Math.floor(window.innerWidth);
  const h = Math.floor(window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function render(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  const p = pal();

  /* Idle camera sways around the front rather than orbiting fully —
     a full spin leaves visitors staring at the back of his head. */
  if (!reduceMotion) targetYaw = 0.3 + Math.sin(t / 9000) * 0.42;
  // frame-rate independent smoothing: same easing at 60Hz and 144Hz
  const k = 1 - Math.pow(0.0001, dt);
  yaw += (targetYaw - yaw) * k;
  pitch += (targetPitch - pitch) * k;

  const narrow = window.innerWidth < 760;
  const dist = narrow ? 6.5 : 7.2;
  const eye = [
    Math.sin(yaw) * Math.cos(pitch) * dist,
    1.5 + Math.sin(pitch) * dist,
    Math.cos(yaw) * Math.cos(pitch) * dist
  ];
  const target = [0, narrow ? 1.35 : 1.05, 0];

  /* Pan the camera left so the character stands to the right of the
     menu column, the way the reference framing does it. */
  const pan = narrow ? 0 : 2.4;
  if (pan) {
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    eye[0] -= rx * pan; eye[2] -= rz * pan;
    target[0] -= rx * pan; target[2] -= rz * pan;
  }

  perspective(proj, (52 * Math.PI) / 180, canvas.width / canvas.height, 0.1, 120);
  lookAt(view, eye, target, [0, 1, 0]);
  multiply(mvp, proj, view);

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniformMatrix4fv(loc.uMVP, false, mvp);
  gl.uniform3fv(loc.uFog, p.fog);

  // world — block atlas, fully opaque
  gl.uniform1f(loc.uPointSize, 1.0);
  gl.uniform1f(loc.uUseTex, 1.0);
  gl.uniform1f(loc.uAlphaTest, 0.0);
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.enableVertexAttribArray(loc.aUV);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.vertexAttribPointer(loc.aUV, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, indexCount);

  // character — re-posed each frame, skin texture with its cut-out layer
  updateCharacterMesh(t, p.amb, dt);
  gl.bindTexture(gl.TEXTURE_2D, skinTex);
  gl.uniform1f(loc.uAlphaTest, 1.0);
  gl.bindBuffer(gl.ARRAY_BUFFER, charPosBuf);
  gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, charColBuf);
  gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, charUvBuf);
  gl.vertexAttribPointer(loc.aUV, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, charCount);

  // petals — flat colour, no texture lookup
  updatePetals(dt, p);
  gl.uniform1f(loc.uUseTex, 0.0);
  gl.uniform1f(loc.uAlphaTest, 0.0);
  gl.disableVertexAttribArray(loc.aUV);
  gl.vertexAttrib2f(loc.aUV, 0, 0);
  gl.uniform1f(loc.uPointSize, Math.max(2, 4 * (window.devicePixelRatio || 1)));
  gl.bindBuffer(gl.ARRAY_BUFFER, petalPosBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, petalPos);
  gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, petalColBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, petalCol);
  gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.POINTS, 0, PETALS);

  requestAnimationFrame(render);
}

/* ---------------- menu + panels + hotbar ----------------
   The title screen is home; opening a section swaps it for that
   panel, and closing returns to the menu. */
const slots = Array.from(document.querySelectorAll('.slot[data-panel]'));
const panels = Array.from(document.querySelectorAll('.panel'));
const titleScreen = document.getElementById('titleScreen');

/* Each section has its own world. Selecting one travels there. */
const SECTION_BIOME = {
  profile: 'cherry',
  projects: 'plains',
  advancements: 'savanna',
  inventory: 'storage',
  levels: 'end',
  contact: 'beach'
};

function setBiome(id) {
  if (!BIOMES[id] || id === biomeId) return;
  biomeId = id;
  refreshPalette();
  buildWorld();
  showToast('🧭', 'Biome Discovered', BIOMES[id].label);
}

/* A gesture to match each section, played on arrival. */
const SECTION_IDLE = {
  profile: 'calm',
  projects: 'eager',
  advancements: 'proud',
  inventory: 'curious',
  levels: 'drift',
  contact: 'relaxed'
};

const SECTION_GESTURE = {
  profile: 'wave',
  projects: 'present',
  advancements: 'cheer',
  inventory: 'inspect',
  levels: 'cast',
  contact: 'wave'
};

function showPanel(name) {
  panels.forEach((pl) => pl.classList.toggle('is-active', pl.id === `panel-${name}`));
  slots.forEach((s) => s.classList.toggle('is-selected', s.dataset.panel === name));
  titleScreen.classList.add('is-hidden');
  setBiome(SECTION_BIOME[name]);
  setIdle(SECTION_IDLE[name]);
  playGesture(SECTION_GESTURE[name]);
  const open = document.getElementById(`panel-${name}`);
  if (open) open.focus({ preventScroll: true });
}

function closePanel() {
  panels.forEach((pl) => pl.classList.remove('is-active'));
  slots.forEach((s) => s.classList.remove('is-selected'));
  titleScreen.classList.remove('is-hidden');
}

/* A slot selects, it never deselects — one press is always enough.
   Closing is the ✕ or Escape. */
document.querySelectorAll('[data-panel]').forEach((el) => {
  if (el.tagName === 'A') return;                       // external links pass through
  el.addEventListener('click', () => showPanel(el.dataset.panel));
});

document.querySelectorAll('.panel-close').forEach((b) => b.addEventListener('click', closePanel));
document.querySelectorAll('[data-goto]').forEach((b) =>
  b.addEventListener('click', () => showPanel(b.dataset.goto))
);

const hotbarOrder = Array.from(document.querySelectorAll('.hotbar .slot'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closePanel(); return; }
  const n = parseInt(e.key, 10);
  if (!(n >= 1 && n <= 9)) return;
  const el = hotbarOrder[n - 1];
  if (!el) return;
  if (el.dataset.panel) showPanel(el.dataset.panel);
  else el.click();
});

/* ---------------- splash text ---------------- */
const SPLASHES = [
  'Now with 100% more commits!',
  'Open to internships!',
  'Powered by React and Flask!',
  "Dean's Lister x2!",
  'Also try Dishcovery!',
  'No mobs were harmed!',
  'Built from scratch — no engines!',
  'Ships on time!'
];
const splashEl = document.getElementById('splash');
splashEl.textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];

/* ---------------- advancement toast ---------------- */
const toast = document.getElementById('toast');
let toastTimer;
function showToast(icon, kicker, title) {
  document.getElementById('toastIcon').textContent = icon;
  document.getElementById('toastKicker').textContent = kicker;
  document.getElementById('toastTitle').textContent = title;
  toast.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-shown'), 4200);
}

let amuletFound = 0;
document.getElementById('amuletBtn').addEventListener('click', () => {
  amuletFound++;
  if (amuletFound === 1) {
    showToast('💎', 'Goal Reached!', 'You found the Amulet');
  } else if (amuletFound === 2) {
    showToast('⛏️', 'Advancement Made!', 'Keep digging…');
  } else {
    showToast('📮', 'Goal Reached!', 'Fine — just hire him already');
  }
});

/* ---------------- profile avatar ---------------- */
/* A tiny front-on portrait, drawn to match the 3D skin. */
function paintAvatar() {
  const el = document.querySelector('.avatar');
  if (!el) return;
  // crop the head straight out of the skin so portrait and model always match
  const skin = makeSkinTexture();
  const s = 6;
  const off = document.createElement('canvas');
  off.width = 8 * s; off.height = 8 * s;
  const g = off.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(skin, 8, 8, 8, 8, 0, 0, 8 * s, 8 * s);    // face
  g.drawImage(skin, 40, 8, 8, 8, 0, 0, 8 * s, 8 * s);   // hair layer over it
  el.style.backgroundImage = `url(${off.toDataURL()})`;
}

/* ---------------- hearts ---------------- */
const heartsEl = document.getElementById('hearts');
for (let i = 0; i < 10; i++) {
  const h = document.createElement('span');
  h.className = 'heart';
  heartsEl.appendChild(h);
}

/* ---------------- in-world clock ---------------- */
const clockEl = document.getElementById('clock');
let day = 8, minutes = 8 * 60 + 14;

function tickClock() {
  minutes += 1;
  if (minutes >= 24 * 60) { minutes = 0; day += 1; }
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  clockEl.textContent = `Day ${day} — ${hh}:${mm}`;
}
tickClock();
if (!reduceMotion) setInterval(tickClock, 1400);

/* ---------------- day / night ---------------- */
const timeToggle = document.getElementById('timeToggle');
const timeIcon = document.getElementById('timeIcon');

timeToggle.addEventListener('click', () => {
  isNight = !isNight;
  timeIcon.textContent = isNight ? '🌙' : '☀️';
  timeToggle.setAttribute('aria-label', isNight ? 'Switch to day' : 'Switch to night');
  refreshPalette();
  buildWorld();
  timeToggle.blur();   // don't leave it focused, or Space/Enter re-fires it
});

/* ---------------- boot ---------------- */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 120);
});

paintAvatar();
closePanel();   // boot to the title screen

if (!gl) {
  document.querySelector('.world-info').insertAdjacentHTML(
    'beforeend',
    '<p style="color:#f0a0c4">WebGL unavailable — scene disabled.</p>'
  );
} else {
  initGL();
  resize();
  refreshPalette();
  buildWorld();
  buildPetals();
  requestAnimationFrame(render);
}
