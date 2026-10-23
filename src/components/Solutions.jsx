import { useState } from 'react';
import Tabs from './Tabs.jsx';
import { solutions } from '../data.js';

const tabs = [
  { id: 'role', label: 'By Team' },
  { id: 'industry', label: 'By Sector' },
];

export default function Solutions() {
  const [active, setActive] = useState('role');

  return (
    <section className="section section--alt" id="solutions">
      <div className="container">
        <div className="center">
          <h2>Designed around the way you operate.</h2>
          <Tabs tabs={tabs} active={active} onChange={setActive} />
        </div>
        <div className="grid grid--4">
          {solutions[active].map(({ icon, title, text }) => (
            <a key={title} className="card tile" href="#">
              <span>{icon}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <em>Explore →</em>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
