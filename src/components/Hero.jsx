import ChatButton from './ChatButton.jsx';
import HeroScene from './HeroScene.jsx';
import BrandLogo from './BrandLogo.jsx';
import { FEATURED } from '../integrations.js';

export default function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <h1 className="hero__title">Discover which marketing efforts drive real revenue.</h1>
        <div className="hero__grid">
          <div className="hero__copy">
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
          <p>Works with the tools your team already uses</p>
          <ul>
            {FEATURED.map((item) => (
              <li key={item.name}><BrandLogo item={item} size="sm" />{item.name}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
