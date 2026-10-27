import { useEffect, useRef, useState } from 'react';
import { webFontsReady } from '../lib/fonts.js';
import { buildIPhone } from '../lib/iphone.js';
import { avatar, check, handset, paintCallScreen, roundRect, text } from '../lib/callScreen.js';

// Five short 3D vignettes, one per part of the product, shown in turn.
const STEPS = ['Call Attribution', 'Lead Scoring', 'Revenue by Channel', 'Calls from Every Market', 'Conversion Sync'];
const DUR = 6.5; // seconds per vignette
const EDGE = 0.75; // seconds of transition in and out

const ORANGE = 0xd6a3ff;
const TYPE_COLORS = ['#d6a3ff', '#e8c9ff', '#ffffff']; // calls, forms, chats

const clamp = (x) => Math.min(Math.max(x, 0), 1);
const ease = (x) => 1 - (1 - clamp(x)) ** 3;
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const money = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`);

function card(ctx, W, H, active) {
  ctx.clearRect(0, 0, W, H);
  roundRect(ctx, 4, 4, W - 8, H - 8, 30);
  ctx.fillStyle = '#17141b';
  ctx.fill();
  ctx.lineWidth = active ? 4 : 2;
  ctx.strokeStyle = active ? '#d6a3ff' : '#302a36';
  ctx.stroke();
}

function bars(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(214,163,255,.16)';
  roundRect(ctx, x, y, s, s, s * 0.28);
  ctx.fill();
  ctx.fillStyle = '#d6a3ff';
  [[0.28, 0.55, 0.13, 0.22], [0.45, 0.4, 0.13, 0.37], [0.62, 0.25, 0.13, 0.52]].forEach(([bx, by, bw, bh]) => {
    roundRect(ctx, x + s * bx, y + s * by, s * bw, s * bh, s * 0.06);
    ctx.fill();
  });
}

const pointShader = {
  vertexShader: /* glsl */ `
    attribute vec3 aColor;
    attribute float aAlpha;
    attribute float aSize;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = aColor;
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (300.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uFade;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float core = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.5), core * vAlpha * uFade);
    }`,
};

// A light trail along a tube: a faint lit line up to uReach, and a bright head
// with a fading tail that travels toward the phone (uDir 1) or back to the ad (-1).
const signalShader = {
  vertexShader: /* glsl */ `
    varying float vU;
    void main() {
      vU = uv.x;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uHead;
    uniform float uReach;
    uniform float uDir;
    uniform float uPulse;
    uniform float uTime;
    uniform float uFade;
    varying float vU;
    void main() {
      float behind = uDir > 0.0 ? uHead - vU : vU - uHead;
      float tail = behind >= 0.0 ? exp(-behind * 7.0) : 0.0;
      float head = exp(-pow((vU - uHead) * 38.0, 2.0));
      float lit = step(vU, uReach) * (0.3 + 0.08 * sin(vU * 60.0 - uTime * 6.0));
      float a = lit + uPulse * (tail * 0.75 + head * 1.6);
      vec3 color = mix(vec3(0.84, 0.64, 1.0), vec3(1.0), clamp(head * uPulse, 0.0, 1.0));
      gl_FragColor = vec4(color, clamp(a, 0.0, 1.0) * uFade);
    }`,
};

async function mount(el, onStep, reducedMotion) {
  const THREE = await import('../lib/three.js');
  const { RoundedBoxGeometry } = THREE;
  await webFontsReady();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  // Phones get a lighter render: their screens are dense and their GPUs are slower.
  const small = window.innerWidth < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.prepend(renderer.domElement);
  requestAnimationFrame(() => el.classList.add('is-live'));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(-3, 6, 6);
  scene.add(key);
  const warm = new THREE.PointLight(ORANGE, 16, 10, 2);
  warm.position.set(1.5, 3, 3);
  scene.add(warm);

  // Shared helpers -----------------------------------------------------------
  const TEX_SCALE = 2;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const canvasPlane = (w, h, cw, ch) => {
    const c = document.createElement('canvas');
    c.width = cw * TEX_SCALE;
    c.height = ch * TEX_SCALE;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    let last = null;
    // Repaint only when the key changes, so live counters stay cheap.
    const paint = (keyValue, fn) => {
      if (keyValue === last) return;
      last = keyValue;
      const ctx = c.getContext('2d');
      ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
      ctx.save();
      fn(ctx, cw, ch);
      ctx.restore();
      tex.needsUpdate = true;
    };
    return { mesh, paint };
  };
  const particles = (count, colorAt, sizeAt) => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const alpha = new Float32Array(count);
    const size = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      const c = new THREE.Color(colorAt(k));
      col.set([c.r, c.g, c.b], k * 3);
      size[k] = sizeAt(k);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({ ...pointShader, uniforms: { uFade: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat);
    const commit = () => {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    };
    return { points, pos, alpha, commit, mat };
  };
  const metal = (color = 0x1c1820) => new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3, emissive: ORANGE, emissiveIntensity: 0 });

  // Vignette 1: call attribution --------------------------------------------
  function callVignette() {
    const g = new THREE.Group();
    const phone = new THREE.Group();
    phone.position.set(1.35, -0.05, 0.3);
    phone.scale.setScalar(1.08);
    g.add(phone);
    const device = buildIPhone(THREE, RoundedBoxGeometry, 1.5, 3.0);
    phone.add(device.group);
    const screen = canvasPlane(device.screenW, device.screenH, 400, Math.round(400 * device.screenH / device.screenW));
    screen.mesh.position.z = device.frontZ;
    phone.add(screen.mesh);
    const rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.01, 8, 96), new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true }));
      r.position.z = -0.25; // behind the phone so the screen stays clear
      phone.add(r);
      return r;
    });
    const ad = canvasPlane(2.3, 1.18, 600, 308);
    ad.mesh.position.set(-2.1, 0.85, -0.3);
    ad.mesh.rotation.y = 0.35;
    g.add(ad.mesh);
    const chip = canvasPlane(2.5, 0.46, 740, 136);
    chip.mesh.position.set(-1.65, -1.05, 0.4);
    g.add(chip.mesh);
    chip.paint('chip', (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H);
      roundRect(ctx, 4, 4, W - 8, H - 8, (H - 8) / 2);
      ctx.fillStyle = 'rgba(214,163,255,.22)';
      ctx.fill();
      ctx.strokeStyle = '#d6a3ff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#d6a3ff';
      ctx.beginPath();
      ctx.arc(46, H / 2, 9, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, 'Source: Paid search, "same-day plumbing"', 72, H / 2 + 10, '500 28px Geist, sans-serif', '#ffffff');
    });
    // The signal path: out of the ad's right edge level with Call now, arcing into the phone's left edge.
    ad.mesh.updateMatrix();
    const start = new THREE.Vector3(1.13, -0.36, 0.01).applyMatrix4(ad.mesh.matrix);
    const path = new THREE.CubicBezierCurve3(start, new THREE.Vector3(-0.55, 1.55, -0.1), new THREE.Vector3(0.05, 1.5, 0.35), new THREE.Vector3(0.52, 0.35, 0.32));
    const signalUniforms = { uHead: { value: 0 }, uReach: { value: 0 }, uDir: { value: 1 }, uPulse: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 } };
    const signal = new THREE.Mesh(
      new THREE.TubeGeometry(path, 140, 0.014, 8, false),
      new THREE.ShaderMaterial({ ...signalShader, uniforms: signalUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    g.add(signal);
    // A soft glow riding the head of the pulse.
    const spark = particles(2, (k) => (k ? '#ffffff' : '#d6a3ff'), (k) => (k ? 0.32 : 0.9));
    g.add(spark.points);
    const pt = new THREE.Vector3();
    const CLICK = 0.8;
    const ARRIVE = 1.9;
    const BOOKED = 4.6;
    const RETURNED = 5.6;

    const update = (u) => {
      const ringing = u < 3.2;
      const credited = u > RETURNED;
      const phase = u < ARRIVE ? 'idle' : ringing ? 'ring' : u < 4.6 ? 'live' : 'done';
      const secs = Math.floor(Math.max(0, u - 3.2) * 9) + 180;
      screen.paint(phase === 'live' ? `live${secs}` : phase, (ctx, W, H) => {
        paintCallScreen(ctx, W, H, phase, secs, 'Revenue sent to Google Ads');
      });
      const pressed = u > CLICK && u < CLICK + 0.45;
      ad.paint(`${pressed}|${credited}|${u > CLICK}`, (ctx, W, H) => {
        card(ctx, W, H, u > CLICK);
        roundRect(ctx, 34, 30, 112, 34, 17);
        ctx.fillStyle = 'rgba(214,163,255,.16)';
        ctx.fill();
        text(ctx, 'Sponsored', 90, 54, '600 18px Geist, sans-serif', '#d6a3ff', 'center');
        text(ctx, 'austinplumbingpros.com', 162, 54, '400 20px Geist, sans-serif', '#a59cb0');
        text(ctx, 'Same-day plumbing', 36, 112, '600 40px Poppins, sans-serif', '#ffffff');
        text(ctx, 'Licensed plumbers on site in 60 minutes.', 36, 150, '400 22px Geist, sans-serif', '#c9c1d3');
        text(ctx, '★★★★★', 36, 186, '400 20px Geist, sans-serif', '#f5c451');
        text(ctx, '4.9 · 312 reviews', 152, 186, '400 20px Geist, sans-serif', '#a59cb0');
        if (credited) {
          roundRect(ctx, 276, 212, 270, 64, 32);
          ctx.fillStyle = 'rgba(214,163,255,.14)';
          ctx.fill();
          ctx.strokeStyle = '#d6a3ff';
          ctx.lineWidth = 2;
          ctx.stroke();
          text(ctx, '+$420 attributed', 411, 254, '600 24px Poppins, sans-serif', '#ffffff', 'center');
        }
        roundRect(ctx, 36, 212, 220, 64, 32);
        ctx.fillStyle = pressed ? '#ecd4ff' : '#d6a3ff';
        ctx.fill();
        text(ctx, 'Call now', 166, 254, '600 26px Poppins, sans-serif', '#160f1f', 'center');
        handset(ctx, 82, 244, 18, '#160f1f');
      });
      rings.forEach((r, i) => {
        const ph = (u * 0.9 + i / 3) % 1;
        const s = 1.0 + ph * 0.85;
        r.scale.set(s, s * 1.25, s);
        r.userData.alpha = ringing && u > ARRIVE ? (1 - ph) * 0.6 * ease((u - ARRIVE) / 0.3) : 0;
      });
      phone.rotation.y = -0.2 + Math.sin(u * 0.6) * 0.07;
      phone.rotation.x = 0.04;
      // Click: a pulse runs to the phone. Booked: a pulse returns the revenue to the ad.
      const out = clamp((u - CLICK) / (ARRIVE - CLICK));
      const back = clamp((u - BOOKED) / (RETURNED - BOOKED));
      const goingBack = u > BOOKED;
      const head = goingBack ? 1 - smooth(back) : smooth(out);
      const live = (u > CLICK && u < ARRIVE + 0.25) || (goingBack && u < RETURNED + 0.25);
      signalUniforms.uHead.value = head;
      signalUniforms.uReach.value = u > CLICK ? (goingBack ? 1 : smooth(out)) : 0;
      signalUniforms.uDir.value = goingBack ? -1 : 1;
      signalUniforms.uPulse.value = live ? 1 : Math.max(0, 1 - (u - (goingBack ? RETURNED : ARRIVE)) * 4);
      signalUniforms.uTime.value = u;
      path.getPoint(head, pt);
      for (let k = 0; k < 2; k++) {
        spark.pos.set([pt.x, pt.y, pt.z], k * 3);
        spark.alpha[k] = signalUniforms.uPulse.value * (k ? 1 : 0.55);
      }
      spark.commit();
      const c = ease((u - 3.4) / 0.6);
      chip.mesh.scale.setScalar(0.6 + 0.4 * c);
      chip.mesh.userData.alpha = c;
    };
    return { g, update };
  }

  // Vignette 2: lead scoring --------------------------------------------------
  function scoreVignette() {
    const g = new THREE.Group();
    const N = 96;
    const R = 1.55;
    const seg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 1, 0.14), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4 }), N);
    seg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    const dial = new THREE.Group();
    dial.position.set(1.4, 0, 0);
    dial.rotation.x = -0.95;
    dial.add(seg);
    g.add(dial);
    const center = canvasPlane(1.6, 1.0, 420, 262);
    center.mesh.position.set(1.4, 0.15, 0.6);
    g.add(center.mesh);
    const lead = canvasPlane(2.5, 1.55, 620, 384);
    // 384 tall canvas holds the caller, three signals and the routing line.
    lead.mesh.position.set(-1.85, 0.25, 0.1);
    lead.mesh.rotation.y = 0.3;
    g.add(lead.mesh);
    const dummy = new THREE.Object3D();
    const on = new THREE.Color(ORANGE);
    const off = new THREE.Color(0x2c2632);
    const mix = new THREE.Color();

    const update = (u) => {
      const score = Math.round(86 * ease((u - 0.8) / 2.6));
      const lit = Math.round((score / 100) * N);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + Math.PI / 2;
        const active = i < lit;
        const pop = active ? 1 : 0;
        dummy.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
        dummy.rotation.set(Math.PI / 2, 0, a);
        dummy.scale.set(1, 0.16 + pop * 0.16, 1);
        dummy.position.z = pop * 0.06;
        dummy.updateMatrix();
        seg.setMatrixAt(i, dummy.matrix);
        mix.copy(active ? on : off);
        if (active && i === lit - 1) mix.lerp(new THREE.Color(0xffffff), 0.6);
        seg.setColorAt(i, mix);
      }
      seg.instanceMatrix.needsUpdate = true;
      seg.instanceColor.needsUpdate = true;
      dial.rotation.z = u * 0.15;
      center.paint(score, (ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        text(ctx, String(score), W / 2, 150, '600 130px Poppins, sans-serif', '#ffffff', 'center');
        text(ctx, 'Lead score', W / 2, 212, '500 34px Geist, sans-serif', '#b3abbd', 'center');
      });
      const routed = u > 3.8;
      const signals = Math.min(3, Math.floor((u - 0.8) / 0.9));
      lead.paint(`${routed}|${signals}`, (ctx, W, H) => {
        card(ctx, W, H, routed);
        avatar(ctx, 72, 76, 38, 'JM');
        text(ctx, 'Jordan Miles', 128, 70, '600 34px Poppins, sans-serif', '#ffffff');
        text(ctx, 'Inbound call · Paid search', 128, 108, '400 24px Geist, sans-serif', '#c9c1d3');
        [['Asked for a quote', 'High intent'], ['Call length 3:12', 'Engaged'], ['Keyword match', 'Emergency repair']].forEach(([l, v], i) => {
          const y = 168 + i * 54;
          const shown = i < signals;
          ctx.globalAlpha = shown ? 1 : 0.35;
          if (shown) check(ctx, 50, y - 8, 13);
          else { ctx.strokeStyle = '#4d4555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(50, y - 8, 12, 0, Math.PI * 2); ctx.stroke(); }
          text(ctx, l, 76, y, '400 24px Geist, sans-serif', '#ffffff');
          text(ctx, v, W - 36, y, '500 22px Geist, sans-serif', '#d6a3ff', 'right');
          ctx.globalAlpha = 1;
        });
        roundRect(ctx, 36, 318, W - 72, 46, 23);
        ctx.fillStyle = routed ? 'rgba(214,163,255,.18)' : 'rgba(255,255,255,.04)';
        ctx.fill();
        text(ctx, routed ? 'Routed to Sales in 4 seconds' : 'Scoring intent...', W / 2, 349, '600 22px Poppins, sans-serif', routed ? '#d6a3ff' : '#a59cb0', 'center');
      });
      lead.mesh.position.y = 0.25 + Math.sin(u * 1.2) * 0.05;
    };
    return { g, update };
  }

  // Vignette 3: revenue by channel ---------------------------------------------
  function revenueVignette() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.set(-0.75, -1.15, 0);
    inner.scale.setScalar(0.85);
    inner.rotation.y = -0.18;
    g.add(inner);
    const CH = [['Paid search', 18400], ['Organic search', 9200], ['Paid social', 5100], ['Email', 3600]];
    const X = [0.55, 1.75, 2.95, 4.15];
    const grid = new THREE.GridHelper(16, 32, 0x2c2632, 0x1b1720);
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    inner.add(grid);
    const geo = new RoundedBoxGeometry(0.72, 1, 0.72, 4, 0.08);
    geo.translate(0, 0.5, 0);
    const sources = CH.map(([name], i) => {
      const p = canvasPlane(2.3, 0.75, 460, 150);
      p.mesh.position.set(-2.45, 2.85 - i * 0.92, -0.4);
      p.mesh.rotation.y = 0.32;
      inner.add(p.mesh);
      return p;
    });
    const items = CH.map(([name, value], i) => {
      const mat = metal();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(X[i], 0, 0);
      inner.add(mesh);
      const label = canvasPlane(1.5, 0.68, 420, 190);
      label.mesh.position.set(X[i], 0, 0.5);
      inner.add(label.mesh);
      return { mesh, mat, label };
    });
    const crown = canvasPlane(1.75, 0.37, 520, 110);
    crown.paint('crown', (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H);
      roundRect(ctx, 4, 4, W - 8, H - 8, 51);
      ctx.fillStyle = '#d6a3ff';
      ctx.fill();
      text(ctx, 'Top revenue channel', W / 2, 68, '600 38px Poppins, sans-serif', '#160f1f', 'center');
    });
    inner.add(crown.mesh);
    const curves = CH.map(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()));
    const owner = [];
    CH.forEach(([, v], i) => { for (let k = 0; k < Math.round(v / 200); k++) owner.push(i); });
    const flow = particles(owner.length, (k) => TYPE_COLORS[k % 3], () => 0.09 + Math.random() * 0.07);
    inner.add(flow.points);
    const seeds = owner.map(() => Math.random());
    const pt = new THREE.Vector3();

    const update = (u) => {
      const fill = (i) => ease((u - 0.5 - i * 0.3) / 3.2);
      items.forEach((b, i) => {
        const f = fill(i);
        const h = Math.max(0.001, 2.15 * (CH[i][1] / CH[0][1]) * f);
        b.mesh.scale.y = h;
        const top = i === 0 && u > 4.2;
        b.mat.emissiveIntensity = 0.12 + 0.3 * (CH[i][1] / CH[0][1]) * f + (top ? 0.5 + 0.2 * Math.sin(u * 6) : 0);
        b.label.mesh.position.y = h + 0.5;
        b.label.paint(`${Math.round(CH[i][1] * f / 100)}|${top}`, (ctx, W, H) => {
          ctx.clearRect(0, 0, W, H);
          text(ctx, money(CH[i][1] * f), W / 2, 74, '600 58px Poppins, sans-serif', top ? '#d6a3ff' : '#ffffff', 'center');
          text(ctx, CH[i][0], W / 2, 130, '500 36px Geist, sans-serif', '#c9c1d3', 'center');
        });
        const s = sources[i].mesh.position;
        curves[i].v0.set(s.x + 1.15, s.y, s.z + 0.15);
        curves[i].v1.set((s.x + X[i]) / 2 + 0.2, Math.max(s.y, h) + 1.1, 0.2);
        curves[i].v2.set(X[i], h + 0.05, 0);
        const active = u > 0.5 && u < 4.0;
        sources[i].paint(active, (ctx, W, H) => {
          card(ctx, W, H, active);
          bars(ctx, 30, 35, 80);
          text(ctx, CH[i][0], 136, 66, '600 32px Poppins, sans-serif', '#ffffff');
          text(ctx, `${Math.round(CH[i][1] / 45)} calls · ${Math.round(CH[i][1] / 160)} forms`, 136, 106, '400 24px Geist, sans-serif', '#c9c1d3');
        });
      });
      owner.forEach((i, k) => {
        const p = (u * 0.32 + seeds[k]) % 1;
        curves[i].getPoint(p, pt);
        flow.pos.set([pt.x, pt.y, pt.z + Math.cos(seeds[k] * 30 + u) * 0.05], k * 3);
        flow.alpha[k] = u > 0.5 && u < 4.0 ? Math.sin(Math.PI * p) * 0.95 : 0;
      });
      flow.commit();
      const c = ease((u - 4.2) / 0.4);
      crown.mesh.userData.alpha = c;
      crown.mesh.position.set(X[0], items[0].mesh.scale.y + 1.12 + (1 - c) * 0.2, 0.5);
    };
    return { g, update };
  }

  // Vignette 4: calls from every market ---------------------------------------
  function globeVignette() {
    const g = new THREE.Group();
    const globe = new THREE.Group();
    globe.position.set(1.1, -0.1, 0);
    g.add(globe);
    const R = 1.75;
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 48, 48), new THREE.MeshStandardMaterial({ color: 0x0c0a0e, metalness: 0.2, roughness: 0.8 })));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x5a4d68, transparent: true, opacity: 0.5 });
    for (let k = 1; k < 8; k++) {
      const lat = -Math.PI / 2 + (k / 8) * Math.PI;
      const pts = Array.from({ length: 97 }, (_, j) => {
        const a = (j / 96) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * Math.cos(lat) * R, Math.sin(lat) * R, Math.sin(a) * Math.cos(lat) * R);
      });
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
    for (let k = 0; k < 12; k++) {
      const lon = (k / 12) * Math.PI;
      const pts = Array.from({ length: 97 }, (_, j) => {
        const a = (j / 96) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * Math.cos(lon) * R, Math.sin(a) * R, Math.cos(a) * Math.sin(lon) * R);
      });
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
    // A fine dot shell gives the sphere its surface.
    const shell = new Float32Array(1400 * 3);
    for (let k = 0; k < 1400; k++) {
      const y = 1 - (k / 1399) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = k * 2.39996;
      shell.set([Math.cos(th) * r * R * 1.002, y * R * 1.002, Math.sin(th) * r * R * 1.002], k * 3);
    }
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute('position', new THREE.BufferAttribute(shell, 3));
    globe.add(new THREE.Points(shellGeo, new THREE.PointsMaterial({ color: 0xb48be0, size: 0.03, transparent: true, opacity: 0.6, depthWrite: false })));
    // City dots on the surface.
    const cities = Array.from({ length: 14 }, (_, i) => {
      const y = 1 - (i / 13) * 1.6 - 0.2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.4;
      return new THREE.Vector3(Math.cos(th) * r * R, y * R, Math.sin(th) * r * R);
    });
    const dotGeo = new THREE.SphereGeometry(0.045, 12, 12);
    cities.forEach((c) => {
      const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: ORANGE }));
      d.position.copy(c);
      globe.add(d);
    });
    // Arcs between city pairs, each with a travelling pulse.
    const pairs = [[0, 5], [2, 9], [4, 11], [7, 1], [10, 3], [12, 6], [8, 13]];
    const arcs = pairs.map(([a, b]) => {
      const p0 = cities[a];
      const p2 = cities[b];
      const mid = p0.clone().add(p2).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.55);
      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), new THREE.LineBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.35 }));
      globe.add(line);
      return curve;
    });
    const pulses = particles(arcs.length * 2, (k) => (k % 2 ? '#ffffff' : '#c792f7'), () => 0.22);
    globe.add(pulses.points);
    const counter = canvasPlane(2.6, 1.3, 640, 320);
    counter.mesh.position.set(-2.0, 0.2, 0.3);
    counter.mesh.rotation.y = 0.3;
    g.add(counter.mesh);
    const pt = new THREE.Vector3();

    const update = (u) => {
      globe.rotation.y = u * 0.35;
      globe.rotation.x = 0.25;
      arcs.forEach((curve, i) => {
        for (let k = 0; k < 2; k++) {
          const p = (u * 0.45 + i * 0.37 + k * 0.5) % 1;
          curve.getPoint(p, pt);
          pulses.pos.set([pt.x, pt.y, pt.z], (i * 2 + k) * 3);
          pulses.alpha[i * 2 + k] = Math.sin(Math.PI * p);
        }
      });
      pulses.commit();
      const calls = Math.round(1284 * ease((u - 0.4) / 3.6));
      counter.paint(calls, (ctx, W, H) => {
        card(ctx, W, H, true);
        ctx.fillStyle = '#2fbf71';
        ctx.beginPath();
        ctx.arc(48, 64, 8, 0, Math.PI * 2);
        ctx.fill();
        text(ctx, 'Live · calls tracked today', 66, 72, '500 26px Geist, sans-serif', '#b3abbd');
        text(ctx, calls.toLocaleString('en-US'), 40, 158, '600 84px Poppins, sans-serif', '#ffffff');
        text(ctx, 'across 14 markets', W - 40, 156, '500 24px Geist, sans-serif', '#d6a3ff', 'right');
        [['Austin', 0.42], ['Denver', 0.31], ['Miami', 0.27]].forEach(([m, share], i) => {
          const y = 206 + i * 36;
          text(ctx, m, 40, y + 9, '400 22px Geist, sans-serif', '#c9c1d3');
          roundRect(ctx, 150, y - 6, W - 300, 14, 7);
          ctx.fillStyle = 'rgba(255,255,255,.07)';
          ctx.fill();
          roundRect(ctx, 150, y - 6, Math.max(14, (W - 300) * share * 2 * (calls / 1284)), 14, 7);
          ctx.fillStyle = '#d6a3ff';
          ctx.fill();
          text(ctx, Math.round(calls * share).toLocaleString('en-US'), W - 40, y + 9, '600 22px Geist, sans-serif', '#ffffff', 'right');
        });
      });
      counter.mesh.position.y = 0.2 + Math.sin(u * 1.1) * 0.05;
    };
    return { g, update };
  }

  // Vignette 5: conversion sync ------------------------------------------------
  function syncVignette() {
    const g = new THREE.Group();
    const hub = new THREE.Group();
    g.add(hub);
    const hubBody = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.2, 0.4, 6, 0.26), metal(0x16131a));
    hubBody.material.emissiveIntensity = 0.06;
    hub.add(hubBody);
    const face = canvasPlane(1.1, 1.1, 300, 300);
    face.mesh.position.z = 0.21;
    face.paint('logo', (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H);
      const s = 200;
      const x = (W - s) / 2;
      const y = (H - s) / 2;
      ctx.fillStyle = '#8a55d6';
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
    });
    hub.add(face.mesh);
    // Orbit path traced as an ellipse matching the cards' motion.
    const orbitRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 160 }, (_, k) => {
        const a = (k / 160) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 3.0, Math.sin(a) * 1.25, Math.sin(a) * 1.2);
      })),
      new THREE.LineBasicMaterial({ color: 0x3a3341, transparent: true }),
    );
    orbitRing.renderOrder = -1;
    g.add(orbitRing);
    const PLATFORMS = [['Search ads', 34], ['Social ads', 21], ['Display ads', 12]];
    const cards = PLATFORMS.map(() => {
      const p = canvasPlane(1.7, 0.66, 460, 178);
      p.mesh.renderOrder = 2;
      g.add(p.mesh);
      return p;
    });
    const flow = particles(90, (k) => TYPE_COLORS[k % 3], () => 0.1);
    g.add(flow.points);
    const seeds = Array.from({ length: 90 }, () => Math.random());

    const update = (u) => {
      hub.rotation.y = Math.sin(u * 0.8) * 0.35;
      hub.position.y = Math.sin(u * 1.3) * 0.06;
      cards.forEach((p, i) => {
        const a = u * 0.35 + (i / 3) * Math.PI * 2;
        p.mesh.position.set(Math.cos(a) * 3.0, Math.sin(a) * 1.25, Math.sin(a) * 1.2);
        const n = Math.round(PLATFORMS[i][1] * ease((u - 0.8 - i * 0.3) / 3.4));
        p.paint(n, (ctx, W, H) => {
          card(ctx, W, H, n > 0);
          bars(ctx, 28, 36, 64);
          text(ctx, PLATFORMS[i][0], 110, 70, '600 34px Poppins, sans-serif', '#ffffff');
          text(ctx, n > 0 ? 'Conversions synced' : 'Waiting for calls', 110, 112, '400 26px Geist, sans-serif', '#c9c1d3');
          text(ctx, `+${n}`, W - 30, 72, '600 34px Poppins, sans-serif', '#d6a3ff', 'right');
          if (n === PLATFORMS[i][1]) check(ctx, W - 46, 118, 14);
        });
      });
      seeds.forEach((sd, k) => {
        const i = k % 3;
        const p = (u * 0.5 + sd) % 1;
        const tgt = cards[i].mesh.position;
        const e = smooth(p);
        flow.pos.set([tgt.x * e, tgt.y * e + Math.sin(Math.PI * p) * 0.5, tgt.z * e], k * 3);
        flow.alpha[k] = u > 0.8 ? Math.sin(Math.PI * p) * 0.9 : 0;
      });
      flow.commit();
    };
    return { g, update };
  }

  // Stars behind every vignette.
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(700 * 3);
  const sc = new Float32Array(700 * 3);
  for (let i = 0; i < 700; i++) {
    const r = Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    sp.set([Math.cos(a) * r * 12, Math.sin(a) * r * 7, -5 - Math.random() * 6], i * 3);
    const f = 0.6 * (1 - r ** 3);
    sc.set([f, f * 0.85, f * 0.75], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.03, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(stars);

  const vignettes = [];
  for (const build of [callVignette, scoreVignette, revenueVignette, globeVignette, syncVignette]) {
    vignettes.push(build());
    await new Promise((r) => setTimeout(r, 0));
  }
  vignettes.forEach((v) => {
    scene.add(v.g);
    // Cache every material once so the transition can fade the whole vignette.
    v.mats = [];
    v.g.traverse((o) => {
      if (!o.material) return;
      o.material.transparent = true;
      v.mats.push({ o, m: o.material, base: o.material.opacity ?? 1 });
    });
  });

  const pointer = { x: 0, y: 0 };
  let lastStep = -1;
  const draw = (t) => {
    const total = DUR * vignettes.length;
    const local = t % total;
    const index = Math.floor(local / DUR);
    const u = local - index * DUR;
    if (index !== lastStep) {
      lastStep = index;
      onStep(index);
    }
    const inP = smooth(u / EDGE);
    const outP = smooth((DUR - u) / EDGE);
    const show = Math.min(inP, outP);
    vignettes.forEach((v, i) => {
      const active = i === index;
      v.g.visible = active;
      if (!active) return;
      v.update(u);
      v.g.scale.setScalar(0.82 + 0.18 * show);
      v.g.rotation.y = (1 - inP) * -0.7 + (1 - outP) * 0.7;
      v.g.position.y = (1 - show) * -0.25;
      // Overall fade times any element's own fade (userData.alpha).
      v.mats.forEach(({ o, m, base }) => {
        if (m.uniforms?.uFade) m.uniforms.uFade.value = show;
        else m.opacity = base * show * (o.userData.alpha ?? 1);
      });
    });
    stars.rotation.z = t * 0.004;
    camera.position.set(pointer.x * 0.3, 0.45 - pointer.y * 0.15, 8.1);
    camera.lookAt(0, 0.15, 0);
    renderer.render(scene, camera);
  };

  const resize = () => {
    const { width, height } = el.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height || 16 / 9;
    camera.updateProjectionMatrix();
  };
  resize();
  const still = DUR * 2 + 5;
  const ro = new ResizeObserver(() => {
    resize();
    if (reducedMotion) draw(still);
  });
  ro.observe(el);

  const onPointer = (e) => {
    const rect = el.getBoundingClientRect();
    pointer.x = clamp((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = clamp((e.clientY - rect.top) / rect.height) * 2 - 1;
  };

  let frame = 0;
  let visible = false;
  let paused = false;
  const clock = new THREE.Clock(false);
  // The loop runs only while the scene is on screen and playing, so it costs nothing while the visitor scrolls on.
  const loop = () => {
    frame = requestAnimationFrame(loop);
    draw(clock.getElapsedTime());
  };
  const sync = () => {
    if (visible && !paused) {
      if (!frame) { clock.start(); loop(); }
    } else if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      clock.stop();
    }
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });

  if (reducedMotion) {
    draw(still);
  } else {
    io.observe(el);
    window.addEventListener('pointermove', onPointer);
  }

  return {
    setPaused(p) {
      paused = p;
      sync();
    },
    dispose() {
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
    },
  };
}

export default function HeroScene() {
  const ref = useRef(null);
  const api = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) setPlaying(false);
    let cancelled = false;
    let idle = 0;
    const start = () => {
      mount(ref.current, setStep, reducedMotion)
        .then((a) => (cancelled ? a.dispose() : (api.current = a)))
        .catch(() => setFailed(true));
    };
    // Defer the 3D library until the page has loaded so it never delays the first paint.
    const EVENTS = ['pointermove', 'pointerdown', 'scroll', 'keydown', 'touchstart'];
    let timer = 0;
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, go));
      idle = window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200);
    };
    // The poster image shows immediately; the live 3D takes over after the visitor engages or within a few seconds.
    const schedule = () => {
      EVENTS.forEach((e) => window.addEventListener(e, go, { once: true, passive: true }));
      timer = setTimeout(go, 3500);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, go));
      window.removeEventListener('load', schedule);
      (window.cancelIdleCallback || clearTimeout)(idle);
      api.current?.dispose();
    };
  }, []);

  const toggle = () => {
    api.current?.setPaused(playing);
    setPlaying(!playing);
  };

  return (
    <>
      <div
        className={`hero-scene${failed ? ' is-unavailable' : ''}`}
        ref={ref}
        role="img"
        aria-label="3D animations of CallsTalk: a ringing phone traced to its ad, a lead score dial, revenue bars by channel, calls arriving from many markets on a globe, and conversions syncing to ad platforms."
      />
      <div className="hero-scene__bar">
        <div className="hero-scene__caption" aria-hidden="true">
          <span>{STEPS[step]}</span>
          <ol>{STEPS.map((s, i) => <li key={s} className={i === step ? 'is-active' : undefined} />)}</ol>
        </div>
        <button className={`intro__toggle${playing ? '' : ' is-paused'}`} onClick={toggle}
          aria-label={playing ? 'Pause animation' : 'Play animation'} />
      </div>
    </>
  );
}
