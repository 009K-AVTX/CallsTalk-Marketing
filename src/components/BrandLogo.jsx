// A brand icon drawn as a CSS mask, so it can sit in our muted grey and take its brand colour on hover.
export default function BrandLogo({ item, size = 'md' }) {
  const style = { '--brand': item.color };
  if (item.logo) style['--logo'] = `url(/logos/${item.logo}.svg)`;
  return (
    <span className={`brand-logo brand-logo--${size}${item.logo ? '' : ' brand-logo--mark'}`} style={style} aria-hidden="true">
      {item.logo ? <i /> : item.mark}
    </span>
  );
}
