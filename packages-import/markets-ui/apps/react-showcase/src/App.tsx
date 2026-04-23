import { useState, useCallback } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { Button } from "./components/ui/button";
import Dashboard from "./pages/Dashboard";
import DesignSystem from "./pages/DesignSystem";

// ---------------------------------------------------------------------------
// Header with Navigation
// ---------------------------------------------------------------------------

function Header() {
  const [dark, setDark] = useState(true);

  const toggleTheme = () => {
    const html = document.documentElement;
    if (dark) {
      html.classList.remove("dark");
    } else {
      html.classList.add("dark");
    }
    setDark(!dark);
  };

  const linkClass = useCallback(
    ({ isActive }: { isActive: boolean }) =>
      `text-sm font-medium transition-colors hover:text-foreground ${isActive ? "text-foreground" : "text-muted-foreground"}`,
    [],
  );

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <h1 className="text-lg font-semibold tracking-tight">MarketsUI</h1>
          <nav className="flex items-center gap-6">
            <NavLink to="/" className={linkClass} end>
              Dashboard
            </NavLink>
            <NavLink to="/design-system" className={linkClass}>
              Design System
            </NavLink>
          </nav>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/design-system" element={<DesignSystem />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
