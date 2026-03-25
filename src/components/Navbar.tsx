import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const navItems = ["Solutions", "Features", "How It Works", "Dashboard"];

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-border">
      <div className="container flex items-center justify-between h-16">
        <span className="font-display text-xl font-extrabold tracking-tight text-primary">
          SmartDukaan
        </span>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <a
              key={item}
              href="#"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {item}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground px-2" onClick={() => navigate('/login')}>
            Log In
          </Button>
          <Button size="sm" onClick={() => navigate('/signup')}>Get Started</Button>

          {/* Mobile toggle */}
          <button
            className="md:hidden text-foreground ml-1"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-background border-b border-border px-6 pb-6 animate-fade-in">
          {navItems.map((item) => (
            <a
              key={item}
              href="#"
              className="block py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {item}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
