export default function SectionHeader({ title }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_minmax(8rem,14rem)] items-stretch bg-navy text-white sm:grid-cols-[minmax(0,1fr)_6rem_6rem_minmax(10rem,16rem)]">
      <div className="px-3 py-2 text-xs font-bold tracking-wide uppercase">{title}</div>
      <div className="flex items-center justify-center border-l border-white/20 text-center text-[10px] font-semibold uppercase tracking-wide">
        SAT
      </div>
      <div className="flex items-center justify-center border-l border-white/20 text-center text-[10px] font-semibold uppercase tracking-wide">
        NO-SAT
      </div>
      <div className="flex items-center justify-center border-l border-white/20 px-1 text-center text-[10px] font-semibold uppercase tracking-wide">
        Remarks / Location
      </div>
    </div>
  );
}
