import ChatButton from './ChatButton.jsx';
import HeroScene from './HeroScene.jsx';

const tools = ['Advertising networks', 'CRM platforms', 'Web analytics', 'Contact centers', 'Team messaging'];

export default function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero__grid">
          <div className="hero__copy">
            <h1>Discover which marketing efforts drive real revenue.</h1>
            <p className="lead">
              CallsTalk links each phone call, form submission and chat conversation to the campaign, keyword and
              channel responsible, so you can eliminate wasted budget and invest in what performs.
            </p>
            <div className="actions">
              <ChatButton />
              <a href="#pricing" className="btn btn--quiet">See Plans</a>
            </div>
            <ul className="assurances">
              <li>Setup help from our specialists</li>
              <li>Ready in minutes</li>
            </ul>
          </div>
          <figure className="hero__film">
            <HeroScene />
          </figure>
        </div>
        <div className="works">
          <span>Works with your</span>
          <ul>{tools.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}
