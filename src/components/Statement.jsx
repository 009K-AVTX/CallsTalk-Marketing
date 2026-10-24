import ReturnPath, { CHANNEL_COLORS } from './ReturnPath.jsx';

// Product facts drawn from the rest of the page.
// The number stays big; the unit sits beside it, smaller, so each figure keeps to one line.
const facts = [
  { value: '3', unit: 'Channels', label: 'Calls, forms and chats, tracked side by side' },
  { value: '1', unit: 'Journey', label: 'Every lead followed from first click to closed deal' },
  { value: '1', unit: 'Line of Code', label: 'All it takes to start tracking your website' },
  { value: '24/7', unit: 'Coverage', label: 'Every call captured and traced, day or night' },
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
              Most reports stop at the click. The conversations that close business rarely make it back to the
              campaign that started them.
            </h2>
            <p className="statement__answer">CallsTalk brings every one of them home.</p>
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
