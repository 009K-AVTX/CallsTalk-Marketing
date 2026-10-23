const bars = [40, 55, 48, 70, 62, 85, 78, 95];

const leads = [
  { type: 'Call', source: 'Paid Search · "same-day plumbing"', status: 'Sales-ready' },
  { type: 'Form', source: 'Organic Search · /plans', status: 'Proposal sent' },
  { type: 'Chat', source: 'Paid Social · Summer campaign', status: 'Awaiting reply' },
];

function DashboardMock() {
  return (
    <div className="mock">
      <div className="mock__bar"><i /><i /><i /></div>
      <div className="mock__body">
        <div className="mock__stats">
          <div><small>Total Leads</small><b>1,284</b></div>
          <div><small>Sales-Ready</small><b>612</b></div>
          <div><small>Attributed Revenue</small><b>$184k</b></div>
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
          <span className="eyebrow">Call and lead attribution for ambitious teams</span>
          <h1>Discover which marketing efforts drive real revenue.</h1>
          <p className="lead">
            CallsTalk links each phone call, form submission and chat conversation to the campaign, keyword and channel
            responsible, so you can eliminate wasted budget and invest in what performs.
          </p>
          <div className="hero__ctas">
            <a href="#trial" className="btn btn--primary">Begin Your Free 14-Day Trial</a>
            <a href="#demo" className="btn btn--ghost">Request a Live Demo</a>
          </div>
          <p className="fine">No payment details required · Ready in minutes</p>
        </div>
        <div className="hero__visual">
          <DashboardMock />
          <a href="#how" className="play">▶ See how it works</a>
        </div>
      </div>
    </section>
  );
}
