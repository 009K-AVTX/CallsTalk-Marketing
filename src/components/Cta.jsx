import ChatButton from './ChatButton.jsx';
import RequestAccess from './RequestAccess.jsx';

export default function Cta() {
  return (
    <section className="cta" id="access">
      <div className="container cta__inner">
        <div className="cta__copy">
          <h2>Stop guessing which ad rang.</h2>
          <ul className="assurances">
            <li>A specialist sets you up</li>
            <li>One snippet, live the same day</li>
            <li>Leave whenever you like</li>
          </ul>
          <div className="actions" id="demo">
            <ChatButton className="btn btn--quiet" />
            <a href="#pricing" className="btn btn--quiet">See Plans</a>
          </div>
        </div>
        <RequestAccess />
      </div>
    </section>
  );
}
