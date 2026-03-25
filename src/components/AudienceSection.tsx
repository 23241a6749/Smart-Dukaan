import { User, Building2, Store, Smartphone } from "lucide-react";
import { ScrollReveal, StaggerContainer, StaggerItem } from "./ScrollReveal";

const audiences = [
  {
    icon: User,
    title: "Neighborhood Kiranas",
    desc: "Speed up your daily billing and make payments fully safe from payment fraud.",
  },
  {
    icon: Building2,
    title: "Wholesale & Traders",
    desc: "Manage huge amounts of customer credit limits and 'Udhar' ledger without disputes.",
  },
  {
    icon: Store,
    title: "Supermarts & General Stores",
    desc: "Speed up buyer checkout using fully functional, voice-search enabled carts.",
  },
  {
    icon: Smartphone,
    title: "Mobile-First Vendors",
    desc: "Run your full sales workflow on a smartphone with zero bulky PC hardware setup.",
  },
];

const AudienceSection = () => (
  <section className="py-24 bg-card border-y border-border">
    <div className="container">
      <ScrollReveal className="text-center mb-14">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary mb-3">
          Who It's For
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-extrabold">
          Built for every Kirana store
        </h2>
      </ScrollReveal>
      <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {audiences.map((a, i) => (
          <StaggerItem key={i}>
            <div className="rounded-xl border border-border bg-background/50 p-6 text-center hover:border-primary/20 transition-colors h-full">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <a.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-display font-bold text-sm mb-2">{a.title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">{a.desc}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  </section>
);

export default AudienceSection;
