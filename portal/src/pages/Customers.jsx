import { useState } from 'react';
import { isConflict } from '../admin.js';
import { Avatar } from '../avatar.jsx';
import Icon from '../components/Icons.jsx';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import { Link, navigate } from '../router.jsx';
import { listCustomers, saveNickname } from '../reports.js';
import useLoad from '../useLoad.js';

// One customer's nickname, saved on its own. A change someone else saved first is refused; the list then reloads.
function Nickname({ customer, onSaved }) {
  const [value, setValue] = useState(customer.nickname || '');
  const [state, setState] = useState({ status: 'idle', message: '' });
  const changed = value.trim() !== (customer.nickname || '');

  const save = async (e) => {
    e.preventDefault();
    setState({ status: 'sending', message: '' });
    try {
      const { user } = await saveNickname(customer.id, value.trim(), customer.version);
      setValue(user.nickname);
      setState({ status: 'done', message: 'Saved.' });
      onSaved();
    } catch (err) {
      setState({ status: 'error', message: err.message });
      if (isConflict(err)) onSaved();
    }
  };

  return (
    <form className="p-form p-nick" onSubmit={save}>
      <label className="sr-only" htmlFor={`nick-${customer.id}`}>Nickname for {customer.name}</label>
      <input id={`nick-${customer.id}`} value={value} onChange={(e) => { setValue(e.target.value); setState({ status: 'idle', message: '' }); }} maxLength={40} placeholder="e.g. Q10" autoComplete="off" />
      <button type="submit" className="btn btn--quiet btn--sm" disabled={!changed || state.status === 'sending'}>{state.status === 'sending' ? 'Saving…' : 'Save'}</button>
      {state.status === 'done' && <span className="p-ok p-nick__note" role="status"><Icon name="check" />{state.message}</span>}
      {state.status === 'error' && <span className="access-card__error p-nick__note" role="alert">{state.message}</span>}
    </form>
  );
}

// Staff: every customer who can be sent reports, with the nickname that picks them when uploading. A customer's name
// opens their page (AdminUser.jsx).
export default function Customers() {
  const customers = useLoad(listCustomers, []);
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const shown = (customers.data || []).filter((c) => !q || [c.name, c.login, c.nickname].some((v) => (v || '').toLowerCase().includes(q)));
  const missing = (customers.data || []).filter((c) => !c.nickname).length;

  return (
    <>
      <PageHead title="Customers" sub={customers.data ? `${customers.data.length} customer${customers.data.length === 1 ? '' : 's'}${missing ? ` · ${missing} without a nickname` : ''}` : 'Loading…'}>
        <button type="button" className="btn btn--quiet btn--sm" onClick={customers.reload}><Icon name="refresh" />Refresh</button>
        <button type="button" className="btn btn--light btn--sm" onClick={() => navigate('/customers/new')}><Icon name="plus" />New Customer</button>
      </PageHead>
      <ErrorNote error={customers.error} onRetry={customers.reload} />
      <section className="p-card p-card--flush">
        <header className="p-card__head">
          <div><h2>Nicknames</h2><p>The nickname is how a customer is chosen when uploading a report. Open a customer for their billing, calls, replaced calls and payments.</p></div>
          <label className="p-search"><span className="sr-only">Filter</span><input type="search" placeholder="Name, login or nickname" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
        </header>
        <div className="p-tablewrap">
          <table className={`p-table${customers.loading ? ' is-loading' : ''}`}>
            <thead><tr><th scope="col">Customer</th><th scope="col">Login ID</th><th scope="col">Nickname</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <th scope="row"><Link to={`/customers/${c.id}`} className="p-person"><Avatar userId={c.id} version={c.avatar_version} name={c.name} size="sm" />{c.name}</Link></th>
                  <td>{c.login}</td>
                  <td><Nickname customer={c} onSaved={customers.reload} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.data && !shown.length && <p className="p-empty">{q ? 'No customers match that filter.' : 'No customers yet. Use New Customer to add the first one.'}</p>}
        </div>
      </section>
    </>
  );
}
