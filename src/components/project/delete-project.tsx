"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { deleteProjectAction } from "@/server/actions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function DeleteProject({
  id,
  name,
  triggerClassName,
}: {
  id: string;
  name: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function del() {
    setLoading(true);
    await deleteProjectAction(id);
    toast.success("הפרויקט נמחק");
    router.push("/dashboard");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="מחיקת פרויקט"
          className={cn("text-muted-foreground hover:text-danger", triggerClassName)}
        >
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>מחיקת פרויקט</DialogTitle>
          <DialogDescription>
            למחוק את <b className="text-foreground">{name}</b>? הפעולה אינה הפיכה.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">ביטול</Button>
          </DialogClose>
          <Button variant="destructive" className="gap-2" onClick={del} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            מחק לצמיתות
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
