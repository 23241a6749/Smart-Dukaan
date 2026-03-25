import { QrCode, Brain, MessageSquare, WifiOff } from "lucide-react";
import { ScrollReveal, StaggerContainer, StaggerItem } from "./ScrollReveal";

const solutions = [
  {
    icon: QrCode,
    title: "Dynamic QR Verification",
    desc: "Verify payment status with Bank API in real-time, making fake screenshots and 'pending' payment scams impossible.",
  },
  {
    icon: Brain,
    title: "AI Credit Scoring",
    desc: "Assign smart 'Credit Scores' based on history and secure 'Udhar' with OTP-verification to prevent disputes.",
  },
  {
    icon: MessageSquare,
    title: "AI Recovery Assistant",
    desc: "Automatically send personalized WhatsApp reminders and schedule AI voice calls to recover unpaid debts 40% faster.",
  },
  {
    icon: WifiOff,
    title: "100% Offline Mode",
    desc: "Works fully without internet to keep your billing fast and uninterrupted during rushed shop hours.",
  },
];

const SolutionsSection = () => (
  <section className="relative py-24 bg-background overflow-hidden">
    <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-primary/20 rounded-full blur-3xl opacity-30 pointer-events-none" />
    <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl opacity-20 pointer-events-none" />

    <div className="container relative z-10">
      <ScrollReveal>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary mb-3">
          Our Solution
        </p>
      </ScrollReveal>
      <ScrollReveal delay={0.1}>
        <h2 className="font-display text-3xl md:text-4xl font-extrabold mb-4 max-w-lg">
          Smart Billing & Credit Made Easy
        </h2>
      </ScrollReveal>
      <ScrollReveal delay={0.2}>
        <p className="text-muted-foreground text-base mb-14 max-w-xl">
          SmartDukaan turns your smartphone into a Verification Engine, Risk Assessor, and automated Recovery Agent.
        </p>
      </ScrollReveal>
      <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {solutions.map((s, i) => (
          <StaggerItem key={i}>
            <div className="group rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-6 hover:border-primary/30 hover:shadow-2xl hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 h-full">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-all duration-300">
                <s.icon className="w-6 h-6 text-primary group-hover:scale-110 transition-transform duration-300" />
              </div>
              <h3 className="font-display font-bold text-base mb-2">{s.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  </section>
);

export default SolutionsSection;
