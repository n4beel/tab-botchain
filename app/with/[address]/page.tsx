import { isAddress, type Address } from "viem";
import PageShell from "@/components/layout/PageShell";
import LedgerLeftPage from "@/components/tab/LedgerLeftPage";
import StatementView from "@/components/tab/StatementView";

interface PageProps {
  params: Promise<{ address: string }>;
}

export default async function PairPage({ params }: PageProps) {
  const { address } = await params;
  const validAddress = isAddress(address) ? (address as Address) : null;

  if (!validAddress) {
    return (
      <PageShell
        leftPage={<LedgerLeftPage />}
        title="Invalid Address"
        subtitle="Address error"
        backHref="/"
        backLabel="Ledger"
      >
        <div className="py-12 text-center font-mono text-xs text-[#B8371F]">
          The address &ldquo;{address}&rdquo; is not a valid EVM address.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      leftPage={<LedgerLeftPage selectedPeer={validAddress} />}
      title="Bilateral Statement"
      subtitle={`Ledger with ${validAddress.slice(0, 6)}…${validAddress.slice(-4)}`}
      backHref="/"
      backLabel="Ledger"
    >
      <StatementView peerAddress={validAddress} />
    </PageShell>
  );
}
