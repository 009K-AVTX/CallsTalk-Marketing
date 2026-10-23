import ChatButton from './ChatButton.jsx';
import { useState } from 'react';
import Tabs from './Tabs.jsx';
import { pricing } from '../data.js';

const tabs = [
  { id: 'business', label: 'Business Plans' },
  { id: 'agency', label: 'Agency Plans' },
];

function Plan({ name, price, note, items, popular, sales }) {
  return (
    <div className={`plan${popular ? ' plan--hot' : ''}`}>
      <h3>{name}</h3>
      {popular && <span className="plan__flag">Recommended</span>}
      <div className="price">
        {price}
        <small>{sales ? 'Custom terms' : 'per month'}</small>
      </div>
      <p>{note}</p>
      <ul>
        {items.map(([label, value]) => (
          <li key={value}>{label && <span>{label}</span>} <b>{value}</b></li>
        ))}
      </ul>
      <ChatButton className={`btn ${popular ? 'btn--light' : 'btn--quiet'}`}>
        {sales ? 'Chat with us' : 'Request Access'}
      </ChatButton>
    </div>
  );
}

export default function Pricing() {
  const [active, setActive] = useState('business');

  return (
    <section className="section section--dark" id="pricing">
      <div className="container">
        <div className="section__head">
          <h2>Transparent pricing that grows with you.</h2>
          <Tabs tabs={tabs} active={active} onChange={setActive} />
        </div>
        <div className="plans">
          {pricing[active].map((plan) => <Plan key={plan.name} {...plan} />)}
        </div>
        <p className="fine">Indicative pricing only. Confirm final rates before launch.</p>
      </div>
    </section>
  );
}
