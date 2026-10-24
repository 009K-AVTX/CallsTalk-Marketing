import RequestAccess from './RequestAccess.jsx';

const STEPS = [
  ['Tell Us About Your Business', 'It takes about a minute. We only need your name, email and company.'],
  ['We Review Your Request', 'Our team receives it immediately and reviews it within one business day.'],
  ['Receive Your Login Link', 'Once approved, we email you a link to your CallsTalk.io account.'],
];

// Standalone request-access page at /request-access.
export default function AccessPage() {
  return (
    <main className="access-page">
      <div className="container access-page__inner">
        <div className="access-page__copy">
          <p className="legal__crumb"><a href="/">Home</a> / Request Access</p>
          <h1>Get Your CallsTalk Account.</h1>
          <p className="lead">Trace Every Call, Form and Chat Back to the Campaign That Started It. Request Access, and a Specialist Will Set You Up.</p>
          <ol className="access-page__steps">
            {STEPS.map(([title, text], i) => (
              <li key={title}>
                <span aria-hidden="true">{i + 1}</span>
                <div><b>{title}</b><p>{text}</p></div>
              </li>
            ))}
          </ol>
        </div>
        <RequestAccess />
      </div>
    </main>
  );
}
