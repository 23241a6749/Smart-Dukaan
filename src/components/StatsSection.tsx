import { Wifi, Settings, TrendingUp } from "lucide-react";

const stats = [
  {
    icon: Wifi,
    title: "Seamlessly Connected",
    desc: "GraminLink integrates with leading farm equipment and IoT sensors for effortless data flow.",
  },
  {
    icon: Settings,
    title: "Works With Your Setup",
    desc: "Compatible with a wide range of machinery, drones, and sensor systems already on your farm.",
  },
  {
    icon: TrendingUp,
    title: "Proven Yield Gains",
    desc: "Farmers using GraminLink's crop advisory tools report measurable improvements in yield and input efficiency.",
  },
];

const StatsSection = () => (
  <section className="py-20 bg-card border-y border-border">
    <div className="container grid md:grid-cols-3 gap-12">
      {stats.map((stat, i) => (
        <div key={i} className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <stat.icon className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-display text-xl font-bold">{stat.title}</h3>
          <p className="text-muted-foreground text-sm max-w-xs">{stat.desc}</p>
        </div>
      ))}
    </div>
  </section>
);

export default StatsSection;
