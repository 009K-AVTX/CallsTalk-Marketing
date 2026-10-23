import { reviews } from '../data.js';

export default function Testimonials() {
  return (
    <section className="section">
      <div className="container">
        <h2>Trusted by teams that measure with CallsTalk.</h2>
        <div className="reviews">
          {reviews.map(({ initial, quote, name, role }) => (
            <figure key={initial} className="review">
              <blockquote>{quote}</blockquote>
              <figcaption>
                <span className="avatar" aria-hidden="true">{initial}</span>
                <span><b>{name}</b>{role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
