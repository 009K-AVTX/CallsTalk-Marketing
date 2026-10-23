import { integrations, steps } from '../data.js';

export default function Onboarding() {
  return (
    <section className="section section--white" id="how">
      <div className="container">
        <h2>Get started in four simple steps.</h2>
        <ol className="steps">
          {steps.map(({ title, text, link }, i) => (
            <li key={title}>
              <span className="steps__num">{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <a href="#">{link}</a>
            </li>
          ))}
        </ol>
        <div className="connect" id="integrations">
          <div>
            <h3>Connects seamlessly with your existing tools.</h3>
            <p>Share lead data with the advertising, CRM and analytics platforms your team already relies on.</p>
            <a href="#" className="link">Explore the full integration library</a>
          </div>
          <ul className="connect__list">
            {integrations.map((name) => <li key={name}>{name}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
