import Nav from './components/Nav.jsx';
import ScrollProgress from './components/ScrollProgress.jsx';
import Hero from './components/Hero.jsx';
import Statement from './components/Statement.jsx';
import Platform from './components/Platform.jsx';
import Solutions from './components/Solutions.jsx';
import Onboarding from './components/Onboarding.jsx';
import Pricing from './components/Pricing.jsx';
import Answers from './components/Answers.jsx';
import Legal from './components/Legal.jsx';
import NotFound from './components/NotFound.jsx';
import AccessPage from './components/AccessPage.jsx';
import Updates from './components/Updates.jsx';
import Cta from './components/Cta.jsx';
import Footer from './components/Footer.jsx';
import ChatWidget from './components/ChatWidget.jsx';

export const LEGAL_PAGES = ['legal', 'terms', 'privacy', 'cookies'];

function Home() {
  return (
    <main>
      <Hero />
      <Statement />
      <Platform />
      <Solutions />
      <Onboarding />
      <Pricing />
      <Answers />
      <Updates />
      <Cta />
    </main>
  );
}

// One app, several pre-rendered pages: the home page, the Legal Center documents and a 404 page.
export default function App({ path = '/' }) {
  const page = path.replace(/^\/|\/$/g, '').replace(/\.html$/, '');
  let content = <Home />;
  if (LEGAL_PAGES.includes(page)) content = <Legal page={page} />;
  else if (page === 'request-access') content = <AccessPage />;
  else if (page && page !== 'index') content = <NotFound />;
  return (
    <>
      <ScrollProgress />
      <Nav />
      {content}
      <Footer />
      <ChatWidget />
    </>
  );
}
