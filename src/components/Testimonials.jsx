import { reviews } from '../data.js';

function Byline({ initial, name, role }) {
  return (
    <figcaption>
      <span className="avatar" aria-hidden="true">{initial}</span>
      <span><b>{name}</b>{role}</span>
    </figcaption>
  );
}

export default function Testimonials() {
  const [featured, ...rest] = reviews.slice(0, 3);

  return (
    <section className="section">
      <div className="container">
        <h2>Trusted by Teams That Measure with CallsTalk.</h2>
        <div className="reviews">
          <figure className="review review--featured">
            <blockquote>{featured.quote}</blockquote>
            <Byline {...featured} />
          </figure>
          {rest.map((r) => (
            <figure key={r.initial} className="review">
              <blockquote>{r.quote}</blockquote>
              <Byline {...r} />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
