import Header from "./components/landing/Header";
import Hero from "./components/landing/Hero";
import Features from "./components/landing/Features";
import CtaBanner from "./components/landing/CtaBanner";
import Footer from "./components/landing/Footer";
import LandingOverlays from "./components/landing/LandingOverlays";

export default function LandingApp() {
  return (
    <main className="min-h-screen bg-[#05060f]">
      <Header />
      <Hero />
      <Features />
      <CtaBanner />
      <Footer />
      <LandingOverlays />
    </main>
  );
}
