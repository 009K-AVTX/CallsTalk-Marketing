import { updates } from '../data.js';

export default function Updates() {
  return (
    <section className="section section--white updates" id="resources">
      <div className="container updates__inner">
        <h2>Latest from the CallsTalk Team</h2>
        <ul className="updates__list">
          {updates.map(({ title, tag }) => (
            <li key={title}>
              <div className="updates__item">
                <span className="updates__tag">{tag}</span>
                <span className="updates__title">{title}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
