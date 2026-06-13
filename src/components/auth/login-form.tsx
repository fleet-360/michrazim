"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, LogIn } from "lucide-react";
import { loginAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full gap-2" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
      כניסה למערכת
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, null as { error?: string } | null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">אימייל</Label>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          className="text-right"
          defaultValue="demo@radius.co.il"
          placeholder="you@company.co.il"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">סיסמה</Label>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          className="text-right"
          defaultValue="radius2026"
          required
        />
      </div>
      {state?.error && (
        <p className="rounded-[var(--radius-sm)] bg-danger/12 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton />
      <p className="text-center text-xs text-muted-foreground">
        חשבון דמו מולא מראש — לחצו כניסה
      </p>
    </form>
  );
}
