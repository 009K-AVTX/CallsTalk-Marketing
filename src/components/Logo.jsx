export default function Logo({ light = false }) {
  return (
    <a href="#" className={`logo${light ? ' logo--light' : ''}`}>
      <span className="logo__mark">C</span>CallsTalk
    </a>
  );
}
