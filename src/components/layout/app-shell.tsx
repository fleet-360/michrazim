"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, LogOut, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import {
  IconDashboard, IconTender, IconCompare, IconMap, IconMarket, IconFees, IconIntegrations, IconNew,
} from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { CommandPalette } from "./command-palette";
import { AssistantWidget } from "@/components/ai/assistant-widget";
import type { SessionUser } from "@/server/auth";
import type { Track } from "@/lib/engine/types";
import { logoutAction } from "@/server/actions";

const NAV = [
  { href: "/dashboard", label: "לוח בקרה", icon: IconDashboard },
  { href: "/tenders", label: "מכרזי רמ״י", icon: IconTender },
  { href: "/compare", label: "השוואת עסקאות", icon: IconCompare },
  { href: "/map", label: "מפת מכרזים", icon: IconMap },
  { href: "/comparables", label: "עסקאות שוק", icon: IconMarket },
  { href: "/data/cities", label: "טבלאות אגרות", icon: IconFees },
  { href: "/integrations", label: "אינטגרציות", icon: IconIntegrations },
];

// compact set for the mobile bottom bar
const MOBILE_NAV = [
  { href: "/dashboard", label: "בקרה", icon: IconDashboard },
  { href: "/tenders", label: "מכרזים", icon: IconTender },
  { href: "/map", label: "מפה", icon: IconMap },
  { href: "/comparables", label: "שוק", icon: IconMarket },
];

interface ProjectLite {
  _id: string;
  name: string;
  city: string;
  track: Track;
}

export function AppShell({
  user,
  projects = [],
  children,
}: {
  user: SessionUser | null;
  projects?: ProjectLite[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const openCommand = () => window.dispatchEvent(new Event("omdan:command"));

  return (
    <div className="min-h-screen app-aurora">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-border bg-card/40 px-4 py-5 backdrop-blur-xl lg:flex">
          <Link href="/dashboard" className="px-2">
            <Logo />
          </Link>

          <Button asChild className="mt-7 gap-2" size="lg">
            <Link href={user ? "/projects/new" : "/login?mode=register&next=%2Fprojects%2Fnew"}>
              <IconNew className="size-[18px]" />
              עסקה חדשה
            </Link>
          </Button>

          <nav className="mt-6 flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <item.icon className="size-[18px]" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-[var(--radius-lg)] border border-border bg-card/60 p-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-full bg-primary/15 font-semibold text-primary">
                  {user.name?.[0] ?? "מ"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{user.title ?? user.email}</div>
                </div>
                <form action={logoutAction}>
                  <Button variant="ghost" size="icon" aria-label="התנתק" type="submit">
                    <LogOut className="size-4" />
                  </Button>
                </form>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">צפייה וניתוח פתוחים לכולם. התחברו כדי לשמור.</div>
                <div className="flex gap-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/login?mode=register${pathname ? `&next=${encodeURIComponent(pathname)}` : ""}`}>הרשמה</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/login${pathname ? `?next=${encodeURIComponent(pathname)}` : ""}`}>כניסה</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/70 px-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 lg:hidden">
              <Logo />
            </div>
            <button
              onClick={openCommand}
              className="hidden min-w-72 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground lg:flex"
            >
              <Search className="size-4" />
              <span className="flex-1 text-right">חיפוש פרויקטים, ניווט, פעולות…</span>
              <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
            </button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="חיפוש" onClick={openCommand}>
                <Search className="size-4" />
              </Button>
              <ThemeToggle />
              {user ? (
                <Button asChild variant="outline" size="sm" className="gap-2 lg:hidden">
                  <Link href="/projects/new">
                    <Plus className="size-4" />
                    חדש
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" className="gap-1.5 lg:hidden">
                  <Link href={`/login${pathname ? `?next=${encodeURIComponent(pathname)}` : ""}`}>כניסה</Link>
                </Button>
              )}
            </div>
          </header>

          <main className="flex-1 px-4 pb-28 pt-6 sm:px-5">{children}</main>
        </div>
      </div>

      {/* mobile bottom navigation */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-background/92 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden">
        {MOBILE_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-[var(--radius-md)] py-1 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-[22px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <CommandPalette projects={projects} />
      <AssistantWidget />
    </div>
  );
}
