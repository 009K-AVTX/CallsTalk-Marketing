import ChatButton from './ChatButton.jsx';

export default function NotFound() {
  return (
    <main className="legal not-found">
      <div className="container">
        <p className="legal__crumb">Error 404</p>
        <h1>This page doesn't exist.</h1>
        <p className="lead">The link may be out of date. Return to the home page or ask us in the chat.</p>
        <div className="actions">
          <a href="/" className="btn btn--light">Back to Home</a>
          <ChatButton className="btn btn--quiet" />
        </div>
      </div>
    </main>
  );
}
