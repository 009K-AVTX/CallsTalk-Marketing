// Two-tone line icons for the use cases. Strokes use currentColor (lilac); the soft fills and
// highlights use the --tone variables so every icon shares one look.
const FILL = 'var(--icon-fill)';
const HI = 'var(--icon-hi)';

const ICONS = {
  Agencies: (
    <>
      <rect x="9" y="5" width="17" height="13" rx="2.5" opacity=".45" />
      <rect x="6" y="9" width="17" height="13" rx="2.5" fill={FILL} />
      <path d="M10 18.5v-3M14 18.5v-5.5M18 18.5v-7.5" stroke={HI} />
      <path d="M8 27h15" opacity=".6" />
    </>
  ),
  'Marketing Teams': (
    <>
      <path d="M6 13.5v5a1.5 1.5 0 0 0 1.5 1.5H10l9 5V7l-9 5H7.5A1.5 1.5 0 0 0 6 13.5Z" fill={FILL} />
      <path d="M10 20l1.5 6h3L13 20.6" />
      <path d="M23 12.5a5 5 0 0 1 0 7M26 9.5a9 9 0 0 1 0 13" stroke={HI} />
    </>
  ),
  'Owners & Operators': (
    <>
      <path d="M5 12l2-6h18l2 6" />
      <path d="M5 12a3.5 3.5 0 0 0 7 0 3.5 3.5 0 0 0 7 0 3.5 3.5 0 0 0 7 0" fill={FILL} />
      <path d="M7 16v10h18V16" />
      <path d="M13.5 26v-6h5v6" stroke={HI} />
    </>
  ),
  'Sales Leaders': (
    <>
      <circle cx="15" cy="17" r="10" />
      <circle cx="15" cy="17" r="6" fill={FILL} />
      <circle cx="15" cy="17" r="2" fill={HI} stroke="none" />
      <path d="M15 17l11-11M21.5 6H26v4.5" stroke={HI} />
    </>
  ),
  'Home & Field Services': (
    <>
      <path d="M4.5 15L16 5.5 27.5 15" />
      <path d="M8 13v13h16V13" fill={FILL} />
      <path d="M19.2 15.2a3.2 3.2 0 0 0-4.3 4L12 22.1l1.8 1.8 2.9-2.9a3.2 3.2 0 0 0 4-4.3l-1.9 1.9-1.5-1.5 1.9-1.9Z" stroke={HI} />
    </>
  ),
  'Law Firms': (
    <>
      <path d="M16 5v21M10 26h12M7 9h18" />
      <circle cx="16" cy="5.5" r="1.2" fill={HI} stroke="none" />
      <path d="M7 9l-3.5 8a3.5 3.5 0 0 0 7 0L7 9Z" fill={FILL} />
      <path d="M25 9l-3.5 8a3.5 3.5 0 0 0 7 0L25 9Z" fill={FILL} />
    </>
  ),
  'Healthcare Providers': (
    <>
      <path d="M16 26.5S4.5 19.6 4.5 11.8A5.8 5.8 0 0 1 16 9.4a5.8 5.8 0 0 1 11.5 2.4C27.5 19.6 16 26.5 16 26.5Z" fill={FILL} />
      <path d="M7 16h4.5l2-4 3 7 2-3H25" stroke={HI} />
    </>
  ),
  'Auto Dealerships': (
    <>
      <path d="M4 20v-3.5l3-1.5 3.5-5h10l4 5 3.5 1.2V20h-2.5" fill={FILL} />
      <path d="M10 20h9" />
      <circle cx="8" cy="20.5" r="2.5" stroke={HI} />
      <circle cx="21.5" cy="20.5" r="2.5" stroke={HI} />
      <path d="M12 10.5v4.5M8.5 15h17" opacity=".55" />
    </>
  ),
  'Property & Real Estate': (
    <>
      <path d="M5 27V11l8-4v20M13 27h13V13l-6-3" />
      <path d="M8.5 13v.5M8.5 17v.5M8.5 21v.5M17 17v.5M21.5 17v.5M17 21v.5M21.5 21v.5" />
      <path d="M22 5.5a3.5 3.5 0 0 1 3.5 3.5c0 2.6-3.5 5.5-3.5 5.5s-3.5-2.9-3.5-5.5A3.5 3.5 0 0 1 22 5.5Z" fill={FILL} stroke={HI} />
      <path d="M3 27h26" opacity=".6" />
    </>
  ),
  'Higher Education': (
    <>
      <path d="M3.5 12.5L16 6.5l12.5 6-12.5 6-12.5-6Z" fill={FILL} />
      <path d="M9 15.5v5.5c0 1.8 3.1 3.5 7 3.5s7-1.7 7-3.5v-5.5" />
      <path d="M28.5 12.5v7" stroke={HI} />
      <circle cx="28.5" cy="21" r="1.3" fill={HI} stroke="none" />
    </>
  ),
  'Financial Services': (
    <>
      <ellipse cx="12" cy="21" rx="7" ry="2.5" fill={FILL} />
      <path d="M5 21v3.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V21" />
      <ellipse cx="12" cy="15" rx="7" ry="2.5" fill={FILL} />
      <path d="M5 15v3.5M19 15v3.5" />
      <path d="M21 13l4-4 2.5 2.5M24 6h4v4" stroke={HI} />
    </>
  ),
  'Online Retail': (
    <>
      <path d="M7 10h18l-1.5 16.5h-15L7 10Z" fill={FILL} />
      <path d="M11.5 13V9a4.5 4.5 0 0 1 9 0v4" />
      <path d="M12 19l3 3 5.5-5.5" stroke={HI} />
    </>
  ),
};

export default function SolutionIcon({ name }) {
  return (
    <span className="solution-icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </svg>
    </span>
  );
}
