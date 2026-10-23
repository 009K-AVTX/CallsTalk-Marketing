import { useState } from 'react';
import ChatButton from './ChatButton.jsx';
import { BILLING } from '../data.js';

const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Estimator() {
  const [minutes, setMinutes] = useState(1000);
  const [numbers, setNumbers] = useState(3);
  const [recordShare, setRecordShare] = useState(50);

  const usage = minutes * BILLING.perMinute;
  const recording = minutes * (recordShare / 100) * BILLING.recording;
  const monthly = BILLING.portal + usage + recording;

  return (
    <div className="estimate">
      <h3>Estimate your month</h3>
      <label className="estimate__field">
        <span>Call minutes<output>{minutes.toLocaleString('en-US')}</output></span>
        <input type="range" min="0" max="10000" step="100" value={minutes} onChange={(e) => setMinutes(+e.target.value)} />
      </label>
      <label className="estimate__field">
        <span>Tracking numbers<output>{numbers}</output></span>
        <input type="range" min="1" max="50" value={numbers} onChange={(e) => setNumbers(+e.target.value)} />
      </label>
      <label className="estimate__field">
        <span>Calls recorded<output>{recordShare}%</output></span>
        <input type="range" min="0" max="100" step="10" value={recordShare} onChange={(e) => setRecordShare(+e.target.value)} />
      </label>

      <dl className="estimate__lines">
        <div><dt>Portal access</dt><dd>{money(BILLING.portal)}</dd></div>
        <div><dt>Call minutes</dt><dd>{money(usage)}</dd></div>
        <div><dt>Recording</dt><dd>{money(recording)}</dd></div>
      </dl>
      <div className="estimate__total" aria-live="polite">
        <span>Estimated monthly total</span>
        <strong>{money(monthly)}</strong>
      </div>
      <p className="estimate__once">Plus {money(numbers * BILLING.number)} once for {numbers} tracking {numbers === 1 ? 'number' : 'numbers'}.</p>
      <ul className="ratecard__included">
        {BILLING.included.map((b) => <li key={b}>{b}</li>)}
      </ul>
    </div>
  );
}

export default function Pricing() {
  return (
    <section className="section section--dark" id="pricing">
      <div className="container">
        <div className="section__head">
          <div>
            <h2>One account. Costs that follow your calls.</h2>
            <p className="lead">A flat monthly fee for the platform, then you pay only for the minutes you use. No tiers to outgrow and no seats to count.</p>
          </div>
        </div>

        <div className="rates">
          <div className="ratecard">
            <div className="ratecard__top">
              <span className="ratecard__tag">The Platform</span>
              <div className="ratecard__price"><strong>${BILLING.portal}</strong><span>/month</span></div>
              <p>Attribution, dashboards and reports in one place. Then pay as you go:</p>
            </div>
            <ul className="ratetiles">
              {BILLING.rates.map((r) => (
                <li key={r.name} className={r.free ? 'is-free' : undefined}>
                  <span>{r.name}</span>
                  <strong>{r.value}{r.unit && <em>{r.unit}</em>}</strong>
                  <small>{r.note}</small>
                </li>
              ))}
            </ul>
            <a href="/request-access" className="btn btn--light">Request Access</a>
          </div>
          <Estimator />
        </div>

        <div className="scale">
          <div>
            <h3>Running high call volume?</h3>
            <p>Agencies and large teams get lower per-minute rates, dedicated number pools and a named account manager.</p>
          </div>
          <ul>
            <li>Volume rates</li>
            <li>Dedicated number pools</li>
            <li>Uptime SLA</li>
            <li>Priority support</li>
          </ul>
          <ChatButton className="btn btn--quiet">Talk About Volume</ChatButton>
        </div>
        <p className="fine">No setup fees. The estimate is a guide; prices exclude taxes and carrier surcharges.</p>
      </div>
    </section>
  );
}
