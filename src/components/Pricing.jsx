import ChatButton from './ChatButton.jsx';
import { useState } from 'react';
import Tabs from './Tabs.jsx';
import { PLANS, RATES, RATE_COLUMNS } from '../data.js';

const tabs = [
  { id: 'plans', label: 'Plans' },
  { id: 'rates', label: 'Full rate sheet' },
];

function Plan({ name, price, unit, note, popular, sales, number, local, tollFree, transcription }) {
  return (
    <div className={`plan${popular ? ' plan--hot' : ''}`}>
      <h3>{name}</h3>
      {popular && <span className="plan__flag">Recommended</span>}
      <div className="price">
        {price}
        <small>{unit}</small>
      </div>
      <p>{note}</p>
      {!sales && (
        <ul>
          <li><span>Tracking number</span> <b>{number}<em>/mo</em></b></li>
          <li><span>Local calls</span> <b>{local}<em>/min</em></b></li>
          <li><span>Toll-free calls</span> <b>{tollFree}<em>/min</em></b></li>
          <li><span>AI transcription</span> <b>{transcription}<em>/min</em></b></li>
        </ul>
      )}
      {sales && (
        <ul>
          <li><b>Dedicated number pools</b></li>
          <li><b>Custom integrations</b></li>
          <li><b>24/7 dedicated support</b></li>
        </ul>
      )}
      <ChatButton className={`btn ${popular ? 'btn--light' : 'btn--quiet'}`}>
        {sales ? 'Chat with us' : 'Request Access'}
      </ChatButton>
    </div>
  );
}

function RateSheet() {
  return (
    <div className="rates" role="region" aria-label="Rates by monthly commit" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Monthly commit</th>
            {RATE_COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {RATES.map((r) => (
            <tr key={r.name}>
              <th scope="row">{r.name}<small>{r.unit}</small></th>
              {r.values.map((v, i) => <td key={i}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Pricing() {
  const [active, setActive] = useState('plans');

  return (
    <section className="section section--dark" id="pricing">
      <div className="container">
        <div className="section__head">
          <div>
            <h2>Pay for the calls you track.</h2>
            <p className="lead">Usage-based rates that drop as you commit more each month. No onboarding fees, every charge itemized.</p>
          </div>
          <Tabs tabs={tabs} active={active} onChange={setActive} />
        </div>
        {active === 'plans' ? (
          <div className="plans">
            {PLANS.map((plan) => <Plan key={plan.name} {...plan} />)}
          </div>
        ) : (
          <RateSheet />
        )}
        <p className="fine">Your monthly commit is the least you pay each month and is used up by your usage. Calls bill per minute, rounded up. Rates are before taxes and fees.</p>
      </div>
    </section>
  );
}
