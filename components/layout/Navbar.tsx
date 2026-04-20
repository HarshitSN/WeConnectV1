"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Network, BookOpen, ShoppingBag, LayoutDashboard, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

export default function Navbar() {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = [
    { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
    { href: "/buyer-portal", label: "Buyer Portal", icon: ShoppingBag },
    { href: "/ecosystem",    label: "Ecosystem",    icon: Network },
    { href: "/documentation",label: "Docs",         icon: BookOpen },
  ];

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 shadow-[0_8px_22px_rgb(15,23,42,0.08)] backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-200 via-sky-300 to-teal-200 flex items-center justify-center shadow-md shadow-cyan-900/40">
            <span className="text-[#072033] text-xs font-bold">WE</span>
          </div>
          <div className="leading-tight">
            <div className="text-base font-extrabold tracking-tight text-slate-900">WEConnect</div>
            <div className="text-[10px] text-slate-500 hidden sm:block">Certification Platform</div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={cn("flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-xl transition-all",
                path.startsWith(href)
                  ? "bg-cyan-50 text-cyan-800 ring-1 ring-cyan-300/80 backdrop-blur shadow-sm"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")}>
              <Icon size={14} />{label}
            </Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="md:hidden flex items-center justify-center w-10 h-10 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white/95 backdrop-blur-xl animate-[slideDown_0.2s_ease-out]">
          <nav className="flex flex-col gap-1 px-4 py-3">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className={cn("flex items-center gap-2.5 text-sm font-semibold px-4 py-3 rounded-xl transition-all",
                  path.startsWith(href)
                    ? "bg-cyan-50 text-cyan-800 ring-1 ring-cyan-300/80"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")}>
                <Icon size={16} />{label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
