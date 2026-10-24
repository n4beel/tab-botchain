"use client";

import { useEffect, useRef, useState } from "react";
import { formatEther, parseEther, type Address, type Hex } from "viem";
import { useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Button from "@/components/ui/Button";
import { tabAbi } from "@/lib/botchain/abi";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { describeError } from "@/lib/errors";

export interface ForgiveFormProps {
  debtor: Address;
  owedAmount: bigint;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function ForgiveForm({
  debtor,
  owedAmount,
  onSuccess,
  onCancel,
}: ForgiveFormProps) {
  const chainId = useChainId();
  const contractAddress = isBotChainId(chainId)
    ? (getDeployment(chainId)?.address as Address | undefined)
    : undefined;

  const defaultAmountStr = formatEther(owedAmount);
  const [forgiveAmountStr, setForgiveAmountStr] = useState(defaultAmountStr);
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

  let forgiveWei = 0n;
  let remainingWei = owedAmount;
  let isValidAmount = false;

  try {
    if (forgiveAmountStr && !isNaN(Number(forgiveAmountStr)) && Number(forgiveAmountStr) > 0) {
      forgiveWei = parseEther(forgiveAmountStr);
      if (forgiveWei > 0n && forgiveWei <= owedAmount) {
        remainingWei = owedAmount - forgiveWei;
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
      functionName: "forgive",
      args: [debtor, forgiveWei],
    });
  };

  // Rule 1: stage === "confirmed" FIRST
  if (stage === "confirmed") {
    return (
      <div className="bg-[#FFF9F4] border-2 border-[#B8371F] p-5 rounded-[2px] flex flex-col gap-3 font-mono">
        <div className="flex items-center justify-between">
          <span className="inked-stamp text-[#B8371F] border-[#B8371F]">
            FORGIVEN
          </span>
          <span className="text-xs text-[#7A5646]">
            TX: {hash ? `${hash.slice(0, 8)}…` : "CONFIRMED"}
          </span>
        </div>
        <p className="text-sm font-semibold text-[#3A1F14]">
          Forgave {forgiveAmountStr} BOT of debt.
        </p>
        <p className="text-xs text-[#7A5646]">
          Remaining debt owed to you: {formatEther(remainingWei)} BOT.
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
      className="bg-[#FFF9F4] border border-[#7A5646] p-4 sm:p-5 rounded-[2px] flex flex-col gap-4 font-mono text-xs"
    >
      <div className="flex items-center justify-between border-b border-[#E8C9B8] pb-2">
        <span className="font-bold text-[#3A1F14] uppercase tracking-wide">
          FORGIVE DEBT
        </span>
        <span className="text-[#7A5646]">
          THEY OWE: {formatEther(owedAmount)} BOT
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-[#7A5646] uppercase">AMOUNT TO FORGIVE (BOT)</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForgiveAmountStr(formatEther(owedAmount))}
              className="text-[10px] text-[#B8371F] underline cursor-pointer hover:text-[#942B17]"
            >
              Forgive All
            </button>
            <button
              type="button"
              onClick={() => setForgiveAmountStr(formatEther(owedAmount / 2n))}
              className="text-[10px] text-[#7A5646] underline cursor-pointer hover:text-[#3A1F14]"
            >
              Forgive Half
            </button>
          </div>
        </div>

        <input
          type="text"
          value={forgiveAmountStr}
          onChange={(e) => setForgiveAmountStr(e.target.value)}
          placeholder="0.0"
          className="w-full px-3 py-2 bg-white border border-[#E8C9B8] text-[#3A1F14] text-sm font-bold outline-none focus:border-[#B8371F] rounded-[2px]"
        />

        <div className="flex items-center justify-between text-[11px] text-[#7A5646]">
          <span>Debt remaining after forgiveness:</span>
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
            ? "Forgiving…"
            : `Forgive ${forgiveAmountStr || "0"} BOT`}
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
