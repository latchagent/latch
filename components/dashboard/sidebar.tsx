"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShieldCheck,
  ScrollText,
  History,
  Settings,
  Server,
  Bot,
} from "lucide-react";

const navigation = [
  { name: "Overview", href: "/overview", icon: LayoutDashboard },
  { name: "Approvals", href: "/approvals", icon: ShieldCheck },
  { name: "Rules", href: "/rules", icon: ScrollText },
  { name: "Audit Log", href: "/audit", icon: History },
  { name: "Agents", href: "/agents", icon: Bot },
  { name: "Upstreams", href: "/upstreams", icon: Server },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 flex-col border-r bg-card lg:flex">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100">
          <ShieldCheck className="h-4 w-4 text-white dark:text-zinc-900" />
        </div>
        <span className="text-xl font-semibold tracking-tight">Latch</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
