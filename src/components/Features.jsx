import { features } from '../data.js';

export default function Features() {
  return (
    <section className="section features" id="features">
      <div className="container">
        {features.map((f) => (
          <article key={f.eyebrow} className="feature">
            <div className="feature__copy">
              <p className="kicker">{f.eyebrow}</p>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </div>
            <div className="feature__detail">
              <ul className="capabilities">
                {f.links.map((l) => <li key={l}><a href="#">{l}</a></li>)}
              </ul>
              <blockquote className="quote">
                “Placeholder: insert a genuine customer testimonial here.”
                <cite>Full Name, Job Title</cite>
              </blockquote>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
