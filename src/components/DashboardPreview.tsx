import { Monitor } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";
import { motion } from "framer-motion";

const metrics = [
  { label: "Today's Sales", value: "₹12,450", bar: 80 },
  { label: "UPI Payments", value: "₹8,320", bar: 65 },
  { label: "Udhar Added", value: "₹3,420", bar: 45 },
  { label: "Udhar Recovered", value: "₹5,210", bar: 90 },
];

const DashboardPreview = () => (
  <section className="py-24 bg-background">
    <div className="container">
      <ScrollReveal className="text-center mb-14">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary mb-3">
          Dashboard Preview
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-extrabold mb-4">
          Monitor your entire shop in one dashboard
        </h2>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          Track sales, secure payments, audit Credit (Udhar) score ledger, and leverage AI recovery statistics.
        </p>
      </ScrollReveal>

      <ScrollReveal variant="scaleIn">
        <div className="max-w-4xl mx-auto rounded-xl border border-border bg-card overflow-hidden shadow-2xl shadow-primary/5">
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/30">
            <span className="w-3 h-3 rounded-full bg-destructive/60" />
            <span className="w-3 h-3 rounded-full bg-primary/60" />
            <span className="w-3 h-3 rounded-full bg-accent/60" />
            <div className="flex-1 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Monitor className="w-3 h-3" />
              SmartDukaan Dashboard
            </div>
          </div>

          <div className="p-6">
            {/* Metrics row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {metrics.map((m, i) => (
                <motion.div
                    key={m.label}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                    className="rounded-lg bg-secondary/40 p-4"
                >
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                  <p className="font-display font-bold text-xl text-foreground mb-2">{m.value}</p>
                  <div className="w-full h-1.5 rounded-full bg-border">
                    <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        whileInView={{ width: `${m.bar}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: 0.5 + i * 0.1, ease: "easeOut" }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* NDVI Map + Recommendations */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3">Live Sales Activity Grid</p>
                <div className="grid grid-cols-8 gap-1">
                  {Array.from({ length: 48 }).map((_, i) => (
                      <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.2, delay: 0.4 + i * 0.02 }}
                          className="aspect-square rounded-sm"
                          style={{
                            backgroundColor: `hsl(${100 + Math.sin(i * 0.5) * 40}, ${50 + Math.cos(i * 0.3) * 20}%, ${28 + Math.sin(i * 0.7) * 15}%)`,
                          }}
                      />
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-red-800" />
                    <span className="text-[9px] text-muted-foreground">Low</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-yellow-700" />
                    <span className="text-[9px] text-muted-foreground">Medium</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-green-700" />
                    <span className="text-[9px] text-muted-foreground">High</span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3">Auto Recovery Actions</p>
                <div className="space-y-3">
                  {[
                    { zone: "Remind Suresh", status: "WhatsApp Sent", urgent: true },
                    { zone: "Rahul Credit limit", status: "Auto Call Queued", urgent: false },
                    { zone: "Amit Verification", status: "Paid via QR", urgent: false },
                    { zone: "Vikas screenshot", status: "Review Triggered", urgent: true },
                  ].map((z) => (
                    <div key={z.zone} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <span className="text-xs font-semibold">{z.zone}</span>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          z.urgent
                            ? "bg-destructive/10 text-destructive"
                            : "bg-accent/10 text-accent"
                        }`}
                      >
                        {z.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </div>
  </section>
);

export default DashboardPreview;
