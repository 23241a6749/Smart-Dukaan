import { QrCode, Brain, Bell, CloudOff, FileText } from "lucide-react";
import { ScrollReveal, StaggerContainer, StaggerItem } from "./ScrollReveal";

const features = [
  {
    icon: QrCode,
    title: "Fraud-Proof Dynamic QR",
    desc: "Payment statuses verified directly with the bank API in real-time.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
  {
    icon: Brain,
    title: "AI Credit Scoring",
    desc: "Assign smart scores to 'Udhar' items based on buyer history.",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
  },
  {
    icon: Bell,
    title: "AI Recovery Reminders",
    desc: "Automates personalized WhatsApp and call reminders on scheduled dates.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: CloudOff,
    title: "Offline-First Framework",
    desc: "Bounces calculations smoothly without depending on internet downtime.",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
  },
  {
    icon: FileText,
    title: "Voice-Search Billing",
    desc: "Tap and speak item names to build carts rapidly without typing.",
    color: "text-orange-400",
    bg: "bg-orange-400/10",
  },
];

const FeaturesSection = () => (
  <section className="py-24 bg-card border-y border-border">
    <div className="container">
      <ScrollReveal className="text-center mb-14">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary mb-3">
          Key Features
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-extrabold mb-4">
          Everything you need to run your Kirana Smarter
        </h2>
      </ScrollReveal>
      <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((f, i) => (
          <StaggerItem key={i}>
            <div className="rounded-2xl border border-border bg-background/50 p-6 hover:border-primary/20 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 h-full">
              <div className={`w-11 h-11 rounded-lg ${f.bg} flex items-center justify-center mb-4`}>
                <f.icon className={`w-5 h-5 ${f.color}`} />
              </div>
              <h3 className="font-display font-bold text-base mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  </section>
);

export default FeaturesSection;
