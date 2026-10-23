import { Fragment, useState } from 'react';
import ChatButton from './ChatButton.jsx';
import ContactLinks from './ContactLinks.jsx';
import { BILLING } from '../data.js';

const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Slider({ label, value, display, onChange, ...range }) {
  return (
    <label className="calc__field">
      <span>{label}<output>{display ?? value}</output></span>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ '--fill': `${((value - range.min) / (range.max - range.min)) * 100}%` }}
        {...range}
      />
    </label>
  );
}

function Calculator() {
  const [minutes, setMinutes] = useState(1000);
  const [numbers, setNumbers] = useState(3);
  const [recordShare, setRecordShare] = useState(50);

  const usage = minutes * BILLING.perMinute;
  const recording = minutes * (recordShare / 100) * BILLING.recording;
  const monthly = BILLING.portal + usage + recording;

  return (
    <div className="calc">
      <div className="calc__head">
        <h3>What would you pay?</h3>
        <div className="calc__total" aria-live="polite">
          <strong>{money(monthly)}</strong>
          <span>estimated per month</span>
        </div>
      </div>
      <Slider label="Call minutes per month" value={minutes} display={minutes.toLocaleString('en-US')} onChange={setMinutes} min={0} max={10000} step={100} />
      <Slider label="Tracking numbers" value={numbers} onChange={setNumbers} min={1} max={50} step={1} />
      <Slider label="Calls recorded" value={recordShare} display={`${recordShare}%`} onChange={setRecordShare} min={0} max={100} step={10} />
      <p className="calc__breakdown">
        {money(BILLING.portal)} platform + {money(usage)} minutes + {money(recording)} recording.
        Plus {money(numbers * BILLING.number)} once for {numbers} {numbers === 1 ? 'number' : 'numbers'}.
      </p>
    </div>
  );
}

export default function Pricing() {
  return (
    <section className="section section--dark" id="pricing">
      <div className="container">
        <div className="section__head">
          <div>
            <h2>Your bill, built from what you use.</h2>
            <p className="lead">One flat platform fee, then simple usage rates. No tiers, no seat counts and nothing locked behind an upgrade.</p>
          </div>
        </div>

        <div className="formula">
          {BILLING.terms.map((t, i) => (
            <Fragment key={t.name}>
              {i > 0 && <span className="formula__op" aria-hidden="true" />}
              <div className={`formula__term${i === 0 ? ' is-base' : ''}`}>
                <span>{t.name}</span>
                <strong>{t.value}</strong>
                <em>{t.unit}</em>
                <small>{t.note}</small>
              </div>
            </Fragment>
          ))}
        </div>
        <ul className="formula__extras">
          {BILLING.extras.map((x) => <li key={x}>{x}</li>)}
        </ul>

        <div className="pricing__lower">
          <Calculator />
          <aside className="pricing__talk">
            <h3>Talk to us about pricing</h3>
            <p>Running high call volume or managing several clients? Ask about volume rates, dedicated number pools and a named account manager.</p>
            <ContactLinks />
            <div className="pricing__actions">
              <a href="/request-access" className="btn btn--light">Request Access</a>
              <ChatButton className="btn btn--quiet" />
            </div>
          </aside>
        </div>
        <p className="fine">Estimates are a guide. Prices exclude taxes and carrier surcharges.</p>
      </div>
    </section>
  );
}
