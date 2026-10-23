import { useId } from 'react';

// The CallsTalk mark: a speech bubble holding rising bars, a conversation turned into results.
// public/favicon.svg draws the same shape.
export function LogoMark({ className = 'logo__mark' }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d6a3ff" />
          <stop offset="1" stopColor="#7f4bd0" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M9 3h14a7 7 0 0 1 7 7v8a7 7 0 0 1-7 7H12.5l-6.2 4.6A1 1 0 0 1 4.7 28.8L5.6 24.3A7 7 0 0 1 2 18v-8a7 7 0 0 1 7-7Z"
      />
      <rect x="9" y="14" width="3.6" height="6" rx="1.8" fill="#fff" opacity=".75" />
      <rect x="14.2" y="11" width="3.6" height="9" rx="1.8" fill="#fff" opacity=".88" />
      <rect x="19.4" y="8" width="3.6" height="12" rx="1.8" fill="#fff" />
    </svg>
  );
}

export default function Logo({ light = false }) {
  return (
    <a href="/" className={`logo${light ? ' logo--light' : ''}`} aria-label="CallsTalk home">
      <LogoMark />
      <span>Calls<b>Talk</b></span>
    </a>
  );
}
