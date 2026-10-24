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
            <p className="hero__eyebrow"><span />Every Conversation, Traced to Its Campaign</p>
            <h1 className="hero__title">See Exactly What Your Marketing Earns.</h1>
            <p className="lead">CallsTalk Follows Every Call, Form and Chat Back to the Ad That Started It, so Your Budget Goes Where Deals Close.</p>
            <div className="actions">
              <ChatButton />
              <a href="#pricing" className="btn btn--quiet">See Pricing</a>
            </div>
            <ul className="assurances">
              <li>A Real Person Sets You Up</li>
              <li>Live the Same Day You Add One Snippet</li>
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
