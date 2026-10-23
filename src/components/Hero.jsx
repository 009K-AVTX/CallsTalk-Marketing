import { useEffect, useRef, useState } from 'react';

function IntroVideo() {
  const video = useRef(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.current.pause();
      setPlaying(false);
    }
  }, []);

  const toggle = () => {
    if (playing) video.current.pause();
    else video.current.play();
    setPlaying(!playing);
  };

  return (
    <div className="intro">
      <video
        ref={video}
        autoPlay
        muted
        loop
        playsInline
        poster="/hero-poster.jpg"
        aria-label="CallsTalk features: call attribution, lead scoring, revenue reporting, form and chat tracking, conversion sync and automated reports"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>
      <button className={`intro__toggle${playing ? '' : ' is-paused'}`} onClick={toggle}
        aria-label={playing ? 'Pause intro video' : 'Play intro video'} />
    </div>
  );
}

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
              <a href="#trial" className="btn btn--light">Begin Your Free 14-Day Trial</a>
              <a href="#demo" className="btn btn--quiet">Request a Live Demo</a>
            </div>
            <ul className="assurances">
              <li>No payment details required</li>
              <li>Ready in minutes</li>
            </ul>
          </div>
          <figure className="hero__film">
            <IntroVideo />
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
