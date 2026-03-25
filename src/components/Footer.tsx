const footerLinks = [
  { label: "About the Project", href: "#" },
  { label: "Documentation", href: "#" },
  { label: "Contact", href: "#" },
  { label: "GitHub", href: "#" },
  { label: "Privacy Policy", href: "#" },
];

const Footer = () => (
  <footer className="py-10 bg-card border-t border-border">
    <div className="container flex flex-col md:flex-row items-center justify-between gap-6">
      <span className="font-display text-lg font-extrabold text-primary">SmartDukaan</span>
      <div className="flex flex-wrap gap-6 justify-center">
        {footerLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {link.label}
          </a>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">© 2026 SmartDukaan. All rights reserved.</p>
    </div>
  </footer>
);

export default Footer;
