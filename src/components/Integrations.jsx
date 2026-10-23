import { integrations } from '../data.js';

export default function Integrations() {
  return (
    <section className="section" id="integrations">
      <div className="container center">
        <h2>Plays well with your stack.</h2>
        <p className="lead">Send lead data to the ad platforms, CRMs and analytics tools you already use.</p>
        <div className="chips">
          {integrations.map((name) => <span key={name}>{name}</span>)}
        </div>
        <a href="#" className="link">Browse all integrations →</a>
      </div>
    </section>
  );
}
