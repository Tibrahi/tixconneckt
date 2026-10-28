import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import StatsBar from "@/components/landing/StatsBar";
import Community from "@/components/landing/Community";
import Opportunities from "@/components/landing/Opportunities";
import HowItWorks from "@/components/landing/HowItWorks";
import LoanSupport from "@/components/landing/LoanSupport";
import Testimonial from "@/components/landing/Testimonial";
import CtaBanner from "@/components/landing/CtaBanner";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-black">
      <Header />
      <main>
        <Hero />
        <StatsBar />
        <Community />
        <Opportunities />
        <HowItWorks />
        <LoanSupport />
        <Testimonial />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}
