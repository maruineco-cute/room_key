import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// Room Key Atelier — all image processing stays in this browser tab.
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const mount = $('#threeMount');
const canvasWrap = $('#canvasWrap');
const hint = $('#hint');

const initialSide = (side) => ({
  image: null,
  // Uploaded art starts centered and covers the whole printable face. The slider can shrink it for logo-style artwork.
  imageScale: 1,
  imageX: 0,
  imageY: 0,
  text: side === 'front' ? 'HOTEL' : 'ROOM 404',
  textVisible: true,
  textColor: '#263344',
  textSize: side === 'front' ? 44 : 42,
  textX: 0,
  textY: side === 'front' ? 0.20 : 0.08,
});

const state = {
  activeSide: 'front',
  shape: 'motel',
  previousShape: 'motel',
  bodyColor: '#f4efe5',
  sides: { front: initialSide('front'), back: initialSide('back') },
};

// --------- Three room-key silhouettes. All use one real, cut-through keyring hole. ---------
const BODY_TOP = 5.12;
const BODY_BOTTOM = -5.18;
const HOLE_Y = 4.12;
const CIRCLE_HOLE_Y = 2.55;
const HOLE_R = 0.355;
const KEY_DEPTH = 0.42;
function holeYFor(shapeName) { return shapeName === 'circle' ? CIRCLE_HOLE_Y : HOLE_Y; }
function ringYFor(shapeName) { return holeYFor(shapeName) + 0.92; }
// ExtrudeGeometry's bevel extends beyond the nominal depth; decals must sit just outside that physical face.
const FACE_Z = KEY_DEPTH / 2 + 0.105;
function faceZFor(shapeName) { return shapeName === 'circle' ? KEY_DEPTH / 2 + 0.012 : FACE_Z; }

function traceMotelOutline(path) {
  // The reference motel key: a vertically stretched diamond/hexagon.
  // Both the top and the bottom have short FLAT edges, with softly beveled corners.
  path.moveTo(-0.66, BODY_TOP);
  path.lineTo(0.66, BODY_TOP);
  path.quadraticCurveTo(0.80, 5.02, 0.89, 4.72);
  path.lineTo(1.93, 0.66);
  path.quadraticCurveTo(2.08, 0.08, 1.96, -0.55);
  path.lineTo(0.89, -4.78);
  path.quadraticCurveTo(0.80, -5.08, 0.66, BODY_BOTTOM);
  path.lineTo(-0.66, BODY_BOTTOM);
  path.quadraticCurveTo(-0.80, -5.08, -0.89, -4.78);
  path.lineTo(-1.96, -0.55);
  path.quadraticCurveTo(-2.08, 0.08, -1.93, 0.66);
  path.lineTo(-0.89, 4.72);
  path.quadraticCurveTo(-0.80, 5.02, -0.66, BODY_TOP);
  path.closePath();
}

function traceRoundOutline(path) {
  // The original rounded room-key silhouette: a narrow neck, broad middle and a full round lower end.
  path.moveTo(-0.79, BODY_TOP);
  path.lineTo(0.79, BODY_TOP);
  path.quadraticCurveTo(0.99, BODY_TOP - 0.03, 1.07, 4.78);
  path.lineTo(1.13, 4.42);
  path.quadraticCurveTo(1.16, 4.14, 1.40, 3.95);
  path.quadraticCurveTo(1.97, 3.53, 2.01, 2.48);
  path.lineTo(2.01, -2.40);
  path.quadraticCurveTo(2.00, -3.84, 1.17, -4.64);
  path.quadraticCurveTo(0.65, BODY_BOTTOM, 0, BODY_BOTTOM);
  path.quadraticCurveTo(-0.65, BODY_BOTTOM, -1.17, -4.64);
  path.quadraticCurveTo(-2.00, -3.84, -2.01, -2.40);
  path.lineTo(-2.01, 2.48);
  path.quadraticCurveTo(-1.97, 3.53, -1.40, 3.95);
  path.quadraticCurveTo(-1.16, 4.14, -1.13, 4.42);
  path.lineTo(-1.07, 4.78);
  path.quadraticCurveTo(-0.99, BODY_TOP - 0.03, -0.79, BODY_TOP);
  path.closePath();
}

function traceCircleOutline(path) {
  // A genuine circular tag. The ring hole sits inside the upper part of the disc, not in an added tab.
  path.absellipse(0, 0, 3.55, 3.55, 0, Math.PI * 2, false, 0);
  path.closePath();
}

function outlineFor(shapeName) {
  if (shapeName === 'circle') return traceCircleOutline;
  if (shapeName === 'round') return traceRoundOutline;
  return traceMotelOutline;
}

function makeKeyShape(shapeName = state.shape) {
  const shape = new THREE.Shape();
  outlineFor(shapeName)(shape);
  const hole = new THREE.Path();
  hole.absellipse(0, holeYFor(shapeName), HOLE_R, HOLE_R, 0, Math.PI * 2, false, 0);
  shape.holes.push(hole);
  return shape;
}

let keyShape = makeKeyShape('motel');

// Texture canvases are transparent. The color of the physical plastic remains visible underneath.
const PRINT_W = 1024;
const PRINT_H = 2600;
const NORMAL_PRINT_X_EXTENT = 2.14;
const NORMAL_PRINT_Y_TOP = 5.30;
const NORMAL_PRINT_Y_BOTTOM = -5.30;
const CIRCLE_PRINT_RADIUS = 3.55;
const CIRCLE_PRINT_X_EXTENT = CIRCLE_PRINT_RADIUS;
const CIRCLE_PRINT_Y_TOP = CIRCLE_PRINT_RADIUS;
const CIRCLE_PRINT_Y_BOTTOM = -CIRCLE_PRINT_RADIUS;

let activePrintXExtent = NORMAL_PRINT_X_EXTENT;
let activePrintYTop = NORMAL_PRINT_Y_TOP;
let activePrintYBottom = NORMAL_PRINT_Y_BOTTOM;
let activePrintWidth = PRINT_W;
let activePrintHeight = PRINT_H;

function printBoundsFor(shapeName) {
  return shapeName === 'circle'
    ? { xExtent: CIRCLE_PRINT_X_EXTENT, yTop: CIRCLE_PRINT_Y_TOP, yBottom: CIRCLE_PRINT_Y_BOTTOM, width: 1800, height: 1800 }
    : { xExtent: NORMAL_PRINT_X_EXTENT, yTop: NORMAL_PRINT_Y_TOP, yBottom: NORMAL_PRINT_Y_BOTTOM, width: PRINT_W, height: PRINT_H };
}
function mapX(x) { return ((x + activePrintXExtent) / (activePrintXExtent * 2)) * activePrintWidth; }
function mapY(y) { return ((activePrintYTop - y) / (activePrintYTop - activePrintYBottom)) * activePrintHeight; }

function addCanvasKeyPath(ctx) {
  ctx.beginPath();
  // Give the shared outline functions a Canvas-compatible coordinate adapter.
  const canvasPath = {
    moveTo: (x, y) => ctx.moveTo(mapX(x), mapY(y)),
    lineTo: (x, y) => ctx.lineTo(mapX(x), mapY(y)),
    quadraticCurveTo: (cpx, cpy, x, y) => ctx.quadraticCurveTo(mapX(cpx), mapY(cpy), mapX(x), mapY(y)),
    absellipse: (x, y, xRadius, yRadius, startAngle, endAngle, clockwise, rotation = 0) => ctx.ellipse(
      mapX(x), mapY(y), Math.abs(mapX(x + xRadius) - mapX(x)), Math.abs(mapY(y + yRadius) - mapY(y)),
      rotation, startAngle, endAngle, clockwise,
    ),
    closePath: () => ctx.closePath(),
  };
  outlineFor(state.shape)(canvasPath);
  const activeHoleY = holeYFor(state.shape);
  ctx.moveTo(mapX(HOLE_R), mapY(activeHoleY));
  ctx.ellipse(
    mapX(0), mapY(activeHoleY),
    Math.abs(mapX(HOLE_R) - mapX(0)), Math.abs(mapY(HOLE_R) - mapY(0)), 
    0, 0, Math.PI * 2, true,
  );
}

function makeCanvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createPrintSurface() {
  const canvas = document.createElement('canvas');
  canvas.width = activePrintWidth;
  canvas.height = activePrintHeight;
  return { canvas, ctx: canvas.getContext('2d'), texture: makeCanvasTexture(canvas) };
}

const printSurface = { front: createPrintSurface(), back: createPrintSurface() };

function drawSurface(sideName) {
  const side = state.sides[sideName];
  const { canvas, ctx, texture } = printSurface[sideName];
  const renderW = canvas.width;
  const renderH = canvas.height;
  ctx.clearRect(0, 0, renderW, renderH);

  // The transparent decal canvas is clipped to the exact current room-key shape before being mapped in 3D.
  ctx.save();
  addCanvasKeyPath(ctx);
  ctx.clip('evenodd');

  if (side.image) {
    // Default to a centered "cover" fit: any uploaded photo fills the complete key face and is
    // naturally clipped at its outline. Reducing the size slider is ideal for transparent logo PNGs.
    const imageW = side.image.naturalWidth || side.image.width || 1;
    const imageH = side.image.naturalHeight || side.image.height || 1;
    const printableW = renderW * 0.96;
    const printableH = renderH * 0.96;
    const cover = Math.max(printableW / imageW, printableH / imageH);
    const drawW = imageW * cover * side.imageScale;
    const drawH = imageH * cover * side.imageScale;
    const cx = renderW / 2 + side.imageX * renderW * 0.57;
    const cy = renderH / 2 - side.imageY * renderH * 0.48;
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(side.image, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  }

  // Text is rendered after the image, making it the topmost printed layer for this side.
  if (side.textVisible && side.text.trim()) {
    const lines = side.text.replace(/\r/g, '').split('\n').slice(0, 6);
    const fontPx = side.textSize * 2.45;
    const lineHeight = fontPx * 1.18;
    const x = renderW / 2 + side.textX * renderW * 0.62;
    const yCenter = renderH / 2 - side.textY * renderH * 0.58;
    const startY = yCenter - ((lines.length - 1) * lineHeight) / 2;
    ctx.fillStyle = side.textColor;
    ctx.globalAlpha = 0.98;
    ctx.font = `700 ${fontPx}px "DM Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, index) => {
      // A gentle stroke keeps fine print readable on all selected plastic colors.
      ctx.fillText(line, x, startY + index * lineHeight, renderW * 0.88);
    });
  }
  ctx.restore();
  texture.needsUpdate = true;
}

// --------- Three.js scene ---------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0.10, 23.2);
camera.lookAt(0, 0.25, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;
mount.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xc8dcff, 0x101927, 2.25));
const keyLight = new THREE.DirectionalLight(0xfff4e1, 3.0);
keyLight.position.set(-5, 8, 8);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x91bced, 2.1);
rimLight.position.set(5, 2, -5);
scene.add(rimLight);
const fillLight = new THREE.PointLight(0xffc4d1, 14, 18, 2);
fillLight.position.set(-4, -2, 6);
scene.add(fillLight);

const turntable = new THREE.Group();
turntable.rotation.set(0.035, -0.18, 0);
scene.add(turntable);

const product = new THREE.Group();
product.position.y = 0.12;
turntable.add(product);

const swingPivot = new THREE.Group();
swingPivot.position.y = HOLE_Y;
product.add(swingPivot);

const assembly = new THREE.Group();
assembly.position.y = -HOLE_Y;
swingPivot.add(assembly);

function createBodyGeometry(shape, shapeName = state.shape) {
  const isCircle = shapeName === 'circle';
  // A disc gets a clean, high-resolution cylindrical edge. Beveling a holed circle produces visible tessellation steps.
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: KEY_DEPTH,
    bevelEnabled: !isCircle,
    bevelSegments: isCircle ? 1 : 4,
    bevelSize: isCircle ? 0 : 0.095,
    bevelThickness: isCircle ? 0 : 0.08,
    curveSegments: isCircle ? 128 : 32,
  });
  geometry.translate(0, 0, -KEY_DEPTH / 2);
  geometry.computeVertexNormals();
  return geometry;
}

let bodyGeometry = createBodyGeometry(keyShape, 'motel');
const plasticMaterial = new THREE.MeshPhysicalMaterial({
  color: state.bodyColor,
  roughness: 0.22,
  metalness: 0.02,
  clearcoat: 0.58,
  clearcoatRoughness: 0.18,
  reflectivity: 0.45,
});
const body = new THREE.Mesh(bodyGeometry, plasticMaterial);
assembly.add(body);

// The two elongated tags use a rectangular transparent decal plane. Circle uses real circle geometry,
// preventing any square-canvas edge or transparent-pixel seam from appearing at the rim.
function createPrintGeometry(shapeName) {
  if (shapeName === 'circle') return new THREE.CircleGeometry(CIRCLE_PRINT_RADIUS, 96);
  return new THREE.PlaneGeometry(activePrintXExtent * 2, activePrintYTop - activePrintYBottom, 1, 1);
}
let printGeometry = createPrintGeometry('motel');
const frontPrintMat = new THREE.MeshBasicMaterial({ map: printSurface.front.texture, transparent: true, depthWrite: false, alphaTest: 0.003, side: THREE.FrontSide, toneMapped: false });
const backPrintMat = new THREE.MeshBasicMaterial({ map: printSurface.back.texture, transparent: true, depthWrite: false, alphaTest: 0.003, side: THREE.FrontSide, toneMapped: false });
const frontPrint = new THREE.Mesh(printGeometry, frontPrintMat);
frontPrint.position.z = FACE_Z;
frontPrint.renderOrder = 2;
assembly.add(frontPrint);
const backPrint = new THREE.Mesh(printGeometry, backPrintMat);
backPrint.position.z = -FACE_Z;
backPrint.rotation.y = Math.PI;
backPrint.renderOrder = 2;
assembly.add(backPrint);

// A slim metal eyelet reinforces the actual open hole instead of faking it with a printed circle.
const eyeletMaterial = new THREE.MeshStandardMaterial({ color: 0xcbd1d7, metalness: 0.88, roughness: 0.22 });
const frontEyelet = new THREE.Mesh(new THREE.TorusGeometry(HOLE_R + 0.025, 0.042, 12, 44), eyeletMaterial);
frontEyelet.position.set(0, HOLE_Y, FACE_Z + 0.018);
assembly.add(frontEyelet);
const backEyelet = frontEyelet.clone();
backEyelet.position.z = -FACE_Z - 0.018;
assembly.add(backEyelet);

// The ring remains at the pivot while the key body swings from the hole like a real key fob.
const ringMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd7dde1, metalness: 0.95, roughness: 0.19, clearcoat: 0.35, clearcoatRoughness: 0.12 });
const keyRing = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.075, 14, 72), ringMaterial);
keyRing.position.set(0, ringYFor('motel'), -0.01);
keyRing.rotation.x = 0.075;
product.add(keyRing);

// Do not fill the hole with a connector mesh: leaving it open makes the metal ring visibly pass through the real cut-out.
const tapTargets = [body, frontPrint, backPrint, frontEyelet, backEyelet, keyRing];

drawSurface('front');
drawSurface('back');

// --------- Controls / local UI state ---------
const refs = {
  activeSideLabel: $('#activeSideLabel'),
  shapeName: $('#shapeName'),
  uploadSideLabel: $('#uploadSideLabel'),
  textSideLabel: $('#textSideLabel'),
  uploadInput: $('#imageUpload'),
  uploadTitle: $('.upload-box strong'),
  removeImage: $('#removeImage'),
  imageScale: $('#imageScale'),
  imageX: $('#imageX'),
  imageY: $('#imageY'),
  imageScaleOutput: $('#imageScaleOutput'),
  imageXOutput: $('#imageXOutput'),
  imageYOutput: $('#imageYOutput'),
  textInput: $('#textInput'),
  textVisibility: $('#textVisibility'),
  textColor: $('#textColor'),
  textSize: $('#textSize'),
  textX: $('#textX'),
  textY: $('#textY'),
  textSizeOutput: $('#textSizeOutput'),
  textXOutput: $('#textXOutput'),
  textYOutput: $('#textYOutput'),
  colorName: $('#colorName'),
  bodyColor: $('#bodyColor'),
};

function formatOffset(value) {
  const n = Math.round(value * 100);
  return `${n > 0 ? '+' : ''}${n}%`;
}
function fillRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const fill = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${Math.min(100, Math.max(0, fill))}%`);
}
function setRange(input, value, output, formatter) {
  input.value = value;
  fillRange(input);
  output.textContent = formatter(value);
}
function currentSide() { return state.sides[state.activeSide]; }

function syncSideUI() {
  const sideName = state.activeSide === 'front' ? '表面' : '裏面';
  const side = currentSide();
  refs.activeSideLabel.textContent = sideName;
  refs.uploadSideLabel.textContent = `${sideName}用`;
  refs.textSideLabel.textContent = `${sideName}用`;
  refs.uploadInput.value = '';
  refs.uploadTitle.textContent = side.image ? '画像を変更' : '画像を選択';
  refs.removeImage.disabled = !side.image;
  refs.removeImage.style.opacity = side.image ? '1' : '.42';
  refs.textInput.value = side.text;
  refs.textColor.value = side.textColor;
  refs.textVisibility.classList.toggle('is-on', side.textVisible);
  refs.textVisibility.setAttribute('aria-checked', String(side.textVisible));
  refs.textVisibility.querySelector('b').textContent = side.textVisible ? 'ON' : 'OFF';
  setRange(refs.imageScale, side.imageScale, refs.imageScaleOutput, (v) => `${Math.round(v * 100)}%`);
  setRange(refs.imageX, side.imageX, refs.imageXOutput, formatOffset);
  setRange(refs.imageY, side.imageY, refs.imageYOutput, formatOffset);
  setRange(refs.textSize, side.textSize, refs.textSizeOutput, (v) => `${v}px`);
  setRange(refs.textX, side.textX, refs.textXOutput, formatOffset);
  setRange(refs.textY, side.textY, refs.textYOutput, formatOffset);
  $$('.side-button').forEach((button) => button.classList.toggle('active', button.dataset.side === state.activeSide));
}

function setBodyColor(color, name = 'カスタム') {
  const isClear = color === 'clear';
  state.bodyColor = color;
  if (isClear) {
    // Clear, lightly blue-tinted acrylic. Printing remains on the outer decal layers and stays readable.
    plasticMaterial.color.set('#e8fbff');
    plasticMaterial.transparent = true;
    // Two plastic faces overlap in an extruded tag, so a low per-face alpha is needed for a genuinely see-through finish.
    plasticMaterial.opacity = 0.035;
    plasticMaterial.transmission = 0;
    plasticMaterial.thickness = 0;
    plasticMaterial.depthWrite = false;
    plasticMaterial.roughness = 0.05;
    plasticMaterial.clearcoat = 0.90;
    plasticMaterial.clearcoatRoughness = 0.06;
  } else {
    plasticMaterial.color.set(color);
    plasticMaterial.transparent = false;
    plasticMaterial.opacity = 1;
    plasticMaterial.transmission = 0;
    plasticMaterial.thickness = 0;
    plasticMaterial.depthWrite = true;
    plasticMaterial.roughness = 0.22;
    plasticMaterial.clearcoat = 0.58;
    plasticMaterial.clearcoatRoughness = 0.18;
    refs.bodyColor.value = color;
  }
  plasticMaterial.needsUpdate = true;
  refs.colorName.textContent = name;
  $$('.swatch').forEach((swatch) => swatch.classList.toggle('active', swatch.dataset.color === color));
}

function syncShapeUI() {
  const label = state.shape === 'motel' ? 'モーテル型' : state.shape === 'round' ? 'ラウンド型' : '丸型';
  refs.shapeName.textContent = label;
  $$('.shape-button').forEach((button) => {
    const selected = button.dataset.shape === state.shape;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function setShape(shapeName) {
  if (!['motel', 'round', 'circle'].includes(shapeName)) return;
  state.shape = shapeName;
  // A slight side angle looks great on elongated tags, but reads as a chipped edge on a perfect disc.
  // Present Circle face-on by default; users can still drag it to inspect the thickness.
  home.x = shapeName === 'circle' ? 0 : 0.035;
  home.y = shapeName === 'circle' ? 0 : -0.18;
  turntable.rotation.set(home.x, home.y, 0);
  homeRotation = false;
  keyShape = makeKeyShape(shapeName);
  const previousGeometry = body.geometry;
  bodyGeometry = createBodyGeometry(keyShape, shapeName);
  body.geometry = bodyGeometry;
  previousGeometry.dispose();

  // The pure circular tag has its ring hole within the disc, so move the real pivot and all metal hardware with it.
  const activeHoleY = holeYFor(shapeName);
  const activeFaceZ = faceZFor(shapeName);
  swingPivot.position.y = activeHoleY;
  assembly.position.y = -activeHoleY;
  frontPrint.position.z = activeFaceZ;
  backPrint.position.z = -activeFaceZ;
  frontEyelet.position.set(0, activeHoleY, activeFaceZ + 0.018);
  backEyelet.position.set(0, activeHoleY, -activeFaceZ - 0.018);
  keyRing.position.y = ringYFor(shapeName);

  // Circle uses a square print canvas and square physical decal. This prevents circular artwork or lettering from stretching.
  const nextPrintBounds = printBoundsFor(shapeName);
  const printSurfaceChanged = nextPrintBounds.xExtent !== activePrintXExtent
    || nextPrintBounds.yTop !== activePrintYTop
    || nextPrintBounds.yBottom !== activePrintYBottom;
  if (printSurfaceChanged) {
    activePrintXExtent = nextPrintBounds.xExtent;
    activePrintYTop = nextPrintBounds.yTop;
    activePrintYBottom = nextPrintBounds.yBottom;
    activePrintWidth = nextPrintBounds.width;
    activePrintHeight = nextPrintBounds.height;
    Object.values(printSurface).forEach((surface) => {
      surface.canvas.width = activePrintWidth;
      surface.canvas.height = activePrintHeight;
      surface.ctx = surface.canvas.getContext('2d');
      surface.texture.dispose();
      surface.texture = makeCanvasTexture(surface.canvas);
    });
    frontPrintMat.map = printSurface.front.texture;
    backPrintMat.map = printSurface.back.texture;
    frontPrintMat.needsUpdate = true;
    backPrintMat.needsUpdate = true;
    const previousPrintGeometry = printGeometry;
    printGeometry = createPrintGeometry(shapeName);
    frontPrint.geometry = printGeometry;
    backPrint.geometry = printGeometry;
    previousPrintGeometry.dispose();
  }

  // Switching between two elongated shapes keeps the canvas size but still needs the correct plane type.
  if (!printSurfaceChanged && shapeName !== state.previousShape) {
    const previousPrintGeometry = printGeometry;
    printGeometry = createPrintGeometry(shapeName);
    frontPrint.geometry = printGeometry;
    backPrint.geometry = printGeometry;
    previousPrintGeometry.dispose();
  }
  state.previousShape = shapeName;

  // Redraw both decal canvases with the new silhouette so no print can spill beyond its new outline.
  drawSurface('front');
  drawSurface('back');
  syncShapeUI();
}

$$('.shape-button').forEach((button) => {
  button.addEventListener('click', () => setShape(button.dataset.shape));
});

$$('.side-button').forEach((button) => {
  button.addEventListener('click', () => {
    state.activeSide = button.dataset.side;
    syncSideUI();
  });
});

$$('.swatch').forEach((swatch) => {
  swatch.addEventListener('click', () => setBodyColor(swatch.dataset.color, swatch.dataset.name));
});
refs.bodyColor.addEventListener('input', (event) => setBodyColor(event.target.value, 'カスタム'));

const sideRangeBindings = [
  [refs.imageScale, 'imageScale', refs.imageScaleOutput, (v) => `${Math.round(v * 100)}%`],
  [refs.imageX, 'imageX', refs.imageXOutput, formatOffset],
  [refs.imageY, 'imageY', refs.imageYOutput, formatOffset],
  [refs.textSize, 'textSize', refs.textSizeOutput, (v) => `${v}px`],
  [refs.textX, 'textX', refs.textXOutput, formatOffset],
  [refs.textY, 'textY', refs.textYOutput, formatOffset],
];
sideRangeBindings.forEach(([input, property, output, formatter]) => {
  input.addEventListener('input', () => {
    currentSide()[property] = Number(input.value);
    fillRange(input);
    output.textContent = formatter(Number(input.value));
    drawSurface(state.activeSide);
  });
});
refs.textInput.addEventListener('input', () => { currentSide().text = refs.textInput.value; drawSurface(state.activeSide); });
refs.textVisibility.addEventListener('click', () => {
  currentSide().textVisible = !currentSide().textVisible;
  drawSurface(state.activeSide);
  syncSideUI();
});
refs.textColor.addEventListener('input', () => { currentSide().textColor = refs.textColor.value; drawSurface(state.activeSide); });

refs.uploadInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (!file) return;
  if (!file.type.startsWith('image/')) return;
  const intendedSide = state.activeSide;
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      state.sides[intendedSide].image = image;
      drawSurface(intendedSide);
      if (state.activeSide === intendedSide) syncSideUI();
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});
refs.removeImage.addEventListener('click', () => {
  currentSide().image = null;
  drawSurface(state.activeSide);
  syncSideUI();
});

function resetDesign() {
  state.activeSide = 'front';
  state.bodyColor = '#f4efe5';
  state.sides.front = initialSide('front');
  state.sides.back = initialSide('back');
  setBodyColor(state.bodyColor, 'アイボリー');
  setShape('motel');
  syncSideUI();
  homeRotation = true;
  triggerSwing(0.66);
}
$('#resetButton').addEventListener('click', resetDesign);
$('#recenterButton').addEventListener('click', () => { homeRotation = true; });

// Export a clean production-style asset: the key silhouette is retained, while everything outside it is truly transparent.
function buildTransparentExport(sideName) {
  const source = printSurface[sideName].canvas;
  const scale = 2;
  const output = document.createElement('canvas');
  output.width = source.width * scale;
  output.height = source.height * scale;
  const ctx = output.getContext('2d');
  ctx.scale(scale, scale);

  ctx.save();
  addCanvasKeyPath(ctx);
  ctx.fillStyle = state.bodyColor === 'clear' ? 'rgba(232, 251, 255, 0.08)' : state.bodyColor;
  ctx.fill('evenodd');
  ctx.restore();
  // The existing surface canvas already contains the image first and text as the topmost layer.
  ctx.drawImage(source, 0, 0);
  return output;
}

function downloadTransparentPNG(sideName, button) {
  const canvas = buildTransparentExport(sideName);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `room-key-${sideName === 'front' ? 'front' : 'back'}-transparent.png`;
    link.click();
    URL.revokeObjectURL(url);
    const original = button.textContent;
    button.textContent = '保存しました';
    window.setTimeout(() => { button.textContent = original; }, 1500);
  }, 'image/png');
}
$$('[data-export]').forEach((button) => {
  button.addEventListener('click', () => downloadTransparentPNG(button.dataset.export, button));
});

syncSideUI();
syncShapeUI();

// Compact tabbed editor: only the controls needed for the current task stay open, especially useful beside the live preview on phones.
let activeEditorTab = 'basic';
function switchEditorTab(tabName) {
  if (!['basic', 'image', 'text', 'save'].includes(tabName)) return;
  activeEditorTab = tabName;
  $$('.editor-tab').forEach((button) => {
    const active = button.dataset.editorTab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.editor-panel').forEach((panel) => {
    panel.hidden = panel.dataset.editorPanel !== tabName;
  });
}
$$('.editor-tab').forEach((button) => {
  button.addEventListener('click', () => switchEditorTab(button.dataset.editorTab));
});
switchEditorTab(activeEditorTab);

// --------- Direct drag-to-rotate + tap-to-swing handling ---------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerState = null;
let homeRotation = false;
const home = { x: 0.035, y: -0.18 };
let swingStart = -99;
let swingAmplitude = 0.58;

function triggerSwing(amplitude = 0.58) {
  swingStart = performance.now() / 1000;
  swingAmplitude = amplitude;
  hint.style.opacity = '0';
}

function tapHitsKey(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(tapTargets, false).length > 0;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  renderer.domElement.setPointerCapture?.(event.pointerId);
  pointerState = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, dragged: false };
  homeRotation = false;
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!pointerState || pointerState.id !== event.pointerId) return;
  const dxFromStart = event.clientX - pointerState.startX;
  const dyFromStart = event.clientY - pointerState.startY;
  if (Math.hypot(dxFromStart, dyFromStart) > 7) pointerState.dragged = true;
  if (pointerState.dragged) {
    turntable.rotation.y += (event.clientX - pointerState.lastX) * 0.010;
    turntable.rotation.x = THREE.MathUtils.clamp(turntable.rotation.x + (event.clientY - pointerState.lastY) * 0.008, -0.82, 0.82);
    hint.style.opacity = '0';
  }
  pointerState.lastX = event.clientX;
  pointerState.lastY = event.clientY;
});
function endPointer(event) {
  if (!pointerState || pointerState.id !== event.pointerId) return;
  const wasTap = !pointerState.dragged && Math.hypot(event.clientX - pointerState.startX, event.clientY - pointerState.startY) < 8;
  if (wasTap && tapHitsKey(event)) triggerSwing();
  try { renderer.domElement.releasePointerCapture?.(event.pointerId); } catch (_) { /* already released */ }
  pointerState = null;
}
renderer.domElement.addEventListener('pointerup', endPointer);
renderer.domElement.addEventListener('pointercancel', () => { pointerState = null; });
renderer.domElement.addEventListener('wheel', (event) => {
  event.preventDefault();
  camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.012, 16.5, 30);
}, { passive: false });

// --------- Rendering / resizing ---------
function resizeRenderer() {
  const width = Math.max(1, mount.clientWidth);
  const height = Math.max(1, mount.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resizeRenderer).observe(mount);
resizeRenderer();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() / 1000;
  const elapsed = now - swingStart;
  if (elapsed >= 0 && elapsed < 3.55) {
    // A decaying physical pendulum: large first arc, then finer swings back to the rest position.
    const envelope = Math.exp(-elapsed * 1.30);
    swingPivot.rotation.z = Math.sin(elapsed * 10.2) * swingAmplitude * envelope;
    swingPivot.rotation.x = Math.sin(elapsed * 10.2 + 0.4) * 0.035 * envelope;
  } else {
    swingPivot.rotation.z = THREE.MathUtils.damp(swingPivot.rotation.z, 0, 12, 1 / 60);
    swingPivot.rotation.x = THREE.MathUtils.damp(swingPivot.rotation.x, 0, 12, 1 / 60);
  }
  if (homeRotation) {
    turntable.rotation.x = THREE.MathUtils.damp(turntable.rotation.x, home.x, 7, 1 / 60);
    turntable.rotation.y = THREE.MathUtils.damp(turntable.rotation.y, home.y, 7, 1 / 60);
    if (Math.abs(turntable.rotation.x - home.x) + Math.abs(turntable.rotation.y - home.y) < 0.002) homeRotation = false;
  }
  renderer.render(scene, camera);
}
animate();
