import ReturnPath, { CHANNEL_COLORS } from './ReturnPath.jsx';

// Product facts drawn from the rest of the page.
const facts = [
  { value: '3', label: 'ways customers reach you, tracked in one place' },
  { value: '1 thread', label: 'from first click to closed deal, for every lead' },
  { value: '1 snippet', label: 'is all your website needs' },
  { value: '24/7', label: 'logging, even when nobody picks up' },
];

const channels = [
  { name: 'Calls', text: 'Each ring arrives with its ad and keyword.' },
  { name: 'Forms', text: 'Each submission brings its visit history.' },
  { name: 'Chats', text: 'Each chat keeps its campaign attached.' },
];

export default function Statement() {
  return (
    <section className="section statement">
      <div className="container">
        <dl className="facts">
          {facts.map(({ value, label }) => (
            <div key={value}>
              <dt>{value}</dt>
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
