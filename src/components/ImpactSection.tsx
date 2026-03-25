import { ShieldCheck, TrendingUp, Clock } from "lucide-react";
import { ScrollReveal, StaggerContainer, StaggerItem } from "./ScrollReveal";

const stats = [
  {
    icon: ShieldCheck,
    value: "Zero",
    label: "Fake Payment Scams",
    desc: "Verify payments with dynamic QR codes directly against bank APIs.",
  },
  {
    icon: TrendingUp,
    value: "40% Faster",
    label: "Udhar Recovery",
    desc: "Recover due balance seamlessly with automated AI WhatsApp and voice reminders.",
  },
  {
    icon: Clock,
    value: "3 Hours/Day",
    label: "Time Saved",
    desc: "Eliminate manual math, credit notebook tallying, and payment disputes.",
  },
];

const ImpactSection = () => (
  <section className="py-24 bg-background">
    <div className="container">
      <ScrollReveal className="text-center mb-14">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary mb-3">
          Impact
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-extrabold mb-4">
          Why SmartDukaan matters
        </h2>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          Protect your profits, recover debts effortlessly, and eliminate manual billing stress.
        </p>
      </ScrollReveal>
      <StaggerContainer className="grid md:grid-cols-3 gap-8">
        {stats.map((s, i) => (
          <StaggerItem key={i}>
            <div className="text-center rounded-xl border border-border bg-card p-8 hover:border-primary/20 transition-colors h-full">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                <s.icon className="w-7 h-7 text-primary" />
              </div>
              <p className="font-display text-3xl font-extrabold text-primary mb-1">{s.value}</p>
              <p className="font-display font-bold text-base mb-2">{s.label}</p>
              <p className="text-muted-foreground text-sm">{s.desc}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  </section>
);

export default ImpactSection;
