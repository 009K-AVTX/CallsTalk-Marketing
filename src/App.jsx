import UtilityBar from './components/UtilityBar.jsx';
import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import Updates from './components/Updates.jsx';
import Features from './components/Features.jsx';
import Solutions from './components/Solutions.jsx';
import Integrations from './components/Integrations.jsx';
import Steps from './components/Steps.jsx';
import Pricing from './components/Pricing.jsx';
import Testimonials from './components/Testimonials.jsx';
import Cta from './components/Cta.jsx';
import Footer from './components/Footer.jsx';

export default function App() {
  return (
    <>
      <UtilityBar />
      <Nav />
      <main>
        <Hero />
        <Updates />
        <Features />
        <Solutions />
        <Integrations />
        <Steps />
        <Pricing />
        <Testimonials />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
