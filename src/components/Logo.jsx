export default function Logo({ light = false }) {
  return (
    <a href="#" className={`logo${light ? ' logo--light' : ''}`}>
      <span className="logo__mark">A</span>Avortyx
    </a>
  );
}
