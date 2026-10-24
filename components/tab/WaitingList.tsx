"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, type Address, type Hex } from "viem";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Button from "@/components/ui/Button";
import { tabAbi } from "@/lib/botchain/abi";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { describeError, shortAddress } from "@/lib/errors";

export default function WaitingList() {
  const { address: userAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = isBotChainId(chainId)
    ? (getDeployment(chainId)?.address as Address | undefined)
    : undefined;

  const [activeTxId, setActiveTxId] = useState<bigint | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Read proposals
  const { data: proposalsData, refetch } = useReadContract({
    address: contractAddress,
    abi: tabAbi,
    functionName: "proposalsFor",
    args: userAddress ? [userAddress, 0n, 50n] : undefined,
    query: { enabled: Boolean(contractAddress && userAddress) },
  });

  const { data: hash, writeContract, error: writeError, isPending: isWritePending } =
    useWriteContract();

  const { isSuccess: isReceiptSuccess } = useWaitForTransactionReceipt({ hash });
  const settledHash = useRef<Hex | null>(null);

  useEffect(() => {
    if (writeError) {
      setErrorMsg(describeError(writeError));
    }
  }, [writeError]);

  useEffect(() => {
    if (!hash) return;
    if (isReceiptSuccess && settledHash.current !== hash) {
      settledHash.current = hash;
      setActiveTxId(null);
      refetch();
    }
  }, [hash, isReceiptSuccess, refetch]);

  const proposals = proposalsData || [];

  // Filter pending proposals
  const pendingInbound = proposals.filter(
    (p) =>
      p.state === 0 &&
      userAddress &&
      p.other.toLowerCase() === userAddress.toLowerCase()
  );

  const pendingOutbound = proposals.filter(
    (p) =>
      p.state === 0 &&
      userAddress &&
      p.proposer.toLowerCase() === userAddress.toLowerCase()
  );

  const handleConfirm = (id: bigint) => {
    if (!contractAddress) return;
    setActiveTxId(id);
    setErrorMsg("");
    writeContract({
      address: contractAddress,
      abi: tabAbi,
      functionName: "confirm",
      args: [id],
    });
  };

  const handleReject = (id: bigint) => {
    if (!contractAddress) return;
    setActiveTxId(id);
    setErrorMsg("");
    writeContract({
      address: contractAddress,
      abi: tabAbi,
      functionName: "reject",
      args: [id],
    });
  };

  const handleWithdraw = (id: bigint) => {
    if (!contractAddress) return;
    setActiveTxId(id);
    setErrorMsg("");
    writeContract({
      address: contractAddress,
      abi: tabAbi,
      functionName: "withdrawProposal",
      args: [id],
    });
  };

  if (!isConnected || !userAddress) {
    return (
      <div className="py-12 text-center text-xs font-mono text-[#7A5646]">
        Connect your wallet to review proposals awaiting confirmation.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 font-mono text-xs">
      {errorMsg && (
        <p className="text-[11px] text-[#B8371F] bg-[#FBEBE8] p-3 border border-[#B8371F] rounded-[2px]">
          {errorMsg}
        </p>
      )}

      {/* Section 1: Inbound (Awaiting Your Confirmation) */}
      <section className="flex flex-col gap-3">
        <div className="border-b border-[#3A1F14] pb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#3A1F14] uppercase tracking-wide">
            Awaiting Your Confirmation ({pendingInbound.length})
          </h2>
          <span className="text-[11px] text-[#7A5646]">DECIDE ENTRIES</span>
        </div>

        {pendingInbound.length === 0 ? (
          <p className="py-6 text-center text-[#7A5646]">
            No incoming proposals waiting for your confirmation.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {pendingInbound.map((p) => {
              const amountEth = formatEther(p.amount);
              // If p.proposerIsOwed is true: proposer claims YOU owe THEM.
              // If p.proposerIsOwed is false: proposer claims THEY owe YOU.
              const claimsYouOwe = p.proposerIsOwed;

              return (
                <div
                  key={p.id.toString()}
                  className="bg-[#FFF9F4] border border-[#E8C9B8] p-4 rounded-[2px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#3A1F14]">
                        {amountEth} BOT
                      </span>
                      <span
                        className={[
                          "inked-stamp text-[9px] py-0 px-1",
                          claimsYouOwe
                            ? "text-[#B8371F] border-[#B8371F]"
                            : "text-[#1E3A6B] border-[#1E3A6B]",
                        ].join(" ")}
                      >
                        {claimsYouOwe ? "THEY CLAIM YOU OWE" : "THEY OWE YOU"}
                      </span>
                    </div>

                    <p className="text-xs text-[#7A5646] mt-1">
                      From: <Link href={`/with/${p.proposer}`} className="underline text-[#3A1F14]">{shortAddress(p.proposer)}</Link>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleConfirm(p.id)}
                      busy={isWritePending && activeTxId === p.id}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleReject(p.id)}
                      busy={isWritePending && activeTxId === p.id}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Outbound (Awaiting Their Confirmation) */}
      <section className="flex flex-col gap-3">
        <div className="border-b border-[#3A1F14] pb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#3A1F14] uppercase tracking-wide">
            Awaiting Their Answer ({pendingOutbound.length})
          </h2>
          <span className="text-[11px] text-[#7A5646]">WITHDRAWABLE</span>
        </div>

        {pendingOutbound.length === 0 ? (
          <p className="py-6 text-center text-[#7A5646]">
            No outgoing proposals currently pending.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {pendingOutbound.map((p) => {
              const amountEth = formatEther(p.amount);
              return (
                <div
                  key={p.id.toString()}
                  className="bg-[#FFF9F4] border border-[#E8C9B8] p-4 rounded-[2px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#3A1F14]">
                        {amountEth} BOT
                      </span>
                      <span className="text-[#1E3A6B] font-semibold text-xs">
                        Awaiting {shortAddress(p.other)}
                      </span>
                    </div>
                    <p className="text-xs text-[#7A5646] mt-1">
                      Proposal #{p.id.toString()}
                    </p>
                  </div>

                  <div className="shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleWithdraw(p.id)}
                      busy={isWritePending && activeTxId === p.id}
                    >
                      Withdraw
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
