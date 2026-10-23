import { reviews } from '../data.js';

export default function Testimonials() {
  return (
    <section className="section section--alt">
      <div className="container">
        <h2 className="center">Teams that track with Avortyx.</h2>
        <div className="grid grid--3">
          {reviews.map(({ initial, quote, name, role }) => (
            <figure key={initial} className="card review">
              <div className="avatar">{initial}</div>
              <blockquote>{quote}</blockquote>
              <figcaption><b>{name}</b> {role}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
