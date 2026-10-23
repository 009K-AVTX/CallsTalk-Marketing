import { updates } from '../data.js';

export default function Updates() {
  return (
    <section className="section section--white updates" id="resources">
      <div className="container updates__inner">
        <h2>Latest from CallsTalk</h2>
        <ul className="updates__list">
          {updates.map(({ title, tag }) => (
            <li key={title}>
              <a href="#">
                <span className="updates__tag">{tag}</span>
                <span className="updates__title">{title}</span>
                <span className="updates__more">Read more</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
