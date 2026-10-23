// A 3D iPhone for the scenes: titanium frame, black glass front, side buttons, and a screen plane
// whose canvas gets the Dynamic Island, status bar and home indicator drawn on top of the app content.

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Clip to the screen's rounded corners; call before painting the app content.
export function clipScreen(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  roundRect(ctx, 0, 0, W, H, W * 0.13);
  ctx.clip();
}

// Status bar, Dynamic Island and home indicator; call after painting the app content.
export function paintIPhoneChrome(ctx, W, H) {
  ctx.save();
  const top = H * 0.043;
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${W * 0.05}px Geist, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('9:41', W * 0.17, top);
  // Signal bars.
  const sx = W * 0.7;
  [0.35, 0.55, 0.75, 1].forEach((f, i) => {
    const bh = W * 0.034 * f;
    roundRect(ctx, sx + i * W * 0.018, top + W * 0.017 - bh, W * 0.012, bh, W * 0.003);
    ctx.fill();
  });
  // Wi-Fi.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = W * 0.008;
  ctx.lineCap = 'round';
  const wx = W * 0.81;
  const wy = top + W * 0.016;
  [0.035, 0.022].forEach((r) => {
    ctx.beginPath();
    ctx.arc(wx, wy, W * r, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.arc(wx, wy, W * 0.007, 0, Math.PI * 2);
  ctx.fill();
  // Battery.
  const bx = W * 0.855;
  const by = top - W * 0.018;
  ctx.globalAlpha = 0.45;
  roundRect(ctx, bx, by, W * 0.07, W * 0.036, W * 0.01);
  ctx.lineWidth = W * 0.005;
  ctx.stroke();
  ctx.globalAlpha = 1;
  roundRect(ctx, bx + W * 0.008, by + W * 0.008, W * 0.054, W * 0.02, W * 0.005);
  ctx.fill();
  ctx.fillRect(bx + W * 0.073, by + W * 0.012, W * 0.006, W * 0.012);
  // Dynamic Island.
  ctx.fillStyle = '#000000';
  roundRect(ctx, W / 2 - W * 0.16, H * 0.018, W * 0.32, H * 0.05, H * 0.025);
  ctx.fill();
  ctx.fillStyle = '#1a1a26';
  ctx.beginPath();
  ctx.arc(W / 2 + W * 0.1, H * 0.043, H * 0.011, 0, Math.PI * 2);
  ctx.fill();
  // Home indicator.
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  roundRect(ctx, W / 2 - W * 0.18, H - H * 0.022, W * 0.36, H * 0.0065, H * 0.0033);
  ctx.fill();
  ctx.restore();
}

// Builds the device. Returns the group and the screen size to use for the screen plane.
export function buildIPhone(THREE, RoundedBoxGeometry, w, h) {
  const group = new THREE.Group();
  const titanium = new THREE.MeshStandardMaterial({ color: 0x4e4858, metalness: 0.95, roughness: 0.26 });
  group.add(new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.17, 8, w * 0.17), titanium));
  const glass = new THREE.Mesh(
    new RoundedBoxGeometry(w * 0.968, h * 0.984, 0.176, 8, w * 0.155),
    new THREE.MeshStandardMaterial({ color: 0x050407, metalness: 0.3, roughness: 0.12 }),
  );
  group.add(glass);
  const button = (x, y, len) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.035, len, 0.075, 3, 0.014), titanium);
    m.position.set(x, y, 0);
    group.add(m);
  };
  button(-w / 2 - 0.012, h * 0.3, h * 0.04); // action button
  button(-w / 2 - 0.012, h * 0.19, h * 0.075); // volume up
  button(-w / 2 - 0.012, h * 0.085, h * 0.075); // volume down
  button(w / 2 + 0.012, h * 0.16, h * 0.11); // side button
  return { group, screenW: w * 0.92, screenH: h * 0.955, frontZ: 0.09 };
}
