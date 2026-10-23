import RequestAccess from './RequestAccess.jsx';

const STEPS = [
  ['Tell us about your business', 'A minute to fill in. Name, email and company are all we need.'],
  ['We review your request', 'Our team gets it right away and checks it within one business day.'],
  ['Get your login link', 'Once approved, we email a link to your CallsTalk.io account.'],
];

// Standalone request-access page at /request-access.
export default function AccessPage() {
  return (
    <main className="access-page">
      <div className="container access-page__inner">
        <div className="access-page__copy">
          <p className="legal__crumb"><a href="/">Home</a> / Request access</p>
          <h1>Get your CallsTalk account.</h1>
          <p className="lead">Every call, form and chat, traced back to the campaign that started it. Request access and a specialist sets you up.</p>
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
