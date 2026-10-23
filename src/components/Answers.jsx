import SolutionIcon from './SolutionIcon.jsx';

// Example questions a team can answer with CallsTalk, each with a sample answer from a report.
const ANSWERS = [
  { icon: 'Sales Leaders', q: 'Which keyword made the phone ring?', a: 'Paid Search, "same-day plumbing"', d: 'Drove 34 calls this week' },
  { icon: 'Financial Services', q: 'Which campaign earned the most revenue?', a: 'Summer tune-up', d: '$18,400 attributed this month' },
  { icon: 'Marketing Teams', q: 'Where should next month\'s budget go?', a: 'Shift 20% from display to search', d: 'Search returns 4.2x its ad spend' },
  { icon: 'Agencies', q: 'What can I show my client on Monday?', a: 'A white-label revenue report', d: 'Sent automatically every week' },
];

export default function Answers() {
  return (
    <section className="section answers">
      <div className="container">
        <div className="section__head">
          <h2>Questions you can finally answer.</h2>
          <p className="lead">Pulled from your own calls, forms and chats.</p>
        </div>
        <div className="answers__grid">
          {ANSWERS.map(({ icon, q, a, d }) => (
            <article key={q} className="answer">
              <SolutionIcon name={icon} />
              <h3>{q}</h3>
              <div className="answer__result">
                <b>{a}</b>
                <span>{d}</span>
              </div>
            </article>
          ))}
        </div>
        <p className="fine">Sample answers shown for illustration.</p>
      </div>
    </section>
  );
}
