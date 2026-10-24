import ReturnPath, { CHANNEL_COLORS } from './ReturnPath.jsx';

// Product facts drawn from the rest of the page.
// The number stays big; the unit sits beside it, smaller, so each figure keeps to one line.
const facts = [
  { value: '3', unit: 'Channels', label: 'Calls, Forms and Chats, Tracked Side by Side' },
  { value: '1', unit: 'Journey', label: 'Every Lead Followed from First Click to Closed Deal' },
  { value: '1', unit: 'Line of Code', label: 'All It Takes to Start Tracking Your Website' },
  { value: '24/7', unit: 'Coverage', label: 'Every Call Captured and Traced, Day or Night' },
];

const channels = [
  { name: 'Calls', text: 'Each ring arrives with its ad and keyword.' },
  { name: 'Forms', text: 'Each submission arrives with its visit history.' },
  { name: 'Chats', text: 'Each chat keeps its campaign attached.' },
];

export default function Statement() {
  return (
    <section className="section statement">
      <div className="container">
        <dl className="facts">
          {facts.map(({ value, unit, label }) => (
            <div key={unit}>
              <dt>{value}<span>{unit}</span></dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
        <div className="statement__inner">
          <div>
            <h2 className="statement__text">
              Most Reports Stop at the Click. The Conversations That Close Business Rarely Make It Back to the
              Campaign That Started Them.
            </h2>
            <p className="statement__answer">CallsTalk Brings Every One of Them Home.</p>
          </div>
          <ReturnPath />
        </div>
        <div className="channels">
          {channels.map(({ name, text }, i) => (
            <div key={name}>
              <h3><span className="channels__dot" style={{ background: CHANNEL_COLORS[i] }} aria-hidden="true" />{name}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
