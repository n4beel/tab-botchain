import Link from "next/link";
import PageShell from "@/components/layout/PageShell";

export default function NotFound() {
  return (
    <PageShell title="Entry Not Found" subtitle="This ledger folio could not be found">
      <div className="py-12 w-full max-w-lg mx-auto text-center font-mono">
        <div className="bg-[#FFFDF9] border border-[#E8C9B8] rounded-[6px] p-8 shadow-[3px_3px_12px_rgba(58,31,20,0.08)] space-y-5">
          <div className="w-12 h-12 mx-auto bg-[#B8371F]/10 text-[#B8371F] rounded-full flex items-center justify-center text-xl font-bold">
            404
          </div>
          <h2 className="text-xl font-bold text-[#3A1F14] font-serif">
            Folio Not Found
          </h2>
          <p className="text-xs text-[#7A5646] leading-relaxed max-w-sm mx-auto">
            The tab or counterpart record you requested does not exist on this network or has no recorded entries.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded bg-[#B8371F] text-white hover:bg-[#942B17] transition-colors shadow-sm"
            >
              ← Return to Ledger
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
