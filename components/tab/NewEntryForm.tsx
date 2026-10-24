"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, isAddress, parseEther, type Address, type Hex } from "viem";
import { useAccount, useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Button from "@/components/ui/Button";
import { tabAbi } from "@/lib/botchain/abi";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { MAX_NOTE_BYTES } from "@/lib/limits";
import { describeError, shortAddress } from "@/lib/errors";

export interface NewEntryFormProps {
  initialTo?: string;
}

export default function NewEntryForm({ initialTo = "" }: NewEntryFormProps) {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const contractAddress = isBotChainId(chainId)
    ? (getDeployment(chainId)?.address as Address | undefined)
    : undefined;

  const [toAddress, setToAddress] = useState(initialTo);
  const [proposerIsOwed, setProposerIsOwed] = useState(true);
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [stage, setStage] = useState<"idle" | "wallet" | "confirming" | "confirmed" | "error">("idle");
  const [createdId, setCreatedId] = useState<bigint | null>(null);

  const { data: hash, writeContract, error: writeError, isPending: isWritePending } =
    useWriteContract();

  const { data: receipt, isSuccess: isReceiptSuccess, isError: isReceiptError } =
    useWaitForTransactionReceipt({ hash });

  const settledHash = useRef<Hex | null>(null);

  useEffect(() => {
    if (isWritePending) {
      setStage("wallet");
    } else if (hash && !isReceiptSuccess && !isReceiptError) {
      setStage("confirming");
    }
  }, [isWritePending, hash, isReceiptSuccess, isReceiptError]);

  useEffect(() => {
    if (writeError) {
      setStage("error");
      setErrorMsg(describeError(writeError));
    }
  }, [writeError]);

  useEffect(() => {
    if (!hash) return;
    if (isReceiptSuccess && settledHash.current !== hash) {
      settledHash.current = hash;
      setStage("confirmed");

      // Extract proposal id from Proposed event in receipt
      if (receipt?.logs) {
        for (const log of receipt.logs) {
          try {
            if (log.topics[1]) {
              setCreatedId(BigInt(log.topics[1]));
              break;
            }
          } catch {
            // ignore parse error
          }
        }
      }
    } else if (isReceiptError && settledHash.current !== hash) {
      settledHash.current = hash;
      setStage("error");
      setErrorMsg("Transaction reverted on chain.");
    }
  }, [hash, receipt, isReceiptSuccess, isReceiptError]);

  const noteBytes = new TextEncoder().encode(note).length;
  const isNoteValid = noteBytes <= MAX_NOTE_BYTES;

  let amountWei = 0n;
  let isAmountValid = false;
  try {
    if (amountStr && !isNaN(Number(amountStr)) && Number(amountStr) > 0) {
      amountWei = parseEther(amountStr);
      isAmountValid = amountWei > 0n;
    }
  } catch {
    isAmountValid = false;
  }

  const isFormValid =
    isAddress(toAddress.trim()) &&
    userAddress &&
    toAddress.trim().toLowerCase() !== userAddress.toLowerCase() &&
    isAmountValid &&
    isNoteValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractAddress || !isFormValid) return;
    setErrorMsg("");
    setStage("wallet");

    writeContract({
      address: contractAddress,
      abi: tabAbi,
      functionName: "propose",
      args: [toAddress.trim() as Address, proposerIsOwed, amountWei, note],
    });
  };

  // Rule 1: stage === "confirmed" FIRST
  if (stage === "confirmed") {
    return (
      <div className="bg-[#FFF9F4] border-2 border-[#1E3A6B] p-6 sm:p-8 rounded-[2px] flex flex-col gap-4 font-mono max-w-xl">
        <div className="flex items-center justify-between">
          <span className="inked-stamp text-[#1E3A6B] border-[#1E3A6B]">
            PROPOSED
          </span>
          <span className="text-xs text-[#7A5646]">
            TX: {hash ? `${hash.slice(0, 8)}…` : "CONFIRMED"}
          </span>
        </div>

        <div>
          <h3 className="text-lg font-bold text-[#3A1F14]">
            Entry proposal submitted.
          </h3>
          <p className="text-xs text-[#7A5646] mt-1">
            Awaiting confirmation from {shortAddress(toAddress)}. It will not change the balance until they confirm.
          </p>
        </div>

        <div className="bg-white border border-[#E8C9B8] p-4 rounded-[2px] text-xs">
          <p className="text-[#7A5646]">Note: &ldquo;{note || "—"}&rdquo;</p>
          <p className="font-bold text-[#3A1F14] mt-1">Amount: {amountStr} BOT</p>
        </div>

        <div className="flex gap-3 pt-2">
          <Link href={`/with/${toAddress.trim()}`}>
            <Button size="sm" variant="primary">
              View Statement
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setStage("idle");
              setAmountStr("");
              setNote("");
            }}
          >
            New Entry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl flex flex-col gap-5 font-mono text-xs"
    >
      {/* Direction Toggle */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[#7A5646] uppercase font-semibold">DIRECTION</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setProposerIsOwed(true)}
            className={[
              "py-2.5 px-3 border text-center font-bold rounded-[2px] cursor-pointer transition-all",
              proposerIsOwed
                ? "bg-[#B8371F] text-white border-[#942B17] shadow-sm"
                : "bg-white text-[#3A1F14] border-[#E8C9B8] hover:bg-[#FBEBE8]",
            ].join(" ")}
          >
            They owe me
          </button>
          <button
            type="button"
            onClick={() => setProposerIsOwed(false)}
            className={[
              "py-2.5 px-3 border text-center font-bold rounded-[2px] cursor-pointer transition-all",
              !proposerIsOwed
                ? "bg-[#B8371F] text-white border-[#942B17] shadow-sm"
                : "bg-white text-[#3A1F14] border-[#E8C9B8] hover:bg-[#FBEBE8]",
            ].join(" ")}
          >
            I owe them
          </button>
        </div>
      </div>

      {/* Counterparty Address */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[#7A5646] uppercase font-semibold">
          COUNTERPARTY ADDRESS
        </label>
        <input
          type="text"
          placeholder="0x…"
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          className="w-full px-3 py-2 bg-white border border-[#E8C9B8] text-[#3A1F14] text-xs font-mono rounded-[2px] outline-none focus:border-[#B8371F]"
        />
        {toAddress && !isAddress(toAddress.trim()) && (
          <span className="text-[10px] text-[#B8371F]">Invalid EVM address</span>
        )}
      </div>

      {/* Amount in BOT */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[#7A5646] uppercase font-semibold">AMOUNT (BOT)</label>
        <input
          type="text"
          placeholder="0.00"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          className="w-full px-3 py-2 bg-white border border-[#E8C9B8] text-[#3A1F14] text-sm font-bold font-mono rounded-[2px] outline-none focus:border-[#B8371F]"
        />
      </div>

      {/* Note */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[#7A5646] uppercase font-semibold">NOTE</label>
          <span
            className={[
              "text-[10px]",
              noteBytes > MAX_NOTE_BYTES ? "text-[#B8371F] font-bold" : "text-[#7A5646]",
            ].join(" ")}
          >
            {noteBytes} / {MAX_NOTE_BYTES} bytes
          </span>
        </div>
        <input
          type="text"
          placeholder="Dinner, groceries, cab ride…"
          value={note}
          maxLength={140}
          onChange={(e) => setNote(e.target.value)}
          className="w-full px-3 py-2 bg-white border border-[#E8C9B8] text-[#3A1F14] text-xs font-mono rounded-[2px] outline-none focus:border-[#B8371F]"
        />
      </div>

      {/* Preview Inked Box */}
      {isFormValid && (
        <div className="bg-[#FFF9F4] border border-[#E8C9B8] p-3 rounded-[2px] text-xs">
          <span className="text-[10px] uppercase text-[#7A5646] block mb-1">
            WHAT THE OTHER SIDE WILL SEE:
          </span>
          <p className="text-[#3A1F14] font-semibold">
            {proposerIsOwed
              ? `You owe ${amountStr} BOT for: "${note || "No note"}"`
              : `They owe you ${amountStr} BOT for: "${note || "No note"}"`}
          </p>
        </div>
      )}

      {errorMsg && (
        <p className="text-[11px] text-[#B8371F] bg-[#FBEBE8] p-2 border border-[#B8371F] rounded-[2px]">
          {errorMsg}
        </p>
      )}

      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          busy={stage === "wallet" || stage === "confirming"}
          disabled={!isFormValid}
        >
          {stage === "wallet"
            ? "Confirm in Wallet…"
            : stage === "confirming"
            ? "Submitting Proposal…"
            : "Propose Entry"}
        </Button>
      </div>
    </form>
  );
}
