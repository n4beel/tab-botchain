import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import LedgerLeftPage from "@/components/tab/LedgerLeftPage";
import Button from "@/components/ui/Button";
import { app } from "@/lib/app-config";

export default function Home() {
  return (
    <PageShell
      leftPage={<LedgerLeftPage />}
      title="Tab"
      subtitle="Bilateral ledger on BOT Chain"
    >
      <div className="flex flex-col gap-6 justify-between h-full font-mono">
        {/* Desktop Right Page Content */}
        <div className="flex flex-col gap-6">
          <div className="border-b border-[#E8C9B8] pb-4">
            <span className="text-xs uppercase text-[#7A5646] tracking-widest block mb-1">
              ACCOUNTING FOLIO
            </span>
            <h2 className="text-xl font-bold text-[#3A1F14]">
              Consent-First Running Ledgers
            </h2>
            <p className="text-xs text-[#7A5646] mt-1 leading-relaxed max-w-lg">
              Every entry begins as a proposal. The balance only updates when both
              counterparties confirm. When debts are cleared, settle directly in BOT.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="bg-[#FFF9F4] border border-[#E8C9B8] p-4 rounded-[2px] flex flex-col justify-between gap-3">
              <div>
                <span className="font-bold text-[#3A1F14] block">Record an IOU</span>
                <p className="text-[#7A5646] mt-1">
                  Propose an entry for dinner, rent, or groceries. Your friend confirms or declines.
                </p>
              </div>
              <div>
                <Link href="/new">
                  <Button size="sm" variant="primary">
                    + New Entry
                  </Button>
                </Link>
              </div>
            </div>

            <div className="bg-[#FFF9F4] border border-[#E8C9B8] p-4 rounded-[2px] flex flex-col justify-between gap-3">
              <div>
                <span className="font-bold text-[#3A1F14] block">Pending Reviews</span>
                <p className="text-[#7A5646] mt-1">
                  Review proposals waiting for your confirmation, or withdraw ones you sent.
                </p>
              </div>
              <div>
                <Link href="/waiting">
                  <Button size="sm" variant="ghost">
                    Waiting List →
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="bg-[#FFF9F4] border border-[#E8C9B8] p-4 rounded-[2px] text-xs leading-relaxed text-[#7A5646]">
            <span className="font-bold text-[#3A1F14] block mb-1">Honest limits:</span>
            <ul className="list-disc list-inside space-y-1">
              <li>It cannot make anyone pay. An entry is an agreement, not an enforceable debt.</li>
              <li>Netting is pairwise only — between two addresses.</li>
              <li>All entries and notes are on-chain and public.</li>
            </ul>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
