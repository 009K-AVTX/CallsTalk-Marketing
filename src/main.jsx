import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import App from './App.jsx';
import './fonts.css';
import './index.css';

// The page is pre-rendered at build time; hydrate attaches React to that HTML.
hydrateRoot(
  document.getElementById('root'),
  <StrictMode>
    <App path={window.location.pathname} />
  </StrictMode>,
);
