import { useEffect, useRef, useState } from 'react';
import { webFontsReady } from '../lib/fonts.js';
import { buildIPhone } from '../lib/iphone.js';
import { paintCallScreen } from '../lib/callScreen.js';

const TEX_SCALE = 2; // canvases are drawn at 2x for sharp text
const SCREEN_W = 512;
const SCREEN_H = Math.round(512 * (3.4 * 0.955) / (1.7 * 0.92));

// Channel shades for the Calls / Forms / Chats cards below the scene.
export const CHANNEL_COLORS = ['#d6a3ff', '#e8c9ff', '#ffffff'];

const STEPS = ['A Click from a Campaign', 'The Conversation That Closes', 'Revenue Back to the Campaign'];

// Seconds within one loop.
const LOOP = 11;
const CLICK = 0.9;
const CONNECT = 2.4;
const RETURN_START = 4.2;
const RETURN_END = 6.4;
const FILL_END = 7.6;
const FADE_OUT = 10.2;

const STRANDS = 34;
const SEGMENTS = 260;

function phaseAt(t) {
  if (t < CONNECT) return 'ring';
  if (t < RETURN_END) return 'live';
  return 'done';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMark(ctx, x, y, s) {
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, '#d6a3ff');
  g.addColorStop(1, '#7f4bd0');
  ctx.fillStyle = g;
  roundRect(ctx, x, y + s * 0.09, s * 0.875, s * 0.69, s * 0.22);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y + s * 0.72);
  ctx.lineTo(x + s * 0.39, y + s * 0.78);
  ctx.lineTo(x + s * 0.16, y + s * 0.92);
  ctx.fill();
  ctx.fillStyle = '#fff';
  [[0.28, 0.44, 0.19], [0.44, 0.34, 0.28], [0.6, 0.25, 0.37]].forEach(([bx, by, bh]) => {
    roundRect(ctx, x + s * bx, y + s * by, s * 0.11, s * bh, s * 0.055);
    ctx.fill();
  });
}

// The phone screen: the same call screen as the hero, drawn at this canvas's size.
function paintScreen(ctx, phase, secs) {
  const k = SCREEN_W / 400;
  ctx.setTransform(TEX_SCALE * k, 0, 0, TEX_SCALE * k, 0, 0);
  ctx.save();
  paintCallScreen(ctx, 400, SCREEN_H / k, phase, secs, 'Revenue credited to the ad');
  ctx.restore();
}

// The campaign ad the click came from; credited once the conversation is traced back.
function paintAd(ctx, credited) {
  const W = 640;
  const H = 400;
  ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  roundRect(ctx, 6, 6, W - 12, H - 12, 34);
  ctx.fillStyle = '#1c1820';
  ctx.fill();
  ctx.lineWidth = credited ? 5 : 2;
  ctx.strokeStyle = credited ? '#d6a3ff' : '#2a2430';
  ctx.stroke();

  ['#2a2430', '#2a2430', '#2a2430'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(46 + i * 26, 44, 8, 0, Math.PI * 2);
    ctx.fill();
  });
  roundRect(ctx, 130, 30, W - 170, 28, 14);
  ctx.fillStyle = '#000000';
  ctx.fill();

  ctx.fillStyle = '#d4d4d4';
  ctx.font = '500 24px Geist, sans-serif';
  ctx.fillText('Ad · Paid search', 40, 118);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 38px Poppins, sans-serif';
  ctx.fillText('Same-day plumbing', 40, 170);
  ctx.fillStyle = '#b3abbd';
  ctx.font = '400 24px Geist, sans-serif';
  ctx.fillText('Licensed plumbers, on site in 60 minutes.', 40, 212);

  roundRect(ctx, 40, 250, 200, 64, 32);
  ctx.fillStyle = '#d6a3ff';
  ctx.fill();
  ctx.fillStyle = '#160f1f';
  ctx.font = '600 26px Poppins, sans-serif';
  ctx.fillText('Call now', 82, 292);

  if (credited) {
    roundRect(ctx, 300, 250, 300, 64, 32);
    ctx.fillStyle = 'rgba(214,163,255,.2)';
    ctx.fill();
    ctx.strokeStyle = '#e8c9ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 26px Poppins, sans-serif';
    ctx.fillText('+$420 attributed', 326, 292);
  } else {
    // Cursor clicking the call button.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(214, 286);
    ctx.lineTo(214, 330);
    ctx.lineTo(225, 320);
    ctx.lineTo(234, 340);
    ctx.lineTo(242, 336);
    ctx.lineTo(233, 316);
    ctx.lineTo(248, 315);
    ctx.closePath();
    ctx.fill();
  }
}

const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

// The campaign report: stops at the click until CallsTalk fills in the calls and revenue.
function paintReport(ctx, fill) {
  const W = 560;
  const H = 420;
  ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const done = fill >= 1;
  roundRect(ctx, 6, 6, W - 12, H - 12, 30);
  ctx.fillStyle = '#17141b';
  ctx.fill();
  ctx.lineWidth = done ? 4 : 2;
  ctx.strokeStyle = done ? '#d6a3ff' : '#302a36';
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 32px Poppins, sans-serif';
  ctx.fillText('Campaign report', 36, 64);
  ctx.fillStyle = '#c9c1d3';
  ctx.font = '500 22px Geist, sans-serif';
  ctx.fillText('Same-day plumbing · Paid search', 36, 98);
  const rows = [
    ['Clicks', '1,240', true],
    ['Calls', fill > 0 ? String(Math.round(86 * fill)) : '?', fill > 0],
    ['Revenue', fill > 0 ? money(420 * fill) : '?', fill > 0],
  ];
  rows.forEach(([label, value, known], i) => {
    const y = 156 + i * 62;
    ctx.strokeStyle = '#2a2430';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(36, y - 34);
    ctx.lineTo(W - 36, y - 34);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c9c1d3';
    ctx.font = '500 26px Geist, sans-serif';
    ctx.fillText(label, 36, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = known ? (i ? '#d6a3ff' : '#ffffff') : '#8a8294';
    ctx.font = '600 32px Poppins, sans-serif';
    ctx.fillText(value, W - 36, y);
  });
  // Status chip.
  const y = 340;
  roundRect(ctx, 36, y, W - 72, 52, 26);
  ctx.fillStyle = done ? 'rgba(214,163,255,.2)' : 'rgba(255,255,255,.05)';
  ctx.fill();
  ctx.strokeStyle = done ? '#d6a3ff' : '#4d4555';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = done ? '#d6a3ff' : '#8a8294';
  ctx.beginPath();
  ctx.arc(64, y + 26, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '500 23px Geist, sans-serif';
  ctx.fillText(done ? 'Complete with CallsTalk' : fill > 0 ? 'Tracing the conversation...' : 'Report stops at the click', 84, y + 34);
}

// The break in the return path: a question mark until CallsTalk bridges it.
function paintGap(ctx, bridged) {
  const S = 256;
  ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
  ctx.clearRect(0, 0, S, S);
  if (bridged) {
    const glow = ctx.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S / 2);
    glow.addColorStop(0, 'rgba(214,163,255,.55)');
    glow.addColorStop(1, 'rgba(214,163,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#17141b';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#d6a3ff';
    ctx.stroke();
    drawMark(ctx, S / 2 - 38, S / 2 - 40, 78);
  } else {
    ctx.fillStyle = 'rgba(11,9,13,.9)';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([12, 10]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#8a8294';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#c9c1d3';
    ctx.font = '600 64px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', S / 2, S / 2 + 23);
  }
}

const sparkShader = {
  vertexShader: /* glsl */ `
    attribute float aAlpha;
    varying float vAlpha;
    void main() {
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 34.0 / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float core = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(mix(vec3(0.84, 0.64, 1.0), vec3(1.0), core * core), core * vAlpha);
    }`,
};

const strandShader = {
  vertexShader: /* glsl */ `
    attribute float aU;
    varying float vU;
    void main() {
      vU = aU;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime, uSplit, uReturn, uFade, uGain;
    uniform vec3 uColorA, uColorB;
    varying float vU;
    void main() {
      float shimmer = 0.35 + 0.65 * smoothstep(0.82, 1.0, fract(vU * 5.0 - uTime * 0.45));
      float alpha;
      if (vU < uSplit) {
        alpha = shimmer;
      } else {
        float r = (vU - uSplit) / (1.0 - uSplit);
        float broken = 0.1 * step(0.6, fract(vU * 70.0)) * step(0.5, fract(vU * 9.0 + 0.2));
        float lit = step(r, uReturn);
        float head = exp(-pow((r - uReturn) * 30.0, 2.0)) * step(0.001, uReturn) * step(uReturn, 0.999);
        alpha = mix(broken, shimmer, lit) + head * 1.6;
      }
      vec3 color = mix(uColorA, uColorB, smoothstep(0.0, 1.0, vU));
      if (vU >= uSplit) color = mix(color, vec3(1.0, 0.93, 0.86), clamp(exp(-pow(((vU - uSplit) / (1.0 - uSplit) - uReturn) * 30.0, 2.0)), 0.0, 1.0));
      gl_FragColor = vec4(color, alpha * uGain * uFade);
    }`,
};

async function mount(el, onStep, reducedMotion) {
  const THREE = await import('../lib/three.js');
  const { RoundedBoxGeometry } = THREE;
  await webFontsReady();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  // Phones get a lighter render: their screens are dense and their GPUs are slower.
  const small = window.innerWidth < 700;
  renderer.setPixelRatio(small ? Math.min(window.devicePixelRatio, 1.5) : Math.min(Math.max(window.devicePixelRatio, 1.5), 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.1, 10.5);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-4, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc792f7, 1.6);
  rim.position.set(5, -2, -4);
  scene.add(rim);

  const world = new THREE.Group();
  scene.add(world);

  // Starfield in a soft disc, dimming toward its edge so the scene has no hard border.
  const starGeo = new THREE.BufferGeometry();
  const count = 900;
  const stars = new Float32Array(count * 3);
  const shades = new Float32Array(count * 3);
  const tint = new THREE.Color(0xd4d4d4);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    stars.set([Math.cos(a) * r * 9, Math.sin(a) * r * 9, -4 - Math.random() * 8], i * 3);
    const fade = 0.7 * (1 - r ** 3);
    shades.set([tint.r * fade, tint.g * fade, tint.b * fade], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(shades, 3));
  const starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(starField);

  // Phone: dark metal body, glowing screen, stacked outlines behind it.
  const phone = new THREE.Group();
  phone.position.set(1.15, -0.15, 0.4);
  phone.rotation.set(0.1, -0.3, 0.04);
  world.add(phone);
  // The same lilac light the hero phone sits under, so both handsets match.
  const glow = new THREE.PointLight(0xd6a3ff, 16, 10, 2);
  glow.position.set(1.9, 2.4, 3);
  world.add(glow);
  const device = buildIPhone(THREE, RoundedBoxGeometry, 1.7, 3.4);
  phone.add(device.group);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = SCREEN_W * TEX_SCALE;
  screenCanvas.height = SCREEN_H * TEX_SCALE;
  const screenCtx = screenCanvas.getContext('2d');
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = maxAniso;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(device.screenW, device.screenH), new THREE.MeshBasicMaterial({ map: screenTex, transparent: true }));
  screen.position.z = device.frontZ;
  phone.add(screen);

  const outlineShape = new THREE.Shape();
  const ow = 0.85;
  const oh = 1.7;
  const orad = 0.24;
  outlineShape.moveTo(-ow + orad, -oh);
  outlineShape.lineTo(ow - orad, -oh);
  outlineShape.quadraticCurveTo(ow, -oh, ow, -oh + orad);
  outlineShape.lineTo(ow, oh - orad);
  outlineShape.quadraticCurveTo(ow, oh, ow - orad, oh);
  outlineShape.lineTo(-ow + orad, oh);
  outlineShape.quadraticCurveTo(-ow, oh, -ow, oh - orad);
  outlineShape.lineTo(-ow, -oh + orad);
  outlineShape.quadraticCurveTo(-ow, -oh, -ow + orad, -oh);
  const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlineShape.getPoints(24));
  [0.42, 0.26, 0.14].forEach((opacity, i) => {
    const line = new THREE.LineLoop(outlineGeo, new THREE.LineBasicMaterial({ color: 0xd6a3ff, transparent: true, opacity }));
    line.position.set(0.16 * (i + 1), -0.12 * (i + 1), -0.28 * (i + 1));
    phone.add(line);
  });

  const texPlane = (w, h, cw, ch) => {
    const c = document.createElement('canvas');
    c.width = cw * TEX_SCALE;
    c.height = ch * TEX_SCALE;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    return { mesh, ctx: c.getContext('2d'), tex };
  };

  // The campaign ad.
  const adCanvas = document.createElement('canvas');
  adCanvas.width = 640 * TEX_SCALE;
  adCanvas.height = 400 * TEX_SCALE;
  const adCtx = adCanvas.getContext('2d');
  const adTex = new THREE.CanvasTexture(adCanvas);
  adTex.colorSpace = THREE.SRGBColorSpace;
  adTex.anisotropy = maxAniso;
  const ad = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.625), new THREE.MeshBasicMaterial({ map: adTex, transparent: true }));
  ad.position.set(-1.75, 1.05, -0.6);
  ad.rotation.set(0.05, 0.38, -0.03);
  world.add(ad);

  // Click ripple on the ad's call button.
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xe8c9ff, transparent: true, depthWrite: false }));
  ripple.position.set(-0.73, -0.33, 0.01);
  ad.add(ripple);

  // The campaign report, bottom left, in front of the loop.
  const report = texPlane(2.05, 1.54, 560, 420);
  report.mesh.position.set(-1.45, -1.3, 1.1);
  report.mesh.rotation.set(-0.04, 0.32, 0.02);
  world.add(report.mesh);

  // The loop: ad -> phone over the top (the click), phone -> ad underneath (the way back).
  const loop = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.5, 1.2, -0.5),
    new THREE.Vector3(0.4, 2.05, 0.2),
    new THREE.Vector3(1.4, 1.65, 0.9),
    new THREE.Vector3(2.35, 0.3, 0.6),
    new THREE.Vector3(1.9, -1.55, 0.7),
    new THREE.Vector3(0.6, -2.05, 0.6),
    new THREE.Vector3(-1.3, -1.45, 0.1),
    new THREE.Vector3(-2.9, -0.2, -0.4),
    new THREE.Vector3(-3.15, 1.1, -0.8),
    new THREE.Vector3(-2.2, 1.95, -0.9),
  ], true, 'catmullrom', 0.5);
  const base = loop.getSpacedPoints(SEGMENTS);
  // The click reaches the phone where the loop passes closest to it.
  let split = 0;
  let best = Infinity;
  base.forEach((p, i) => {
    const d = p.distanceTo(new THREE.Vector3(2.2, 0.2, 0.6));
    if (d < best) {
      best = d;
      split = i / SEGMENTS;
    }
  });

  const uniforms = {
    uTime: { value: 0 },
    uSplit: { value: split },
    uReturn: { value: 0 },
    uFade: { value: 1 },
    uGain: { value: 0.42 },
    uColorA: { value: new THREE.Color('#f3e6ff') },
    uColorB: { value: new THREE.Color('#e2bcff') },
  };
  const strandMat = new THREE.ShaderMaterial({
    ...strandShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const us = new Float32Array(SEGMENTS + 1).map((_, i) => i / SEGMENTS);
  for (let s = 0; s < STRANDS; s++) {
    const a = Math.random() * Math.PI * 2;
    const amp = 0.06 + Math.random() * 0.2;
    const k = 1 + Math.floor(Math.random() * 3);
    const pts = base.map((p, i) => {
      const u = i / SEGMENTS;
      const w = Math.sin(u * Math.PI * 2 * k + a);
      return new THREE.Vector3(p.x + w * amp * 0.6, p.y + Math.cos(u * Math.PI * 2 * k + a * 1.3) * amp, p.z + w * amp);
    });
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('aU', new THREE.BufferAttribute(us, 1));
    world.add(new THREE.Line(geo, strandMat));
  }

  // The gap on the way back, where most reports lose the conversation.
  // Placed where the return path crosses the open space below the phone.
  let gapIndex = Math.round(split * SEGMENTS);
  let gapBest = Infinity;
  for (let i = gapIndex; i <= SEGMENTS; i++) {
    const d = base[i].distanceTo(new THREE.Vector3(0.35, -2.0, 0.6));
    if (d < gapBest) {
      gapBest = d;
      gapIndex = i;
    }
  }
  const gapAt = (gapIndex / SEGMENTS - split) / (1 - split); // share of the return path before the gap
  const gap = texPlane(0.95, 0.95, 256, 256);
  gap.mesh.renderOrder = 5;
  gap.mesh.position.copy(base[gapIndex]);
  gap.mesh.position.z += 0.3;
  world.add(gap.mesh);

  // Sparks racing along the path: forward on the click, back on the return.
  const SPARKS = 46;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkAlpha = new Float32Array(SPARKS);
  const sparkSeed = Array.from({ length: SPARKS }, () => Math.random());
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sparkAlpha, 1));
  world.add(new THREE.Points(sparkGeo, new THREE.ShaderMaterial({ ...sparkShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  const along = (u) => base[Math.min(SEGMENTS, Math.max(0, Math.round(u * SEGMENTS)))];

  let phase = null;
  let credited = null;
  let reportKey = null;
  let gapState = null;
  const pointer = { x: 0, y: 0 };

  const draw = (t) => {
    const local = t % LOOP;
    const nextPhase = phaseAt(local);
    const secs = 180 + Math.floor(Math.max(0, local - CONNECT) * 3);
    const screenKey = nextPhase === 'live' ? `live${secs}` : nextPhase;
    if (screenKey !== phase) {
      phase = screenKey;
      paintScreen(screenCtx, nextPhase, secs);
      screenTex.needsUpdate = true;
    }
    const isCredited = local >= RETURN_END;
    if (isCredited !== credited) {
      credited = isCredited;
      paintAd(adCtx, credited);
      adTex.needsUpdate = true;
    }
    onStep(local < CONNECT ? 0 : local < RETURN_START ? 1 : 2);

    const r = Math.min(Math.max((local - RETURN_START) / (RETURN_END - RETURN_START), 0), 1);
    const ret = 1 - (1 - r) ** 3;

    // Report fills in once the conversation is traced back.
    const fill = Math.min(Math.max((local - RETURN_END) / (FILL_END - RETURN_END), 0), 1);
    const key = `${Math.round(fill * 86)}`;
    if (key !== reportKey) {
      reportKey = key;
      paintReport(report.ctx, 1 - (1 - fill) ** 3);
      report.tex.needsUpdate = true;
    }

    // The gap is bridged when the returning signal passes it.
    const bridged = ret >= gapAt;
    if (bridged !== gapState) {
      gapState = bridged;
      paintGap(gap.ctx, bridged);
      gap.tex.needsUpdate = true;
    }
    const pulse = bridged ? 1 + Math.sin(t * 5) * 0.06 : 1 + Math.sin(t * 2.2) * 0.03;
    gap.mesh.scale.setScalar(pulse * (bridged && ret < gapAt + 0.18 ? 1 + (gapAt + 0.18 - ret) * 1.5 : 1));

    // Click ripple.
    const rp = (local - CLICK) / 0.7;
    ripple.scale.setScalar(0.05 + Math.max(0, Math.min(rp, 1)) * 0.45);
    ripple.material.opacity = rp > 0 && rp < 1 ? (1 - rp) * 0.9 : 0;

    // Sparks: forward along the click path, then back along the return path with the head.
    const forward = local > CLICK && local < CONNECT + 0.4;
    sparkSeed.forEach((sd, k) => {
      let u;
      let a = 0;
      if (forward) {
        const f = ((local - CLICK) * 0.7 + sd) % 1;
        u = f * split;
        a = Math.sin(Math.PI * f);
      } else if (r > 0 && r < 1) {
        u = split + (1 - split) * Math.max(0, ret - sd * 0.25);
        a = 1 - sd;
      } else {
        u = 0;
      }
      const p = along(u);
      sparkPos.set([p.x + Math.sin(sd * 40) * 0.06, p.y + Math.cos(sd * 30) * 0.06, p.z], k * 3);
      sparkAlpha[k] = a;
    });
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.aAlpha.needsUpdate = true;
    uniforms.uTime.value = t;
    uniforms.uReturn.value = ret;
    const fade = local > FADE_OUT ? 1 - (local - FADE_OUT) / (LOOP - FADE_OUT) : Math.min(local / 0.5, 1);
    uniforms.uFade.value = fade;
    report.mesh.material.opacity = Math.min(1, fade * 1.2);
    gap.mesh.material.opacity = Math.min(1, fade * 1.2);

    // Slow cinematic push-in over the loop.
    camera.position.z = 11.3 - Math.min(local / LOOP, 1) * 0.7;
    report.mesh.position.y = -1.25 + Math.sin(t * 0.8 + 1) * 0.04;
    ad.position.y = 1.05 + Math.sin(t * 0.7) * 0.04;

    world.rotation.y = Math.sin(t * 0.25) * 0.08 + pointer.x * 0.12;
    world.rotation.x = pointer.y * 0.06;
    phone.position.y = -0.15 + Math.sin(t * 0.9) * 0.06;
    starField.rotation.z = t * 0.004;
    renderer.render(scene, camera);
  };

  const resize = () => {
    const { width, height } = el.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height || 1;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(() => {
    resize();
    if (reducedMotion) draw(FILL_END + 0.5);
  });
  ro.observe(el);

  const onPointer = (e) => {
    const rect = el.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  };

  let frame = 0;
  let visible = false;
  const clock = new THREE.Clock(false);
  const loopFrame = () => {
    frame = requestAnimationFrame(loopFrame);
    if (visible) draw(clock.getElapsedTime());
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) clock.start();
    else clock.stop();
  });

  if (reducedMotion) {
    draw(FILL_END + 0.5);
  } else {
    io.observe(el);
    window.addEventListener('pointermove', onPointer);
    loopFrame();
  }

  return () => {
    cancelAnimationFrame(frame);
    io.disconnect();
    ro.disconnect();
    window.removeEventListener('pointermove', onPointer);
    scene.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.map?.dispose();
      obj.material?.dispose();
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}

export default function ReturnPath() {
  const ref = useRef(null);
  const [step, setStep] = useState(2);

  useEffect(() => {
    const el = ref.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cleanup;
    let cancelled = false;
    let last = -1;
    const onStep = (s) => {
      if (s !== last) {
        last = s;
        setStep(s);
      }
    };

    // Load three.js only when the section is about to scroll into view.
    const gate = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      gate.disconnect();
      mount(el, onStep, reducedMotion)
        .then((dispose) => (cancelled ? dispose() : (cleanup = dispose)))
        .catch((err) => {
          console.error('ReturnPath failed', err);
          el.classList.add('is-unavailable');
        });
    }, { rootMargin: '400px' });
    gate.observe(el);

    return () => {
      cancelled = true;
      gate.disconnect();
      cleanup?.();
    };
  }, []);

  return (
    <figure className="return">
      <div
        className="return__stage"
        ref={ref}
        role="img"
        aria-label="A click on a campaign ad leads to a phone call. The campaign report stops at the click, with calls and revenue unknown. CallsTalk bridges the gap, traces the call back to the ad, and the report fills in: 86 calls and $420 of revenue."
      />
      <ol className="return__steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'is-active' : undefined}><span>{i + 1}</span>{s}</li>
        ))}
      </ol>
    </figure>
  );
}
