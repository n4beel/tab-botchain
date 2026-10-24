"use client";

import { useEffect, useRef, useState } from "react";
import { formatEther, parseEther, type Address, type Hex } from "viem";
import { useAccount, useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { tabAbi } from "@/lib/botchain/abi";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { describeError } from "@/lib/errors";

export interface SettleFormProps {
  creditor: Address;
  owedAmount: bigint;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function SettleForm({
  creditor,
  owedAmount,
  onSuccess,
  onCancel,
}: SettleFormProps) {
  const chainId = useChainId();
  const contractAddress = isBotChainId(chainId)
    ? (getDeployment(chainId)?.address as Address | undefined)
    : undefined;

  const defaultAmountStr = formatEther(owedAmount);
  const [payAmountStr, setPayAmountStr] = useState(defaultAmountStr);
  const [errorMsg, setErrorMsg] = useState("");
  const [stage, setStage] = useState<"idle" | "wallet" | "confirming" | "confirmed" | "error">("idle");

  const { data: hash, writeContract, error: writeError, isPending: isWritePending } =
    useWriteContract();

  const { data: receipt, isSuccess: isReceiptSuccess, isError: isReceiptError } =
    useWaitForTransactionReceipt({ hash });

  const settledHash = useRef<Hex | null>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

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
      if (onSuccessRef.current) {
        onSuccessRef.current();
      }
    } else if (isReceiptError && settledHash.current !== hash) {
      settledHash.current = hash;
      setStage("error");
      setErrorMsg("Transaction reverted on chain.");
    }
  }, [hash, isReceiptSuccess, isReceiptError]);

  // Compute remaining debt preview
  let payAmountWei = 0n;
  let remainingWei = owedAmount;
  let isValidAmount = false;

  try {
    if (payAmountStr && !isNaN(Number(payAmountStr)) && Number(payAmountStr) > 0) {
      payAmountWei = parseEther(payAmountStr);
      if (payAmountWei > 0n && payAmountWei <= owedAmount) {
        remainingWei = owedAmount - payAmountWei;
        isValidAmount = true;
      }
    }
  } catch {
    isValidAmount = false;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractAddress || !isValidAmount) return;
    setErrorMsg("");
    setStage("wallet");

    writeContract({
      address: contractAddress,
      abi: tabAbi,
      functionName: "settle",
      args: [creditor],
      value: payAmountWei,
    });
  };

  // Rule 1: stage === "confirmed" FIRST in render
  if (stage === "confirmed") {
    return (
      <div className="bg-[#FFF9F4] border-2 border-[#1E3A6B] p-5 rounded-[2px] flex flex-col gap-3 font-mono">
        <div className="flex items-center justify-between">
          <span className="inked-stamp text-[#1E3A6B] border-[#1E3A6B]">
            SETTLED
          </span>
          <span className="text-xs text-[#7A5646]">
            TX: {hash ? `${hash.slice(0, 8)}…` : "CONFIRMED"}
          </span>
        </div>
        <p className="text-sm font-semibold text-[#3A1F14]">
          Paid {payAmountStr} BOT to clear debt.
        </p>
        <p className="text-xs text-[#7A5646]">
          Remaining debt: {formatEther(remainingWei)} BOT.
        </p>
        <div className="pt-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#FFF9F4] border border-[#B8371F] p-4 sm:p-5 rounded-[2px] flex flex-col gap-4 font-mono text-xs"
    >
      <div className="flex items-center justify-between border-b border-[#E8C9B8] pb-2">
        <span className="font-bold text-[#B8371F] uppercase tracking-wide">
          SETTLE UP DEBT
        </span>
        <span className="text-[#7A5646]">
          OWED: {formatEther(owedAmount)} BOT
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-[#7A5646] uppercase">PAYMENT AMOUNT (BOT)</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPayAmountStr(formatEther(owedAmount))}
              className="text-[10px] text-[#B8371F] underline cursor-pointer hover:text-[#942B17]"
            >
              Pay All
            </button>
            <button
              type="button"
              onClick={() => setPayAmountStr(formatEther(owedAmount / 2n))}
              className="text-[10px] text-[#7A5646] underline cursor-pointer hover:text-[#3A1F14]"
            >
              Pay Half
            </button>
          </div>
        </div>

        <input
          type="text"
          value={payAmountStr}
          onChange={(e) => setPayAmountStr(e.target.value)}
          placeholder="0.0"
          className="w-full px-3 py-2 bg-white border border-[#E8C9B8] text-[#3A1F14] text-sm font-bold outline-none focus:border-[#B8371F] rounded-[2px]"
        />

        <div className="flex items-center justify-between text-[11px] text-[#7A5646]">
          <span>Remaining after payment:</span>
          <span className="font-bold text-[#3A1F14]">
            {formatEther(remainingWei)} BOT
          </span>
        </div>
      </div>

      {errorMsg && (
        <p className="text-[11px] text-[#B8371F] bg-[#FBEBE8] p-2 border border-[#B8371F] rounded-[2px]">
          {errorMsg}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="submit"
          variant="primary"
          busy={stage === "wallet" || stage === "confirming"}
          disabled={!isValidAmount}
        >
          {stage === "wallet"
            ? "Confirm in Wallet…"
            : stage === "confirming"
            ? "Settling…"
            : `Pay ${payAmountStr || "0"} BOT`}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
