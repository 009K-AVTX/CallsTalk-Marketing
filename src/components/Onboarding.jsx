import { steps } from '../data.js';
import Integrations from './Integrations.jsx';

export default function Onboarding() {
  return (
    <section className="section section--white" id="how">
      <div className="container">
        <h2>Get started in four simple steps.</h2>
        <ol className="flow">
          {steps.map(({ title, text, link, href }, i) => (
            <li key={title} className="flow__step">
              <span className="flow__node" aria-hidden="true">{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <a href={href}>{link}</a>
            </li>
          ))}
        </ol>
        <Integrations />
      </div>
    </section>
  );
}
