import ChatButton from './ChatButton.jsx';

export default function Cta() {
  return (
    <section className="cta" id="access">
      <div className="container cta__inner">
        <h2>Turn every call into a clear answer.</h2>
        <div className="cta__side">
          <ul className="assurances">
            <li>A specialist sets you up</li>
            <li>One snippet, live the same day</li>
            <li>Cancel at any time</li>
          </ul>
          <div className="actions" id="demo">
            <ChatButton />
          </div>
        </div>
      </div>
    </section>
  );
}
