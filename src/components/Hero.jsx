const bars = [40, 55, 48, 70, 62, 85, 78, 95];

const leads = [
  { type: 'Call', source: 'Paid Search · "emergency plumber"', status: 'Qualified' },
  { type: 'Form', source: 'Organic · /pricing', status: 'Quote sent' },
  { type: 'Chat', source: 'Social · Spring promo', status: 'New' },
];

function DashboardMock() {
  return (
    <div className="mock">
      <div className="mock__bar"><i /><i /><i /></div>
      <div className="mock__body">
        <div className="mock__stats">
          <div><small>Leads</small><b>1,284</b></div>
          <div><small>Qualified</small><b>612</b></div>
          <div><small>Revenue</small><b>$184k</b></div>
        </div>
        <div className="mock__chart">
          {bars.map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}
        </div>
        <ul className="mock__rows">
          {leads.map((l) => (
            <li key={l.type}><b>{l.type}</b> {l.source} <em>{l.status}</em></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__copy">
          <span className="eyebrow">Lead attribution for growing teams</span>
          <h1>See exactly which marketing turns into revenue.</h1>
          <p className="lead">
            Avortyx connects every phone call, form fill and chat to the campaign, keyword and channel behind it,
            so you can cut wasted spend and double down on what works.
          </p>
          <div className="hero__ctas">
            <a href="#trial" className="btn btn--primary">Start Your 14-Day Free Trial</a>
            <a href="#demo" className="btn btn--ghost">Get a Live Demo</a>
          </div>
          <p className="fine">No credit card required · Set up in minutes</p>
        </div>
        <div className="hero__visual">
          <DashboardMock />
          <a href="#how" className="play">▶ How it works</a>
        </div>
      </div>
    </section>
  );
}
