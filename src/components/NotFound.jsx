import ChatButton from './ChatButton.jsx';

export default function NotFound() {
  return (
    <main className="legal not-found">
      <div className="container">
        <p className="legal__crumb">Error 404</p>
        <h1>This Page Doesn't Exist.</h1>
        <p className="lead">The Link May Be Out of Date. Return to the Home Page or Ask Us in the Chat.</p>
        <div className="actions">
          <a href="/" className="btn btn--light">Back to Home</a>
          <ChatButton className="btn btn--quiet" />
        </div>
      </div>
    </main>
  );
}
