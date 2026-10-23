import { integrations } from '../data.js';

export default function Integrations() {
  return (
    <section className="section" id="integrations">
      <div className="container center">
        <h2>Connects seamlessly with your existing tools.</h2>
        <p className="lead">Share lead data with the advertising, CRM and analytics platforms your team already relies on.</p>
        <div className="chips">
          {integrations.map((name) => <span key={name}>{name}</span>)}
        </div>
        <a href="#" className="link">Explore the full integration library →</a>
      </div>
    </section>
  );
}
