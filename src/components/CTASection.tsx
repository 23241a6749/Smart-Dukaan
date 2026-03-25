import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";
import { useNavigate } from "react-router-dom";

const CTASection = () => {
  const navigate = useNavigate();
  return (
  <section className="py-24 bg-background">
    <div className="container">
      <ScrollReveal variant="scaleIn">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-accent/5 p-12 md:p-16 text-center">
          <h2 className="font-display text-3xl md:text-4xl font-extrabold mb-4">
            Stop Dealing with Fake UPI Today
          </h2>
          <p className="text-muted-foreground text-base mb-8 max-w-md mx-auto">
            Join Kirana shops across India maximizing profits, securing 'Udhar', and stopping scams with absolute confidence.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" className="gap-2" onClick={() => navigate('/signup')}>
              Get Started for Free <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-foreground/20 text-foreground hover:bg-foreground/10"
            >
              Watch Demo
            </Button>
          </div>
        </div>
      </ScrollReveal>
    </div>
  </section>
  );
};

export default CTASection;
