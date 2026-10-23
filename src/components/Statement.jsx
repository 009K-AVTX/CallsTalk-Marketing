import ReturnPath, { CHANNEL_COLORS } from './ReturnPath.jsx';

// Product facts drawn from the rest of the page.
const facts = [
  { value: '3', label: 'channels in one place: calls, forms and chats' },
  { value: '1 view', label: 'of every call, form and chat, from first click to revenue' },
  { value: '1 snippet', label: 'of tracking code, or use your tag manager' },
  { value: '24/7', label: 'every inquiry recorded the moment it arrives' },
];

const channels = [
  { name: 'Calls', text: 'Dynamic numbers reveal the ad, keyword and page behind every ring.' },
  { name: 'Forms', text: 'Each submission carries its full visit history, from first touch to send.' },
  { name: 'Chats', text: 'Conversations stay tied to the session and campaign that started them.' },
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
            <p className="statement__answer">CallsTalk closes that gap, across every way a customer reaches you.</p>
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
