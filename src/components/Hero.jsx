import ChatButton from './ChatButton.jsx';
import HeroScene from './HeroScene.jsx';
import BrandLogo from './BrandLogo.jsx';
import { FEATURED } from '../integrations.js';

export default function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero__grid">
          <div className="hero__copy">
            <p className="hero__eyebrow"><span />Every conversation, traced to its campaign</p>
            <h1 className="hero__title">Know which campaign made the phone ring.</h1>
            <p className="lead">CallsTalk follows every call, form and chat back to the ad that started it, so your budget goes where deals close.</p>
            <div className="actions">
              <ChatButton />
              <a href="#pricing" className="btn btn--quiet">See Plans</a>
            </div>
            <ul className="assurances">
              <li>A real person sets you up</li>
              <li>Live the same day you add one snippet</li>
            </ul>
          </div>
          <figure className="hero__film">
            <HeroScene />
          </figure>
        </div>
        <div className="works">
          <p>Works with the tools you already use</p>
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
