import heroFarm from "@/assets/hero-farm.jpg";
import heroData from "@/assets/hero-data.jpg";
import heroHardware from "@/assets/hero-hardware.jpg";

const posts = [
  {
    image: heroFarm,
    date: "Feb 15, 2026",
    title: "How GraminLink Helps Small Farmers Plan Smarter Seasons",
    excerpt: "From seed selection to harvest timing — see how data-driven crop planning is transforming small-scale agriculture.",
  },
  {
    image: heroData,
    date: "Jan 22, 2026",
    title: "Understanding Soil Health with Real-Time Sensor Data",
    excerpt: "Learn how GraminLink's IoT sensors give you a live view of soil moisture, temperature, and nutrient levels.",
  },
  {
    image: heroHardware,
    date: "Dec 10, 2025",
    title: "Meet GraminLink Hub: Your Farm's Command Center",
    excerpt: "A single dashboard for yield maps, weather alerts, and advisory — accessible from any device, anywhere.",
  },
];

const BlogSection = () => (
  <section className="py-24 bg-background">
    <div className="container">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12 gap-4">
        <div>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold mb-2">The GraminLink Blog</h2>
          <p className="text-muted-foreground text-sm">Insights, updates, and tips for modern farming.</p>
        </div>
        <a href="#" className="text-primary text-sm font-semibold hover:underline">Read More →</a>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {posts.map((post, i) => (
          <article key={i} className="group rounded-lg overflow-hidden border border-border bg-card hover:border-primary/30 transition-colors">
            <div className="aspect-video overflow-hidden">
              <img
                src={post.image}
                alt={post.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="p-5">
              <p className="text-xs text-muted-foreground mb-2">{post.date}</p>
              <h3 className="font-display font-bold text-sm mb-2 group-hover:text-primary transition-colors leading-snug">
                {post.title}
              </h3>
              <p className="text-muted-foreground text-xs leading-relaxed">{post.excerpt}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);

export default BlogSection;
