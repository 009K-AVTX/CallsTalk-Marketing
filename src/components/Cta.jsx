import ChatButton from './ChatButton.jsx';
export default function Cta() {
  return (
    <section className="cta" id="access">
      <div className="container cta__inner">
        <h2>Replace assumptions with evidence.</h2>
        <div className="cta__side">
          <ul className="assurances">
            <li>Personal onboarding from our specialists</li>
            <li>Live in minutes with one snippet</li>
            <li>No long-term commitment</li>
          </ul>
          <div className="actions" id="demo">
            <ChatButton />
            <a href="#pricing" className="btn btn--quiet">See Plans</a>
          </div>
        </div>
      </div>
    </section>
  );
}
