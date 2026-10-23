import ChatButton from './ChatButton.jsx';
import { BILLING } from '../data.js';

export default function Pricing() {
  return (
    <section className="section section--dark" id="pricing">
      <div className="container">
        <div className="section__head">
          <div>
            <h2>Pay for the calls you track.</h2>
            <p className="lead">One simple account. A monthly portal fee, then pay only for the minutes and calls you use.</p>
          </div>
        </div>

        <div className="billing">
          <div className="billing__main">
            <span className="plan__flag">Standard account</span>
            <div className="billing__headline">
              <div>
                <div className="price">{BILLING.portalFee}<small>portal access every 30 days</small></div>
              </div>
              <span className="billing__plus" aria-hidden="true">+</span>
              <div>
                <div className="price">{BILLING.perMinute}<small>per call minute</small></div>
              </div>
            </div>
            <ul className="billing__fees">
              {BILLING.fees.map((f) => (
                <li key={f.name}>
                  <span><b>{f.name}</b><small>{f.note}</small></span>
                  <strong>{f.value}<em>{f.unit}</em></strong>
                </li>
              ))}
            </ul>
            <ul className="billing__balance">
              {BILLING.balance.map((b) => <li key={b}>{b}</li>)}
            </ul>
            <ChatButton className="btn btn--light">Request Access</ChatButton>
          </div>

          <div className="billing__enterprise">
            <h3>Enterprise</h3>
            <div className="price">Custom<small>rates for high volume</small></div>
            <p>Negotiated per-minute rates, dedicated number pools and a dedicated account manager.</p>
            <ul>
              <li>Volume per-minute pricing</li>
              <li>Dedicated number pools</li>
              <li>99.99% routing uptime SLA</li>
              <li>24/7 dedicated support</li>
            </ul>
            <ChatButton className="btn btn--quiet">Chat with us</ChatButton>
          </div>
        </div>
        <p className="fine">No onboarding fees. Rates shown are standard account defaults, before taxes and fees.</p>
      </div>
    </section>
  );
}
