# Website chat: backend setup

Every message in the chat widget goes to a person. The widget uses the chat server in
[`server/`](../server/README.md), which posts each conversation to the team's Telegram (and email)
and relays their replies back into the chat. Set `VITE_SUPPORT_API_URL` in Vercel to that server's
API base, for example `https://chat.callstalk.com/api`, then redeploy.

Setup, Hostinger VPS deployment and the Telegram reply commands are in [server/README.md](../server/README.md).

## How the widget uses it

- A visitor can just type a question: that starts a chat right away with no name or email
  (the team sees them as "Visitor"). "Talk to our team" opens a form that adds their name and email.
- With each new chat it sends the referrer, so the team knows where the visitor came from.
- It checks for replies every 3 seconds while open and every 15 seconds while closed.
- A visitor can keep up to 3 chats, listed in a sidebar. Starting a 4th closes their oldest open chat after the visitor confirms (the team sees **Chat ended** in Telegram). Visitors cannot end a chat themselves, only start a new one. Ended chats clear from the sidebar by themselves. If the visitor is reading a chat when it ends, it stays on screen with the goodbye until they switch chats or start a new one.
- The team can also get every message by email, with a link to answer in the chat (see the server README).
- Agent replies are shown in the chat only. Nothing emails the visitor automatically; the team
  sees the visitor's email address and can write to them directly.
