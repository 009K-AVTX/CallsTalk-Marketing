import { useEffect, useRef } from 'react';

// Calls, forms and chats travel in from scattered sources and converge on the CallsTalk core.
// Colours match the channel markers in the Statement section below the scene.
export const CHANNEL_COLORS = ['#3fa9e0', '#f2c14e', '#e8edf3'];

const SOURCES = 30;
const PACKETS_PER_SOURCE = 2;

async function mount(el, reducedMotion) {
  const THREE = await import('three');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 12.5);

  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 6, 8);
  scene.add(key);

  const field = new THREE.Group();
  scene.add(field);

  // The core: a brass sphere inside a slowly turning wire shell.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 48, 48),
    new THREE.MeshStandardMaterial({ color: 0x3fa9e0, metalness: 0.45, roughness: 0.3 }),
  );
  const shell = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.15, 1)),
    new THREE.LineBasicMaterial({ color: 0xe8edf3, transparent: true, opacity: 0.2 }),
  );
  field.add(core, shell);

  const colors = CHANNEL_COLORS.map((c) => new THREE.Color(c));
  const nodeGeo = new THREE.SphereGeometry(0.075, 16, 16);
  const packetGeo = new THREE.SphereGeometry(0.06, 12, 12);
  const curves = [];

  // Sources sit on a loose shell (Fibonacci sphere), each wired to the core by a curved path.
  for (let i = 0; i < SOURCES; i++) {
    const y = 1 - (i / (SOURCES - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = i * Math.PI * (3 - Math.sqrt(5));
    const dist = 3.3 + ((i * 7) % 5) * 0.22;
    const start = new THREE.Vector3(Math.cos(theta) * r, y * 0.8, Math.sin(theta) * r).multiplyScalar(dist);
    const bend = start.clone().multiplyScalar(0.45).add(new THREE.Vector3(0, (i % 2 ? 1 : -1) * 0.9, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, bend, new THREE.Vector3());
    const channel = i % 3;
    curves.push({ curve, channel });

    const node = new THREE.Mesh(nodeGeo, new THREE.MeshStandardMaterial({ color: colors[channel], roughness: 0.5 }));
    node.position.copy(start);
    field.add(node);

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)),
      new THREE.LineBasicMaterial({ color: colors[channel], transparent: true, opacity: 0.16 }),
    );
    field.add(line);
  }

  const packets = new THREE.InstancedMesh(
    packetGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.4 }),
    SOURCES * PACKETS_PER_SOURCE,
  );
  curves.forEach(({ channel }, i) => {
    for (let k = 0; k < PACKETS_PER_SOURCE; k++) packets.setColorAt(i * PACKETS_PER_SOURCE + k, colors[channel]);
  });
  field.add(packets);

  const dummy = new THREE.Object3D();
  const point = new THREE.Vector3();
  const pointer = { x: 0, y: 0 };
  let arrivals = 0;

  const draw = (t) => {
    field.rotation.y = t * 0.08 + pointer.x * 0.25;
    field.rotation.x = 0.18 + pointer.y * 0.15;
    shell.rotation.y = -t * 0.25;
    shell.rotation.z = t * 0.1;

    let arrived = 0;
    curves.forEach(({ curve }, i) => {
      for (let k = 0; k < PACKETS_PER_SOURCE; k++) {
        const u = (t * 0.16 + i * 0.137 + k / PACKETS_PER_SOURCE) % 1;
        if (u > 0.97) arrived++;
        curve.getPoint(u, point);
        dummy.position.copy(point);
        dummy.scale.setScalar(1 - u * 0.5);
        dummy.updateMatrix();
        packets.setMatrixAt(i * PACKETS_PER_SOURCE + k, dummy.matrix);
      }
    });
    packets.instanceMatrix.needsUpdate = true;

    // The core swells briefly as packets land.
    arrivals = Math.max(arrivals * 0.92, arrived);
    core.scale.setScalar(1 + Math.min(arrivals, 4) * 0.035);
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
    if (reducedMotion) draw(4);
  });
  ro.observe(el);

  const onPointer = (e) => {
    const rect = el.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  };

  let frame = 0;
  let visible = false;
  const clock = new THREE.Clock();
  const loop = () => {
    frame = requestAnimationFrame(loop);
    if (visible) draw(clock.getElapsedTime());
  };

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) clock.start();
    else clock.stop();
  });

  if (reducedMotion) {
    draw(4);
  } else {
    io.observe(el);
    window.addEventListener('pointermove', onPointer);
    loop();
  }

  return () => {
    cancelAnimationFrame(frame);
    io.disconnect();
    ro.disconnect();
    window.removeEventListener('pointermove', onPointer);
    scene.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}

export default function SignalField() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cleanup;
    let cancelled = false;

    // Load three.js only when the section is about to scroll into view.
    const gate = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      gate.disconnect();
      mount(el, reducedMotion)
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
    <div
      className="signal"
      ref={ref}
      role="img"
      aria-label="Calls, forms and chats from many sources travelling into the CallsTalk core"
    />
  );
}
