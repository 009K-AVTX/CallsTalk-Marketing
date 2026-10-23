import { useState } from 'react';
import Tabs from './Tabs.jsx';
import { pricing } from '../data.js';

const tabs = [
  { id: 'business', label: 'Business Plans' },
  { id: 'agency', label: 'Agency Plans' },
];

function Plan({ name, price, note, items, popular, sales }) {
  return (
    <div className={`card plan${popular ? ' plan--hot' : ''}`}>
      {popular && <span className="badge">Recommended</span>}
      <h3>{name}</h3>
      <div className="price">
        {price}
        {!sales && <small>/mo</small>}
      </div>
      <p>{note}</p>
      <a href={sales ? '#demo' : '#trial'} className={`btn ${popular ? 'btn--primary' : 'btn--ghost'}`}>
        {sales ? 'Contact Sales' : 'Try It Free'}
      </a>
      <ul>
        {items.map(([label, value]) => (
          <li key={value}>{label && <b>{label}:</b>} {value}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Pricing() {
  const [active, setActive] = useState('business');

  return (
    <section className="section" id="pricing">
      <div className="container">
        <div className="center">
          <h2>Transparent pricing that grows with you.</h2>
          <Tabs tabs={tabs} active={active} onChange={setActive} />
        </div>
        <div className="grid grid--4 pricing">
          {pricing[active].map((plan) => <Plan key={plan.name} {...plan} />)}
        </div>
        <p className="fine center">Indicative pricing only. Confirm final rates before launch.</p>
      </div>
    </section>
  );
}
