import { Smartphone, QrCode, ShieldCheck, Brain } from "lucide-react";
import { ScrollReveal, StaggerContainer, StaggerItem } from "./ScrollReveal";

const steps = [
  {
    num: "01",
    icon: Smartphone,
    title: "Tap and Speak",
    desc: "Use fast voice search to add items to the cart, even when 100% offline.",
  },
  {
    num: "02",
    icon: QrCode,
    title: "Generate Dynamic QR",
    desc: "Create single-use QRs automatically tied directly to your bank API.",
  },
  {
    num: "03",
    icon: ShieldCheck,
    title: "Verify Payment",
    desc: "Get instant confirmation, making fake screenshot scams entirely impossible.",
  },
  {
    num: "04",
    icon: Brain,
    title: "AI Credit Management",
    desc: "Update 'Udhar' balances securely using credit logic and OTP guards.",
  },
];

const HowItWorks = () => (
  <section className="py-24 bg-card border-y border-border">
    <div className="container">
      <ScrollReveal className="text-center mb-14">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary mb-3">
          How It Works
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-extrabold">
          From tapping to smart decisions
        </h2>
      </ScrollReveal>
      <StaggerContainer className="grid md:grid-cols-4 gap-6">
        {steps.map((s, i) => (
          <StaggerItem key={i}>
            <div className="relative text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                <s.icon className="w-6 h-6 text-primary" />
              </div>
              <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">
                Step {s.num}
              </span>
              <h3 className="font-display font-bold text-base mt-1 mb-2">{s.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-7 left-[60%] w-[80%] border-t border-dashed border-border" />
              )}
            </div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  </section>
);

export default HowItWorks;
