import { updates } from '../data.js';

export default function Updates() {
  return (
    <section className="section section--tight" id="resources">
      <div className="container">
        <h2 className="h-sm">What's new at CallsTalk</h2>
        <div className="grid grid--3">
          {updates.map(({ title, thumb }) => (
            <article key={title} className="card post">
              <div className={`post__thumb ${thumb}`} />
              <h3>{title}</h3>
              <a href="#">Find out more →</a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
