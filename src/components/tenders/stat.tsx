/** Small labelled stat tile, shared by the tenders explorer cards and the detail page. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[5px] bg-[#E3F2FF] px-2 py-1.5 text-right dark:bg-secondary/40">
      <div className="text-[10px] text-[#5A7184] dark:text-slate-400">{label}</div>
      <div className="font-bold text-[#1E3A5F] tnum dark:text-slate-100">{value}</div>
    </div>
  );
}
