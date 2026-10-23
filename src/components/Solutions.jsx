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
    <section className="section" id="solutions">
      <div className="container">
        <div className="section__head">
          <h2>Designed around the way you operate.</h2>
          <Tabs tabs={tabs} active={active} onChange={setActive} />
        </div>
        <div className="tiles">
          {solutions[active].map(({ title, text }) => (
            <a key={title} className="tile" href="#">
              <h3>{title}</h3>
              <p>{text}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
