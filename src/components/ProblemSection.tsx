import { ShieldAlert, CircleDollarSign, Calculator, WifiOff } from "lucide-react";
import { ScrollReveal, StaggerContainer, StaggerItem } from "./ScrollReveal";

const problems = [
  { icon: ShieldAlert, text: "Fake UPI Screenshot Scams" },
  { icon: CircleDollarSign, text: "Unrecovered 'Udhar' Debts" },
  { icon: Calculator, text: "Manual Billing & Math Errors" },
  { icon: WifiOff, text: "Complex Apps that Need Internet" },
];

const ProblemSection = () => (
  <section className="relative py-24 bg-card border-y border-border overflow-hidden">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-destructive/10 rounded-full blur-3xl opacity-30 pointer-events-none" />

    <div className="container relative z-10">
      <ScrollReveal>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-destructive mb-3">
          The Problem
        </p>
      </ScrollReveal>
      <ScrollReveal delay={0.1}>
        <h2 className="font-display text-3xl md:text-4xl font-extrabold mb-4 max-w-lg">
          Traditional Billing Hurts Your Profits
        </h2>
      </ScrollReveal>
      <ScrollReveal delay={0.2}>
        <p className="text-muted-foreground text-base mb-12 max-w-xl">
          Fake screenshots, unrecorded unrecovered debts (Udhar), and human calculation errors make Kirana management stressful.
        </p>
      </ScrollReveal>
      <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {problems.map((p, i) => (
          <StaggerItem key={i}>
            <div className="rounded-2xl border border-border bg-background/50 p-6 flex flex-col items-start gap-4 hover:border-destructive/30 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 h-full">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <p.icon className="w-5 h-5 text-destructive" />
              </div>
              <p className="font-display font-semibold text-sm">{p.text}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  </section>
);

export default ProblemSection;
