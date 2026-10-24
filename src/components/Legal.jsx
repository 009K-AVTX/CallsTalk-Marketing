import { DOCS, LEGAL_GROUPS } from '../legal.js';

const slugOf = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function Block({ block }) {
  if (typeof block === 'string') return <p>{block}</p>;
  return (
    <>
      {block.lead && <p>{block.lead}</p>}
      <ul>{block.list.map((item) => <li key={item}>{item}</li>)}</ul>
    </>
  );
}

function LegalCenter() {
  return (
    <>
      <header className="legal__head">
        <p className="legal__crumb">Legal</p>
        <h1>Legal Center</h1>
        <p className="lead">The Agreements and Policies That Apply When You Use CallsTalk.</p>
      </header>
      {LEGAL_GROUPS.map((group) => (
        <section key={group.title} className="legal__group">
          <h2>{group.title}</h2>
          <div className="legal__cards">
            {group.docs.map((id) => (
              <a key={id} className="legal__card" href={`/${id}`}>
                <h3>{DOCS[id].title}</h3>
                <p>{DOCS[id].summary}</p>
                <span>Read</span>
              </a>
            ))}
          </div>
        </section>
      ))}
      <p className="legal__note">
        These documents form part of your agreement with CallsTalk. If a policy and the Terms of Service conflict, the Terms of
        Service control unless the policy says otherwise.
      </p>
    </>
  );
}

function LegalDoc({ id }) {
  const doc = DOCS[id];
  return (
    <>
      <header className="legal__head">
        <p className="legal__crumb"><a href="/legal">Legal Center</a> / {doc.title}</p>
        <h1>{doc.title}</h1>
        <p className="lead">{doc.summary}</p>
        <p className="legal__date">Effective {doc.effective}</p>
      </header>
      <div className="legal__body">
        <nav className="legal__toc" aria-label="On this page">
          <p>On this page</p>
          <ol>
            {doc.sections.map((s) => <li key={s.title}><a href={`#${slugOf(s.title)}`}>{s.title}</a></li>)}
          </ol>
        </nav>
        <article className="legal__article">
          {doc.intro.map((p) => <p key={p} className="legal__intro">{p}</p>)}
          {doc.sections.map((s, i) => (
            <section key={s.title} id={slugOf(s.title)}>
              <h2>{i + 1}. {s.title}</h2>
              {s.blocks.map((b, k) => <Block key={k} block={b} />)}
            </section>
          ))}
        </article>
      </div>
    </>
  );
}

export default function Legal({ page }) {
  return (
    <main className="legal">
      <div className="container">
        {page === 'legal' ? <LegalCenter /> : <LegalDoc id={page} />}
      </div>
    </main>
  );
}
