import { useEffect, useRef, useState } from 'react';
import { avatarUrl, fetchProfile, loadSession, removeAvatar, uploadAvatar } from '../../src/lib/portal.js';
import Icon from './components/Icons.jsx';

const SIZE = 256; // stored photos are this many pixels square
const MAX_INPUT_MB = 15;

// ── the signed-in login's profile, shared by every part of the page ───────────

let cached = null;
let loading = null;
const listeners = new Set();
const publish = (p) => { cached = p; listeners.forEach((fn) => fn(p)); };

function reload() {
  if (!loadSession()?.access) return publish(null);
  loading = fetchProfile().then(publish, () => {}).finally(() => { loading = null; });
}

if (typeof window !== 'undefined') {
  window.addEventListener('callstalk:profile', reload);
  window.addEventListener('callstalk:session', () => { cached = null; reload(); });
}

export function useProfile() {
  const [profile, setProfile] = useState(cached);
  useEffect(() => {
    listeners.add(setProfile);
    if (!cached && !loading) reload();
    return () => listeners.delete(setProfile);
  }, []);
  return profile;
}

// ── the round photo, or the first letter of the name when there is none ──────

export function Avatar({ userId, version, name, size = 'md', className = '' }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (userId && version) avatarUrl(userId, version).then((url) => live && setSrc(url), () => {});
    return () => { live = false; };
  }, [userId, version]);
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();
  return (
    <span className={`p-avatar p-avatar--${size} ${className}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : initial}
    </span>
  );
}

// The signed-in login's own photo.
export function MyAvatar({ size, fallback, className }) {
  const me = useProfile();
  return <Avatar userId={me?.id} version={me?.avatar_version} name={fallback || me?.name || loadSession()?.email} size={size} className={className} />;
}

// ── choosing a photo ─────────────────────────────────────────────────────────

// Crops the middle square out of the picture and scales it to 256px, as WebP (JPEG where WebP is not supported).
function squarePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.type)) return reject(new Error('Choose a photo (JPG, PNG or WebP).'));
    if (file.size > MAX_INPUT_MB * 1024 * 1024) return reject(new Error(`Choose a photo under ${MAX_INPUT_MB} MB.`));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(url);
      const webp = canvas.toDataURL('image/webp', 0.86);
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That photo could not be opened. Try a JPG or PNG.'));
    };
    img.src = url;
  });
}

// Settings: add, change or remove your photo.
export function AvatarEditor() {
  const me = useProfile();
  const input = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | sending | error
  const [error, setError] = useState('');

  const run = async (action) => {
    setStatus('sending');
    setError('');
    try {
      await action();
      setStatus('idle');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  const pick = (e) => {
    const file = e.target.files?.[0];
    if (file) run(async () => uploadAvatar(await squarePhoto(file)));
  };

  return (
    <div className="p-avatar-edit">
      <MyAvatar size="xl" />
      <div>
        <p className="p-avatar-edit__title">Profile Photo</p>
        <p className="p-avatar-edit__hint">Shown on your account across the portal. JPG, PNG or WebP; we crop it to a square.</p>
        <div className="p-admin__actions">
          <label className={`btn btn--light btn--sm p-avatar-edit__pick${status === 'sending' ? ' is-busy' : ''}`}>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={status === 'sending'} />
            <Icon name="download" className="p-icon p-icon--up" />{status === 'sending' ? 'Saving…' : me?.avatar_version ? 'Change Photo' : 'Upload Photo'}
          </label>
          {me?.avatar_version && (
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => run(removeAvatar)} disabled={status === 'sending'}>Remove</button>
          )}
        </div>
        {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
