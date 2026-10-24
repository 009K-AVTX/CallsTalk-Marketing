import ContactLinks from './ContactLinks.jsx';
import { Statement } from './BillingPage.jsx';

const STEPS = [
  ['Your Own Price', 'We agree a price per call with you. There are no plans or monthly tiers; every customer has their own rate.'],
  ['Billed as Calls Arrive', 'Each call comes off your balance the moment it is counted, so the bill is never a surprise.'],
  ['Three Days of Bills', 'Log in to see today live and a full statement for each of the last three days.'],
  ['Pay Online, Any Time', 'Pay from your billing page in a few clicks. The payment shows on your bill as soon as it clears.'],
];

// An example day's bill, laid out as on the billing page. Illustrative figures only.
const SAMPLE = {
  date: '2026-10-21', is_today: false, opening_balance: '-320.00', calls: 64,
  price_per_call: '35.00', charges: '2240.00', payment_received: '2500.00', balance: '-60.00',
};

export default function Pricing() {
  return (
    <section className="section section--dark" id="pricing">
      <div className="container">
        <div className="section__head">
          <h2>Per-Call Pricing, Tailored to Your Business.</h2>
          <p className="lead">No plans to choose from. You get your own price per call and a billing page that shows what you owe as your calls arrive.</p>
        </div>

        <div className="pricing">
          <ol className="pricing__steps">
            {STEPS.map(([title, text], i) => (
              <li key={title}>
                <span aria-hidden="true">{i + 1}</span>
                <div><b>{title}</b><p>{text}</p></div>
              </li>
            ))}
          </ol>
          <figure className="pricing__sample">
            <Statement day={SAMPLE} currency="USD" />
            <figcaption>Sample bill: 64 calls at $35.00 each and a $2,500.00 payment, from a -$320.00 opening balance.</figcaption>
          </figure>
        </div>

        <div className="pricing__talk">
          <div>
            <h3>Want your price?</h3>
            <p>Request access and we will agree your price per call. Customers can log in to see and pay their bill.</p>
          </div>
          <div className="actions">
            <a href="/request-access" className="btn btn--light">Request Access</a>
            <a href="/login" className="btn btn--quiet">Log In</a>
          </div>
        </div>
        <div className="pricing__contact">
          <p>Questions about your price or a bill?</p>
          <ContactLinks />
        </div>
        <p className="fine">Prices in USD, before taxes. A negative balance is the amount due.</p>
      </div>
    </section>
  );
}
