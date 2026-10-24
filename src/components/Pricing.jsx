import ChatButton from './ChatButton.jsx';
import ContactLinks from './ContactLinks.jsx';
import { PLANS, PLAN_NOTES } from '../data.js';

export default function Pricing() {
  return (
    <section className="section section--dark" id="pricing">
      <div className="container">
        <div className="section__head">
          <div>
            <h2>Plans that grow with your marketing.</h2>
            <p className="lead">Every plan traces calls, forms and chats back to the campaign behind them. Pick the reporting depth your team needs.</p>
          </div>
        </div>

        <div className="tiers">
          {PLANS.map((p) => (
            <article key={p.name} className={`tier${p.featured ? ' is-featured' : ''}`}>
              {p.featured && <span className="tier__badge">Most Popular</span>}
              <h3>{p.name}</h3>
              <p className="tier__fit">{p.fit}</p>
              <div className="tier__price">
                <strong>{p.price}</strong>
                <span>{p.period}</span>
              </div>
              {p.cta === 'Talk to Us'
                ? <ChatButton className="btn btn--quiet">{p.cta}</ChatButton>
                : <a href="/request-access" className={`btn ${p.featured ? 'btn--light' : 'btn--quiet'}`}>{p.cta}</a>}
              <ul>
                {p.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </article>
          ))}
        </div>
        <ul className="tiers__notes">
          {PLAN_NOTES.map((n) => <li key={n}>{n}</li>)}
        </ul>

        <div className="pricing__talk">
          <div>
            <h3>Questions about a plan?</h3>
            <p>Tell us how your team markets and we will point you to the right plan.</p>
          </div>
          <ContactLinks />
        </div>
        <p className="fine">Prices in USD, billed monthly, before taxes.</p>
      </div>
    </section>
  );
}
