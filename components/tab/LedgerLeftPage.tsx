"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatEther, isAddress, type Address, type Hex } from "viem";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { tabAbi } from "@/lib/botchain/abi";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { formatSigned } from "@/lib/tab";
import { shortAddress } from "@/lib/errors";

export interface LedgerLeftPageProps {
  selectedPeer?: Address;
}

export default function LedgerLeftPage({ selectedPeer }: LedgerLeftPageProps) {
  const router = useRouter();
  const { address: userAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = isBotChainId(chainId)
    ? (getDeployment(chainId)?.address as Address | undefined)
    : undefined;

  const [lookupInput, setLookupInput] = useState("");
  const [lookupError, setLookupError] = useState("");

  // Read peerCount and ledger for user
  const { data: peerCountData } = useReadContract({
    address: contractAddress,
    abi: tabAbi,
    functionName: "peerCount",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: Boolean(contractAddress && userAddress) },
  });

  const count = peerCountData ? Number(peerCountData) : 0;

  const { data: ledgerData, refetch: refetchLedger } = useReadContract({
    address: contractAddress,
    abi: tabAbi,
    functionName: "ledgerOf",
    args: userAddress ? [userAddress, 0n, 50n] : undefined,
    query: { enabled: Boolean(contractAddress && userAddress && count > 0) },
  });

  // Read pending funds to collect
  const { data: pendingFunds, refetch: refetchPending } = useReadContract({
    address: contractAddress,
    abi: tabAbi,
    functionName: "pending",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: Boolean(contractAddress && userAddress) },
  });

  // Collect action (withdraw)
  const { data: collectHash, writeContract: writeCollect, isPending: isCollecting } =
    useWriteContract();
  const { isSuccess: isCollectSuccess } = useWaitForTransactionReceipt({
    hash: collectHash,
  });

  const handleCollect = () => {
    if (!contractAddress) return;
    writeCollect({
      address: contractAddress,
      abi: tabAbi,
      functionName: "withdraw",
    });
  };

  const peers = (ledgerData?.[0] as Address[]) || [];
  const balances = (ledgerData?.[1] as bigint[]) || [];

  // Compute total net
  let totalNet = 0n;
  for (const b of balances) {
    totalNet += b;
  }

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = lookupInput.trim();
    if (!trimmed) return;
    if (!isAddress(trimmed)) {
      setLookupError("Invalid EVM address.");
      return;
    }
    setLookupError("");
    router.push(`/with/${trimmed}`);
  };

  return (
    <div className="flex flex-col h-full justify-between gap-6">
      <div className="flex flex-col gap-5">
        {/* Ledger Title Header */}
        <div className="border-b-2 border-[#3A1F14] pb-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-widest text-[#7A5646]">
              GENERAL LEDGER
            </span>
            <span className="font-mono text-xs text-[#7A5646]">
              FOLIO {count > 0 ? count : 0}
            </span>
          </div>

          {/* Net position line (§3.4) */}
          {isConnected && userAddress ? (
            <div className="mt-2">
              {count === 0 ? (
                <p className="text-sm font-semibold text-[#7A5646]">
                  No tabs yet. Add the first entry.
                </p>
              ) : totalNet > 0n ? (
                <p className="text-sm font-bold text-[#3A1F14]">
                  You&apos;re owed {formatEther(totalNet)} BOT across {count}{" "}
                  {count === 1 ? "person" : "people"}.
                </p>
              ) : totalNet < 0n ? (
                <p className="text-sm font-bold text-[#B8371F]">
                  You owe {formatEther(-totalNet)} BOT across {count}{" "}
                  {count === 1 ? "person" : "people"}.
                </p>
              ) : (
                <p className="text-sm font-bold text-[#3A1F14]">Square.</p>
              )}
            </div>
          ) : (
            <div className="mt-2 text-xs text-[#7A5646]">
              Connect a wallet to view your personal ledger, or look up an address tab below.
            </div>
          )}
        </div>

        {/* Collect Banner (§3.3) */}
        {pendingFunds !== undefined && pendingFunds > 0n && (
          <div className="bg-[#FFF9F4] border border-[#B8371F] p-3 rounded-[2px] flex items-center justify-between gap-2 shadow-sm">
            <div>
              <p className="text-xs font-mono font-bold text-[#B8371F]">
                {formatEther(pendingFunds)} BOT TO COLLECT
              </p>
              <p className="text-[11px] text-[#7A5646]">Settled funds in vault</p>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={handleCollect}
              busy={isCollecting}
            >
              Collect
            </Button>
          </div>
        )}

        {/* Peer List */}
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[#7A5646] border-b border-[#E8C9B8] pb-1 mb-2">
            <span>COUNTERPARTY</span>
            <span>BALANCE</span>
          </div>

          {peers.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#7A5646] font-mono border border-[#E8C9B8]/40 rounded-[2px]">
              {isConnected ? "NO ACCOUNTS RECORDED." : "CONNECT WALLET TO VIEW ACCOUNTS."}
            </div>
          ) : (
            <ul className="flex flex-col ruled-ledger-rows border border-[#E8C9B8]/40 rounded-[2px]" role="list">
              {peers.map((peer, idx) => {
                const bal = balances[idx] ?? 0n;
                const { formatted, isNegative } = formatSigned(bal);
                const isCurrent =
                  selectedPeer && selectedPeer.toLowerCase() === peer.toLowerCase();

                return (
                  <li key={peer} className="h-[36px] flex items-center">
                    <Link
                      href={`/with/${peer}`}
                      className={[
                        "w-full h-full flex items-center justify-between px-2.5 text-xs font-mono no-underline transition-colors",
                        isCurrent
                          ? "bg-[#FFE3D3] font-bold text-[#3A1F14]"
                          : "hover:bg-[#FFF9F4]/75 text-[#3A1F14]",
                      ].join(" ")}
                    >
                      <span className="shrink-0">{shortAddress(peer)}</span>
                      <span className="dotted-leader" />
                      <span
                        className={[
                          "shrink-0 font-semibold",
                          isNegative ? "text-[#B8371F]" : "text-[#3A1F14]",
                        ].join(" ")}
                      >
                        {formatted}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Public Address Lookup */}
      <div className="border-t border-[#E8C9B8] pt-4">
        <form onSubmit={handleLookup} className="flex flex-col gap-2">
          <label className="text-[11px] font-mono uppercase text-[#7A5646]">
            LOOK UP PUBLIC TAB
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="0x…"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-[#FFF9F4] border border-[#E8C9B8] rounded-[2px] text-[#3A1F14] outline-none focus:border-[#B8371F]"
            />
            <Button size="sm" variant="ghost" type="submit">
              View
            </Button>
          </div>
          {lookupError && (
            <p className="text-[10px] text-[#B8371F] font-mono">{lookupError}</p>
          )}
        </form>
      </div>
    </div>
  );
}
