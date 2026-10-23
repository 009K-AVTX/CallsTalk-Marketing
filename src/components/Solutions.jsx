import { useState } from 'react';
import Tabs from './Tabs.jsx';
import SolutionIcon from './SolutionIcon.jsx';
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
        <ul className="index">
          {solutions[active].map(({ title, text }) => (
            <li key={title}>
              <a href="#">
                <SolutionIcon name={title} />
                <h3>{title}</h3>
                <p>{text}</p>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
