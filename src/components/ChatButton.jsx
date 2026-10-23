// A button that opens the chat widget straight to the team, so a client can reach us in one click.
export function openChat() {
  window.dispatchEvent(new CustomEvent('callstalk:open-chat', { detail: { team: true } }));
}

export default function ChatButton({ className = 'btn btn--light', children = 'Chat with us' }) {
  return (
    <a
      href="#chat"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        openChat();
      }}
    >
      {children}
    </a>
  );
}
