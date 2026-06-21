"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { SearchIcon } from "@/components/brand/search-icon";
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
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-white px-4 py-5 lg:flex dark:bg-background">
          <Link href="/dashboard" className="px-2">
            <Logo />
          </Link>

          <Link
            href={user ? "/projects/new" : "/login?mode=register&next=%2Fprojects%2Fnew"}
            className="shadow-pill mt-7 flex w-full items-center gap-3 rounded-lg bg-[#1E3A5F] px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <IconNew className="size-[18px] shrink-0 text-white" />
            <span className="flex-1 text-right">עסקה חדשה</span>
          </Link>

          <nav className="mt-4 flex flex-col gap-2">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#1E3A5F] transition-colors dark:text-slate-100",
                    active
                      ? "bg-[#E3F2FF] dark:bg-[#15233a]"
                      : "shadow-pill bg-white hover:bg-[#E3F2FF]/60 dark:bg-card dark:shadow-none dark:hover:bg-[#15233a]/80",
                  )}
                >
                  <item.icon className="size-[18px] shrink-0 text-[#1E3A5F] dark:text-slate-100" />
                  <span className="flex-1 text-right">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="shadow-pill mt-auto rounded-lg bg-white p-3 dark:bg-card dark:shadow-none">
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
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 bg-white px-5 dark:bg-background">
            <div className="flex items-center gap-2 lg:hidden">
              <Logo />
            </div>
            <button
              onClick={openCommand}
              className="hidden h-[29px] w-[402px] max-w-full shrink-0 items-center gap-2 rounded-[5px] bg-[#E3F2FF] px-3 transition-colors hover:bg-[#E3F2FF]/80 lg:flex dark:bg-[#15233a] dark:hover:bg-[#15233a]/90"
            >
              <SearchIcon className="text-black dark:text-white" />
              <span className="inline-block flex-1 origin-right text-right text-xs font-normal italic leading-none text-[#1E3A5F] [transform:skewX(-4deg)] dark:text-slate-200">
                חיפוש פרויקטים, ניווט, פעולות…
              </span>
            </button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="חיפוש" onClick={openCommand}>
                <SearchIcon className="text-foreground" />
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

          <main className="flex-1 bg-white px-4 pb-28 pt-6 sm:px-5 dark:bg-background">{children}</main>
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
