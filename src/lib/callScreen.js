// The call screen shared by the hero and the return-path phone, plus the canvas
// helpers both scenes draw with. Coordinates assume a screen 400 units wide.
import { clipScreen, paintIPhoneChrome } from './iphone.js';

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function text(ctx, str, x, y, font, color, align = 'left') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
}

export function avatar(ctx, x, y, r, initials) {
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, '#e8c9ff');
  g.addColorStop(1, '#a06ee0');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, initials, x, y + r * 0.36, `600 ${Math.round(r * 0.95)}px Poppins, sans-serif`, '#1a1022', 'center');
}

export function check(ctx, x, y, r, color = '#d6a3ff') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#160f1f';
  ctx.lineWidth = r * 0.22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.42, y + r * 0.02);
  ctx.lineTo(x - r * 0.1, y + r * 0.34);
  ctx.lineTo(x + r * 0.45, y - r * 0.3);
  ctx.stroke();
}

// A telephone handset: a curved grip with an earpiece and mouthpiece at its ends.
export function handset(ctx, x, y, s, color, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle - Math.PI * 0.25);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.26;
  ctx.beginPath();
  ctx.arc(s * 0.32, 0, s * 0.62, Math.PI * 0.68, Math.PI * 1.32);
  ctx.stroke();
  [Math.PI * 0.68, Math.PI * 1.32].forEach((a) => {
    const px = s * 0.32 + Math.cos(a) * s * 0.62;
    const py = Math.sin(a) * s * 0.62;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a + Math.PI / 2);
    roundRect(ctx, -s * 0.26, -s * 0.13, s * 0.52, s * 0.26, s * 0.12);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

export function phoneButton(ctx, x, y, r, fill, hangUp) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  handset(ctx, x, y, r * 0.62, '#ffffff', hangUp ? Math.PI * 0.75 : 0);
}

// Label on the left, value on the right, hairline under.
export function row(ctx, x, y, w, label, value, valueColor = '#ffffff') {
  text(ctx, label, x, y, '400 18px Geist, sans-serif', '#a59cb0');
  text(ctx, value, x + w, y, '600 19px Geist, sans-serif', valueColor, 'right');
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.fillRect(x, y + 18, w, 1.5);
}

// phase: 'ring' | 'live' | 'done'; secs: call length shown while live.
export function paintCallScreen(ctx, W, H, phase, secs, doneLabel) {
  clipScreen(ctx, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#221b2a');
  bg.addColorStop(0.55, '#110e15');
  bg.addColorStop(1, '#09070b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 250, 10, W / 2, 250, 230);
  glow.addColorStop(0, phase === 'done' ? 'rgba(214,163,255,.42)' : 'rgba(199,146,247,.3)');
  glow.addColorStop(1, 'rgba(214,163,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const P = 34;
  if (phase === 'ring') {
    text(ctx, 'Incoming call · CallsTalk', W / 2, 128, '500 21px Geist, sans-serif', '#c9b8dc', 'center');
    avatar(ctx, W / 2, 238, 62, 'JM');
    text(ctx, 'Jordan Miles', W / 2, 352, '600 34px Poppins, sans-serif', '#ffffff', 'center');
    text(ctx, '(555) 014-2290 · Austin, TX', W / 2, 392, '400 22px Geist, sans-serif', '#c9c1d3', 'center');
  } else if (phase === 'live') {
    text(ctx, 'Connected', W / 2, 128, '500 21px Geist, sans-serif', '#c9b8dc', 'center');
    avatar(ctx, W / 2, 222, 46, 'JM');
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    text(ctx, `${mm}:${ss}`, W / 2, 338, '600 52px Poppins, sans-serif', '#ffffff', 'center');
    // Voice waveform.
    for (let k = 0; k < 23; k++) {
      const h = 8 + Math.abs(Math.sin(k * 1.7 + secs * 0.9)) * 44 * (1 - Math.abs(k - 11) / 14);
      roundRect(ctx, W / 2 - 132 + k * 12, 392 - h / 2, 6, h, 3);
      ctx.fillStyle = k % 4 === 0 ? '#ffffff' : '#d6a3ff';
      ctx.fill();
    }
  } else {
    check(ctx, W / 2, 222, 48);
    text(ctx, 'Job booked', W / 2, 322, '600 32px Poppins, sans-serif', '#ffffff', 'center');
    text(ctx, '$420', W / 2, 386, '600 50px Poppins, sans-serif', '#d6a3ff', 'center');
  }
  // Attribution panel.
  const y0 = 450;
  roundRect(ctx, P, y0, W - P * 2, 222, 26);
  ctx.fillStyle = 'rgba(255,255,255,.045)';
  ctx.fill();
  ctx.strokeStyle = phase === 'ring' ? '#302a36' : 'rgba(214,163,255,.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const known = phase !== 'ring';
  text(ctx, known ? 'Traced to' : 'Tracing source...', P + 24, y0 + 42, '500 20px Geist, sans-serif', known ? '#d6a3ff' : '#a59cb0');
  const iw = W - P * 2 - 48;
  row(ctx, P + 24, y0 + 90, iw, 'Source', known ? 'Paid search' : '—');
  row(ctx, P + 24, y0 + 140, iw, 'Keyword', known ? 'same-day plumbing' : '—');
  row(ctx, P + 24, y0 + 190, iw, 'Campaign', known ? 'Plumbing · Austin' : '—');
  if (phase === 'ring') {
    phoneButton(ctx, W / 2 - 92, H - 118, 40, '#e5484d', true);
    phoneButton(ctx, W / 2 + 92, H - 118, 40, '#2fbf71', false);
  } else {
    roundRect(ctx, P, H - 152, W - P * 2, 66, 33);
    ctx.fillStyle = phase === 'done' ? '#d6a3ff' : 'rgba(229,72,77,.18)';
    ctx.fill();
    text(ctx, phase === 'done' ? doneLabel : '● Recording', W / 2, H - 110, '600 22px Geist, sans-serif', phase === 'done' ? '#160f1f' : '#ff8a8e', 'center');
  }
  paintIPhoneChrome(ctx, W, H);
}
