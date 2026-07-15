"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, Wand2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ViewModeSwitcher } from "@/components/layout/view-mode-toggle";
import type { SessionUser } from "@/server/auth";
import { logoutAction } from "@/server/actions";

/** Chrome for Custom mode: wider canvas for the wizard + results tables. */
export function CustomShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <div className="min-h-screen app-aurora">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 sm:px-6">
        <header className="flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/custom">
              <Logo />
            </Link>
            <span className="hidden items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary sm:inline-flex">
              <Wand2 className="size-3.5" />
              Custom
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ViewModeSwitcher current="custom" />
            <ThemeToggle />
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
          </div>
        </header>

        <main className="flex-1 pb-16 pt-4">{children}</main>

        <footer className="pb-6 text-center text-xs text-muted-foreground">
          המסמכים שלכם + האקסל שלכם · סוכן AI רב-שכבתי ממלא, מצטט ומצליב מקורות
        </footer>
      </div>
    </div>
  );
}
