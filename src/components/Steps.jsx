import { steps } from '../data.js';

export default function Steps() {
  return (
    <section className="section section--alt" id="how">
      <div className="container">
        <h2 className="center">Up and running in four steps.</h2>
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
