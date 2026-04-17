"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Network, BookOpen, ShoppingBag, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const path = usePathname();
  const links = [
    { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
    { href: "/buyer-portal", label: "Buyer Portal", icon: ShoppingBag },
    { href: "/ecosystem",    label: "Ecosystem",    icon: Network },
    { href: "/documentation",label: "Docs",         icon: BookOpen },
  ];
  return (
    <header className="sticky top-0 z-50 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center">
            <span className="text-zinc-950 text-xs font-bold">WE</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-zinc-100">WEConnect</div>
            <div className="text-[10px] text-zinc-500">Certification Platform</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={cn("flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all",
                path.startsWith(href) ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50")}>
              <Icon size={14} />{label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
