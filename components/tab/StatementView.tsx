"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, isAddress, type Address } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract } from "wagmi";
import Button from "@/components/ui/Button";
import BotChainGate from "@/components/botchain/BotChainGate";
import SettleForm from "./SettleForm";
import ForgiveForm from "./ForgiveForm";
import { tabAbi } from "@/lib/botchain/abi";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { formatSigned, loadStatement, signedFor, type StatementEntry } from "@/lib/tab";
import { shortAddress } from "@/lib/errors";

export interface StatementViewProps {
  peerAddress: Address;
}

export default function StatementView({ peerAddress }: StatementViewProps) {
  const { address: userAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const publicClientRef = useRef(publicClient);
  publicClientRef.current = publicClient;

  const contractAddress = isBotChainId(chainId)
    ? (getDeployment(chainId)?.address as Address | undefined)
    : undefined;

  // Effective viewer address (or fallback to contract/zero if visitor is unconnected)
  const viewer = userAddress || ("0x0000000000000000000000000000000000000001" as Address);

  const [statement, setStatement] = useState<StatementEntry[]>([]);
  const [isLoadingStatement, setIsLoadingStatement] = useState(true);
  const [activeAction, setActiveAction] = useState<"none" | "settle" | "forgive">("none");

  // Read balanceBetween
  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    address: contractAddress,
    abi: tabAbi,
    functionName: "balanceBetween",
    args: userAddress ? [userAddress, peerAddress] : undefined,
    query: { enabled: Boolean(contractAddress && userAddress && isAddress(peerAddress)) },
  });

  const balance = balanceData !== undefined ? balanceData : 0n;
  const balanceDetails = signedFor(viewer, viewer, peerAddress, balance);

  // Load statement logs
  useEffect(() => {
    let active = true;
    if (!contractAddress || !publicClientRef.current || !isAddress(peerAddress)) {
      setIsLoadingStatement(false);
      return;
    }

    setIsLoadingStatement(true);
    loadStatement(publicClientRef.current, contractAddress, viewer, peerAddress)
      .then(({ statement: st }) => {
        if (active) {
          setStatement(st);
          setIsLoadingStatement(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load statement logs", err);
        if (active) {
          setIsLoadingStatement(false);
        }
      });

    return () => {
      active = false;
    };
  }, [contractAddress, peerAddress, viewer]);

  const handleActionSuccess = () => {
    refetchBalance();
    setActiveAction("none");
    if (contractAddress && publicClientRef.current) {
      loadStatement(publicClientRef.current, contractAddress, viewer, peerAddress).then(
        ({ statement: st }) => setStatement(st)
      );
    }
  };

  const { formatted: formattedBalance, isNegative: isBalanceNegative } = formatSigned(balance);

  return (
    <div className="flex flex-col gap-6">
      {/* Statement Header Card */}
      <div className="border-b-2 border-[#3A1F14] pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-widest text-[#7A5646]">
              BILATERAL STATEMENT
            </span>
            <span className="inked-stamp text-[#3A1F14] border-[#3A1F14]">
              {balance === 0n ? "SQUARE" : balanceDetails.isOwed ? "THEY OWE" : "YOU OWE"}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold font-mono text-[#3A1F14] mt-1 break-all">
            {peerAddress}
          </h2>
        </div>

        {/* Current Net Balance Box */}
        <div className="bg-[#FFF9F4] border border-[#E8C9B8] p-3 rounded-[2px] text-right font-mono min-w-[160px]">
          <span className="text-[10px] uppercase text-[#7A5646] block">
            NET BALANCE
          </span>
          <span
            className={[
              "text-lg sm:text-xl font-bold block",
              isBalanceNegative ? "text-[#B8371F]" : "text-[#3A1F14]",
            ].join(" ")}
          >
            {formattedBalance}
          </span>
          <span className="text-[11px] text-[#7A5646] block">
            {balanceDetails.text}
          </span>
        </div>
      </div>

      {/* Action Bar (Settle / Forgive / New Entry) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FFF9F4] p-3 border border-[#E8C9B8] rounded-[2px]">
        <div className="flex items-center gap-2">
          {/* If user owes, show Settle button */}
          {isConnected && balance < 0n && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setActiveAction(activeAction === "settle" ? "none" : "settle")}
            >
              Settle up ({formatEther(-balance)} BOT)
            </Button>
          )}

          {/* If they owe user, show Forgive button */}
          {isConnected && balance > 0n && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActiveAction(activeAction === "forgive" ? "none" : "forgive")}
            >
              Forgive part or all
            </Button>
          )}

          <Link href={`/new?to=${peerAddress}`}>
            <Button size="sm" variant="ghost">
              + Add Entry
            </Button>
          </Link>
        </div>

        {!isConnected && (
          <span className="text-xs font-mono text-[#7A5646]">
            Public view. Connect wallet to settle or propose entries.
          </span>
        )}
      </div>

      {/* Inlined Forms if action selected */}
      {activeAction === "settle" && balance < 0n && (
        <BotChainGate>
          <SettleForm
            creditor={peerAddress}
            owedAmount={-balance}
            onSuccess={handleActionSuccess}
            onCancel={() => setActiveAction("none")}
          />
        </BotChainGate>
      )}

      {activeAction === "forgive" && balance > 0n && (
        <BotChainGate>
          <ForgiveForm
            debtor={peerAddress}
            owedAmount={balance}
            onSuccess={handleActionSuccess}
            onCancel={() => setActiveAction("none")}
          />
        </BotChainGate>
      )}

      {/* Statement Table of Entries */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono text-[#7A5646] border-b border-[#E8C9B8] pb-1">
          <span className="w-24 sm:w-28">BLOCK / ID</span>
          <span className="flex-1 px-2">DESCRIPTION / NOTE</span>
          <span className="w-24 text-right">CHANGE</span>
          <span className="w-28 text-right">RUNNING</span>
        </div>

        {isLoadingStatement ? (
          <div className="py-12 text-center text-xs font-mono text-[#7A5646]">
            Scanning ledger entries…
          </div>
        ) : statement.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-[#7A5646]">
            {balance === 0n ? "Square. No entries recorded yet." : "No entry logs found."}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#F5DFD0]">
            {statement.map((entry) => {
              const { formatted: fmtDelta, isNegative: isDeltaNeg } = formatSigned(entry.delta);
              const { formatted: fmtRunning, isNegative: isRunNeg } = formatSigned(entry.runningBalance);

              const stampLabel =
                entry.type === "settle"
                  ? "SETTLED"
                  : entry.type === "forgive"
                  ? "FORGIVEN"
                  : "CONFIRMED";

              const stampColor =
                entry.type === "settle"
                  ? "text-[#1E3A6B] border-[#1E3A6B]"
                  : entry.type === "forgive"
                  ? "text-[#7A5646] border-[#7A5646]"
                  : "text-[#B8371F] border-[#B8371F]";

              return (
                <div
                  key={entry.id}
                  className="flex items-baseline justify-between py-2.5 text-xs font-mono type-entry hover:bg-[#FFF9F4] transition-colors px-1"
                >
                  {/* Block / Id */}
                  <span className="w-24 sm:w-28 text-[#7A5646] text-[11px] shrink-0">
                    #{entry.blockNumber.toString()}
                  </span>

                  {/* Note & Stamp */}
                  <div className="flex-1 px-2 flex items-baseline gap-2 min-w-0">
                    <span className="truncate text-[#3A1F14] font-medium">
                      {entry.description}
                    </span>
                    <span className={`inked-stamp text-[9px] py-0 px-1 shrink-0 ${stampColor}`}>
                      {stampLabel}
                    </span>
                  </div>

                  {/* Delta */}
                  <span
                    className={[
                      "w-24 text-right shrink-0 font-medium",
                      isDeltaNeg ? "text-[#B8371F]" : "text-[#3A1F14]",
                    ].join(" ")}
                  >
                    {fmtDelta}
                  </span>

                  {/* Running Balance */}
                  <span
                    className={[
                      "w-28 text-right shrink-0 font-bold",
                      isRunNeg ? "text-[#B8371F]" : "text-[#3A1F14]",
                    ].join(" ")}
                  >
                    {fmtRunning}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Double Underline Final Balance */}
        <div className="mt-4 pt-3 border-t-2 border-[#3A1F14] double-rule flex items-center justify-between font-mono text-sm">
          <span className="font-bold text-[#3A1F14]">CURRENT NET BALANCE</span>
          <span
            className={[
              "font-bold text-base",
              isBalanceNegative ? "text-[#B8371F]" : "text-[#3A1F14]",
            ].join(" ")}
          >
            {formattedBalance}
          </span>
        </div>
      </div>
    </div>
  );
}
