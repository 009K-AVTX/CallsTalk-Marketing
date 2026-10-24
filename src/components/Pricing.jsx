import { useState } from 'react';
import ChatButton from './ChatButton.jsx';
import ContactLinks from './ContactLinks.jsx';
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
      {sales
        ? <ChatButton className="btn btn--quiet">Chat With Us</ChatButton>
        : <a href="/request-access" className={`btn ${popular ? 'btn--light' : 'btn--quiet'}`}>Request Access</a>}
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
