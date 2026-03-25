import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const testimonials = [
  {
    name: "Rajesh Patil",
    location: "Nashik, Maharashtra",
    quote: "GraminLink helped us understand our soil better and plan our inputs more efficiently — we saw real savings in the first season.",
  },
  {
    name: "Sukhwinder Singh",
    location: "Ludhiana, Punjab",
    quote: "The sensor data and crop advisory together made a huge difference. I can now make decisions backed by real field data.",
  },
  {
    name: "Anitha Reddy",
    location: "Guntur, Andhra Pradesh",
    quote: "With GraminLink's hardware, I get alerts on my phone about field conditions — it's like having eyes on every acre.",
  },
];

const TestimonialsSection = () => {
  const [active, setActive] = useState(0);

  const prev = () => setActive((active - 1 + testimonials.length) % testimonials.length);
  const next = () => setActive((active + 1) % testimonials.length);

  const t = testimonials[active];

  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="container max-w-3xl text-center">
        <h2 className="font-display text-3xl md:text-4xl font-extrabold mb-4">
          Real farmers, real results
        </h2>
        <p className="text-muted-foreground mb-14 text-sm">
          Farmers across India trust GraminLink to grow smarter.
        </p>

        <div key={active} className="animate-fade-in">
          <blockquote className="text-xl md:text-2xl font-display font-semibold leading-relaxed mb-8">
            "{t.quote}"
          </blockquote>
          <p className="font-display font-bold text-primary">{t.name}</p>
          <p className="text-muted-foreground text-sm">{t.location}</p>
        </div>

        <div className="flex items-center justify-center gap-4 mt-10">
          <button
            onClick={prev}
            className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex gap-2">
            {testimonials.map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === active ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <button
            onClick={next}
            className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
