import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ProblemSection from "@/components/ProblemSection";
import SolutionsSection from "@/components/SolutionsSection";
import FeaturesSection from "@/components/FeaturesSection";
import DashboardPreview from "@/components/DashboardPreview";
import HowItWorks from "@/components/HowItWorks";
import ImpactSection from "@/components/ImpactSection";
import AudienceSection from "@/components/AudienceSection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

const Landing = () => (
  <div className="bg-background text-foreground antialiased">
    <Navbar />
    <HeroSection />
    <ProblemSection />
    <SolutionsSection />
    <FeaturesSection />
    <DashboardPreview />
    <HowItWorks />
    <ImpactSection />
    <AudienceSection />
    <CTASection />
    <Footer />
  </div>
);

export default Landing;
