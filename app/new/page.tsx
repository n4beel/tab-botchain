import PageShell from "@/components/layout/PageShell";
import LedgerLeftPage from "@/components/tab/LedgerLeftPage";
import NewEntryForm from "@/components/tab/NewEntryForm";
import BotChainGate from "@/components/botchain/BotChainGate";

interface PageProps {
  searchParams: Promise<{ to?: string }>;
}

export default async function NewEntryPage({ searchParams }: PageProps) {
  const { to } = await searchParams;

  return (
    <PageShell
      leftPage={<LedgerLeftPage />}
      title="Add Bilateral Entry"
      subtitle="Propose a debit or credit entry to a counterparty"
      backHref="/"
      backLabel="Ledger"
    >
      <BotChainGate noWalletNote="You need a connected wallet to propose entries.">
        <NewEntryForm initialTo={to || ""} />
      </BotChainGate>
    </PageShell>
  );
}
