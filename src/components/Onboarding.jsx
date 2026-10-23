import { steps } from '../data.js';
import { INTEGRATION_GROUPS } from '../integrations.js';
import BrandLogo from './BrandLogo.jsx';

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
        <div className="integrations" id="integrations">
          <div className="integrations__head">
            <h3>Connects seamlessly with your existing tools.</h3>
            <p>Send every attributed call, form and chat to the ad platforms, CRMs, analytics and messaging tools your team already relies on.</p>
          </div>
          <div className="integrations__groups">
            {INTEGRATION_GROUPS.map((group) => (
              <div key={group.title} className="integrations__group">
                <h4>{group.title}</h4>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.name} className="integration"><BrandLogo item={item} />{item.name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
