import { steps } from '../data.js';

export default function Steps() {
  return (
    <section className="section" id="how">
      <div className="container">
        <h2>Get started in four simple steps.</h2>
        <ol className="steps">
          {steps.map(({ title, text, link }, i) => (
            <li key={title}>
              <b>{i + 1}</b>
              <h3>{title}</h3>
              <p>{text}</p>
              <a href="#">{link}</a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
