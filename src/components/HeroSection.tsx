import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";

const slides = [
  {
    label: "Fraud Protection",
    title: "Stop UPI Frauds. Start",
    highlight: "Smart Billing.",
    desc: "Protect your profit with API-verified payments and dynamic QR codes that make fake screenshot scams impossible.",
    cta1: "Get Started for Free",
    cta2: "Watch Demo Video",
    videoId: "1wAXQ_FfYcc",
  },
  {
    label: "Credit Intelligence",
    title: "Score Customer Credit with",
    highlight: "AI Intelligence.",
    desc: "Assign smart 'Credit Scores' based on history and use OTP verification to prevent manual disputes.",
    cta1: "Get Started for Free",
    cta2: "See How It Works",
    videoId: "jI-zyR_b8rs",
  },
  {
    label: "Auto Recovery",
    title: "Automate Your",
    highlight: "Udhar Recovery.",
    desc: "Let AI send Whatsapp updates and schedule calls to recover unpaid debts 40% faster without manual effort.",
    cta1: "Get Started for Free",
    cta2: "View Demo",
    videoId: "-navu1K7Gek",
  },
];

const HeroSection = () => {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [paused]);

  const slide = slides[active];

  return (
    <section className="relative min-h-screen md:h-screen flex flex-col md:justify-center overflow-hidden">
      {/* Background videos */}
      {slides.map((s, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: i === active ? 1 : 0 }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${s.videoId}?autoplay=1&mute=1&loop=1&playlist=${s.videoId}&controls=0&showinfo=0&modestbranding=1&rel=0&disablekb=1&playsinline=1&vq=hd1080`}
            title={s.label}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.77vh] min-w-full h-[56.25vw] min-h-full pointer-events-none"
            style={{ border: "none" }}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
          />
        </div>
      ))}

      {/* Overlay */}
      <div className="absolute inset-0 bg-slate-950/75" />

      {/* Content */}
      <div className="relative z-10 container flex-1 flex flex-col justify-center pt-24 pb-12 md:pt-16 md:pb-0">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold mb-6 animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {slide.label}
          </div>
          <h1
            key={active}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-6 animate-fade-in-up text-white"
          >
            {slide.title}{" "}
            <span className="text-primary">{slide.highlight}</span>
          </h1>
          <p className="text-base md:text-lg text-zinc-200 mb-8 max-w-lg animate-fade-in">
            {slide.desc}
          </p>
          <div className="flex flex-wrap gap-4 animate-fade-in">
            <Button size="lg" className="gap-2" onClick={() => navigate('/signup')}>
              {slide.cta1} <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="lg" className="gap-2 border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => window.open(`https://www.youtube.com/watch?v=${slide.videoId}`, '_blank')}>
              <Play className="w-4 h-4" /> {slide.cta2}
            </Button>
          </div>
        </div>
      </div>

      {/* Tab indicators */}
      <div className="relative z-10 w-full mb-8 md:absolute md:bottom-12 md:left-0 md:right-0 md:mb-0">
        <div className="container flex items-center gap-8 overflow-x-auto whitespace-nowrap">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => { setActive(i); setPaused(true); }}
              className={`relative pb-3 text-sm font-semibold transition-colors flex-shrink-0 ${
                i === active ? "text-white" : "text-zinc-400 hover:text-white/70"
              }`}
            >
              {s.label}
              {i === active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
