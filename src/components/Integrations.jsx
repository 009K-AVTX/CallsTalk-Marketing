import { integrations } from '../data.js';

export default function Integrations() {
  return (
    <section className="section section--surface" id="integrations">
      <div className="container split">
        <div>
          <h2>Connects seamlessly with your existing tools.</h2>
          <p className="lead">Share lead data with the advertising, CRM and analytics platforms your team already relies on.</p>
          <a href="#" className="link">Explore the full integration library</a>
        </div>
        <ul className="patch">
          {integrations.map((name) => (
            <li key={name}><span className="socket" aria-hidden="true" />{name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
