/** Small labelled stat tile, shared by the tenders explorer cards and the detail page. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-muted/50 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-semibold tnum">{value}</div>
    </div>
  );
}
