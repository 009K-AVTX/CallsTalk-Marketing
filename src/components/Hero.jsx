const sources = [
  { label: 'Paid search', y: 70 },
  { label: 'Organic search', y: 190 },
  { label: 'Paid social', y: 310 },
];

const outcomes = [
  { label: 'Job booked', value: '$420', y: 70 },
  { label: 'Proposal sent', value: '$1,800', y: 190 },
  { label: 'Sales-ready', value: '$960', y: 310 },
];

const HUB = { x: 300, y: 190 };

function Switchboard() {
  return (
    <svg className="board" viewBox="0 0 600 380" role="img"
      aria-label="Calls from paid search, organic search and paid social routed through CallsTalk to the revenue they produced">
      {sources.map((s, i) => {
        const d = `M158 ${s.y} C 225 ${s.y}, 225 ${HUB.y}, ${HUB.x - 34} ${HUB.y}`;
        return (
          <g key={s.label}>
            <path className="cable" d={d} />
            <path className="pulse" d={d} pathLength="100" style={{ animationDelay: `${i * 0.9}s` }} />
            <rect className="jack" x="8" y={s.y - 19} width="150" height="38" rx="19" />
            <circle className="lamp" cx="30" cy={s.y} r="5" />
            <text x="44" y={s.y + 5}>{s.label}</text>
          </g>
        );
      })}
      {outcomes.map((o, i) => {
        const d = `M${HUB.x + 34} ${HUB.y} C 365 ${HUB.y}, 365 ${o.y}, 420 ${o.y}`;
        return (
          <g key={o.label}>
            <path className="cable" d={d} />
            <path className="pulse pulse--out" d={d} pathLength="100" style={{ animationDelay: `${i * 0.9 + 0.9}s` }} />
            <rect className="jack jack--out" x="420" y={o.y - 19} width="172" height="38" rx="19" />
            <text x="436" y={o.y + 5}>{o.label}</text>
            <text className="board__value" x="578" y={o.y + 5} textAnchor="end">{o.value}</text>
          </g>
        );
      })}
      <circle className="hub" cx={HUB.x} cy={HUB.y} r="34" />
      <circle className="hub__ring" cx={HUB.x} cy={HUB.y} r="16" />
      <circle className="lamp" cx={HUB.x} cy={HUB.y} r="6" />
    </svg>
  );
}

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__copy">
          <h1>Discover which marketing efforts drive real revenue.</h1>
          <p className="lead">
            CallsTalk links each phone call, form submission and chat conversation to the campaign, keyword and channel
            responsible, so you can eliminate wasted budget and invest in what performs.
          </p>
          <div className="hero__ctas">
            <a href="#trial" className="btn btn--lamp">Begin Your Free 14-Day Trial</a>
            <a href="#demo" className="btn btn--line">Request a Live Demo</a>
          </div>
          <ul className="assurances">
            <li>No payment details required</li>
            <li>Ready in minutes</li>
          </ul>
        </div>
        <figure className="hero__visual">
          <Switchboard />
          <figcaption>Every inquiry, traced from first click to closed revenue. <a href="#how">See how it works</a></figcaption>
        </figure>
      </div>
    </section>
  );
}
