import PageShell from "@/components/layout/PageShell";
import LedgerLeftPage from "@/components/tab/LedgerLeftPage";
import WaitingList from "@/components/tab/WaitingList";

export default function WaitingPage() {
  return (
    <PageShell
      leftPage={<LedgerLeftPage />}
      title="Waiting for Decision"
      subtitle="Proposals pending your confirmation or counterparty answer"
      backHref="/"
      backLabel="Ledger"
    >
      <WaitingList />
    </PageShell>
  );
}
