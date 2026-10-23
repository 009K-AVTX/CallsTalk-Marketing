import { features } from '../data.js';

export default function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        {features.map((f, i) => (
          <div key={f.eyebrow} className={`feature${i % 2 ? ' feature--rev' : ''}`}>
            <div className={`feature__art ${f.art}`} aria-hidden="true" />
            <div className="feature__copy">
              <span className="eyebrow">{f.eyebrow}</span>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
              <ul className="iconlinks">
                {f.links.map((l) => <li key={l}><a href="#">{l}</a></li>)}
              </ul>
              <blockquote className="quote">
                “Placeholder testimonial. Replace with a real customer quote.”
                <cite>Customer Name, Title</cite>
              </blockquote>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
