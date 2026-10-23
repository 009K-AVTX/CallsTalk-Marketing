import { useEffect, useRef, useState } from 'react';
import { webFontsReady } from '../lib/fonts.js';
import { buildIPhone, clipScreen, paintIPhoneChrome } from '../lib/iphone.js';

const TEX_SCALE = 2; // canvases are drawn at 2x for sharp text
const SCREEN_W = 512;
const SCREEN_H = Math.round(512 * (3.4 * 0.955) / (1.7 * 0.92));

// Channel shades for the Calls / Forms / Chats cards below the scene.
export const CHANNEL_COLORS = ['#d6a3ff', '#e8c9ff', '#ffffff'];

const STEPS = ['A click from a campaign', 'The conversation that closes', 'Revenue back to the campaign'];

// Seconds within one loop.
const LOOP = 9;
const CONNECT = 2.4;
const RETURN_START = 3.6;
const RETURN_END = 5.8;
const FADE_OUT = 8.3;

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

// The phone screen: an incoming call, the live conversation, then the attributed result.
function paintScreen(ctx, phase) {
  const W = SCREEN_W;
  const H = SCREEN_H;
  ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
  ctx.save();
  clipScreen(ctx, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1c1820');
  bg.addColorStop(0.55, '#121015');
  bg.addColorStop(1, '#0b090d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 382, 30, W / 2, 382, 230);
  glow.addColorStop(0, 'rgba(199,146,247,.42)');
  glow.addColorStop(0.5, 'rgba(214,163,255,.12)');
  glow.addColorStop(1, 'rgba(214,163,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 30px Poppins, sans-serif';
  ctx.fillText(phase === 'ring' ? 'Incoming call' : phase === 'live' ? 'Connected' : 'Job booked', W / 2, 200);

  if (phase === 'ring') {
    [150, 112, 74].forEach((r, i) => {
      ctx.strokeStyle = `rgba(232,201,255,${0.18 + i * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W / 2, 380, r, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  drawMark(ctx, W / 2 - 52, 330, 104);

  ctx.font = '600 44px Poppins, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(phase === 'done' ? '$420' : '(555) 014-2290', W / 2, 580);
  ctx.font = '400 26px Geist, sans-serif';
  ctx.fillStyle = '#d4d4d4';
  ctx.fillText(phase === 'ring' ? 'Ringing' : phase === 'live' ? 'Talking 3:12' : 'Same-day repair', W / 2, 628);

  // Source panel: unknown while ringing, then identified.
  ctx.textAlign = 'left';
  roundRect(ctx, 44, 700, W - 88, 170, 26);
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  ctx.fill();
  ctx.strokeStyle = phase === 'ring' ? 'rgba(212,212,212,.25)' : 'rgba(214,163,255,.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = '400 24px Geist, sans-serif';
  ctx.fillStyle = '#b3abbd';
  ctx.fillText(phase === 'done' ? 'Revenue credited to' : 'Source', 76, 752);
  ctx.font = '600 30px Poppins, sans-serif';
  ctx.fillStyle = phase === 'ring' ? '#b3abbd' : '#ffffff';
  ctx.fillText(phase === 'ring' ? 'Identifying...' : 'Paid search', 76, 800);
  ctx.font = '400 24px Geist, sans-serif';
  ctx.fillStyle = '#e8c9ff';
  ctx.fillText(phase === 'ring' ? '' : '"same-day plumbing"', 76, 840);

  ctx.textAlign = 'center';
  roundRect(ctx, W / 2 - 150, 930, 300, 70, 35);
  ctx.fillStyle = phase === 'ring' ? '#d6a3ff' : 'rgba(214,163,255,.18)';
  ctx.fill();
  ctx.font = '600 26px Poppins, sans-serif';
  ctx.fillStyle = phase === 'ring' ? '#160f1f' : '#ffffff';
  ctx.fillText(phase === 'ring' ? 'Answer' : phase === 'live' ? 'Recording' : 'Attributed', W / 2, 975);
  paintIPhoneChrome(ctx, W, H);
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
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 1.5), 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.1, 10.5);

  scene.add(new THREE.AmbientLight(0xd4d4d4, 0.6));
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
  phone.rotation.set(0.14, -0.5, 0.06);
  world.add(phone);
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

  let phase = null;
  let credited = null;
  const pointer = { x: 0, y: 0 };

  const draw = (t) => {
    const local = t % LOOP;
    const nextPhase = phaseAt(local);
    if (nextPhase !== phase) {
      phase = nextPhase;
      paintScreen(screenCtx, phase);
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
    uniforms.uTime.value = t;
    uniforms.uReturn.value = 1 - (1 - r) ** 3;
    uniforms.uFade.value = local > FADE_OUT ? 1 - (local - FADE_OUT) / (LOOP - FADE_OUT) : Math.min(local / 0.5, 1);

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
    if (reducedMotion) draw(RETURN_END + 1);
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
    draw(RETURN_END + 1);
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
        .catch(() => el.classList.add('is-unavailable'));
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
        aria-label="A click on a campaign ad leads to a phone call. CallsTalk traces the call back to the ad and credits it with $420 of revenue."
      />
      <ol className="return__steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'is-active' : undefined}><span>{i + 1}</span>{s}</li>
        ))}
      </ol>
    </figure>
  );
}
