import ChatButton from './ChatButton.jsx';

export default function Cta() {
  return (
    <section className="cta" id="access">
      <div className="container cta__inner">
        <h2>Turn Every Call into a Clear Answer.</h2>
        <div className="cta__side">
          <ul className="assurances">
            <li>A Specialist Sets You Up</li>
            <li>One Snippet, Live the Same Day</li>
            <li>Cancel at Any Time</li>
          </ul>
          <div className="actions" id="demo">
            <ChatButton />
          </div>
        </div>
      </div>
    </section>
  );
}
