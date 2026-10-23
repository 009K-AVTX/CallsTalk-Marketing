import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import Statement from './components/Statement.jsx';
import Platform from './components/Platform.jsx';
import Solutions from './components/Solutions.jsx';
import Onboarding from './components/Onboarding.jsx';
import Pricing from './components/Pricing.jsx';
import Testimonials from './components/Testimonials.jsx';
import Updates from './components/Updates.jsx';
import Cta from './components/Cta.jsx';
import Footer from './components/Footer.jsx';
import ChatWidget from './components/ChatWidget.jsx';

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Statement />
        <Platform />
        <Solutions />
        <Onboarding />
        <Pricing />
        <Testimonials />
        <Updates />
        <Cta />
      </main>
      <Footer />
      <ChatWidget />
    </>
  );
}
