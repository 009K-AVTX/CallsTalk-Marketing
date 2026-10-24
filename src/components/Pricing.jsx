import ContactLinks from './ContactLinks.jsx';
import { PORTAL_LOGIN } from '../legal.js';

// Account figures (balances, bills, payments) live in the portal behind the log in, never here.
const STEPS = [
  ['Your Own Price', 'We agree a price per call with you. There are no plans or monthly tiers; every customer has their own rate.'],
  ['Pay Per Call', 'You pay only for the calls you receive, at the price agreed with you.'],
  ['Your Buyer Dashboard', 'Once you log in, your dashboard keeps your account up to date as your calls arrive.'],
  ['Pay Inside Your Login', 'Pay for your calls from your dashboard whenever you like, just like recharging a balance.'],
];

export default function Pricing() {
  return (
    <section className="section section--dark" id="pricing">
      <div className="container">
        <div className="section__head">
          <h2>Per-Call Pricing, Tailored to Your Business.</h2>
          <p className="lead">No Plans to Choose From. You Get Your Own Price per Call, Agreed with Our Team.</p>
        </div>

        <ol className="pricing__steps">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span aria-hidden="true">{i + 1}</span>
              <div><b>{title}</b><p>{text}</p></div>
            </li>
          ))}
        </ol>

        <div className="pricing__talk">
          <div>
            <h3>Want Your Price?</h3>
            <p>Request access and we will agree your price per call. Existing customers can log in to their Buyer Dashboard.</p>
          </div>
          <div className="actions">
            <a href="/request-access" className="btn btn--light">Request Access</a>
            <a href={PORTAL_LOGIN} className="btn btn--quiet">Log In</a>
          </div>
        </div>
        <div className="pricing__contact">
          <p>Questions About Your Price?</p>
          <ContactLinks />
        </div>
        <p className="fine">Prices in USD, before taxes.</p>
      </div>
    </section>
  );
}
