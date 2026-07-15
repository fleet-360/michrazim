"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ViewModeSwitcher } from "@/components/layout/view-mode-toggle";
import type { SessionUser } from "@/server/auth";
import { logoutAction } from "@/server/actions";

/** Minimal chrome for the lean quick-calculator: logo, theme, view toggle, auth. */
export function LeanShell({ user, children }: { user: SessionUser | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen app-aurora">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 sm:px-6">
        <header className="flex h-16 items-center justify-between gap-3">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <ViewModeSwitcher current="lean" />
            <ThemeToggle />
            {user ? (
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {user.name?.[0] ?? "מ"}
                </div>
                <form action={logoutAction}>
                  <Button variant="ghost" size="icon" aria-label="התנתק" type="submit">
                    <LogOut className="size-4" />
                  </Button>
                </form>
              </div>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/login?next=%2Fquick">כניסה</Link>
              </Button>
            )}
          </div>
        </header>

        <main className="flex-1 pb-16 pt-4">{children}</main>

        <footer className="pb-6 text-center text-xs text-muted-foreground">
          נתוני רמ״י, רשות המיסים ו-GIS ממשלתי · סימולציית מונטה-קרלו
        </footer>
      </div>
    </div>
  );
}
