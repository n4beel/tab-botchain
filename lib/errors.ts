import { BaseError, ContractFunctionRevertedError, formatEther } from "viem";

export interface RevertDetails {
  errorName?: string;
  args?: readonly unknown[];
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Traverses an error to extract the custom revert error name and arguments.
 */
export function extractRevert(err: unknown): RevertDetails | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  // Direct property check
  if (
    "data" in err &&
    (err as any).data &&
    typeof (err as any).data === "object" &&
    (err as any).data.errorName
  ) {
    return {
      errorName: (err as any).data.errorName,
      args: (err as any).data.args,
    };
  }
  if ("errorName" in err && typeof (err as any).errorName === "string") {
    return {
      errorName: (err as any).errorName,
      args: (err as any).args,
    };
  }

  // If it's a viem BaseError, use walk
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => {
      if (e instanceof ContractFunctionRevertedError) return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "data" in e &&
        Boolean((e as any).data?.errorName)
      )
        return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "errorName" in e &&
        Boolean((e as any).errorName)
      )
        return true;
      return false;
    });

    if (reverted) {
      const errorObj = reverted as any;
      if (errorObj.data?.errorName) {
        return {
          errorName: errorObj.data.errorName,
          args: errorObj.data.args,
        };
      }
      if (errorObj.errorName) {
        return {
          errorName: errorObj.errorName,
          args: errorObj.args,
        };
      }
    }
  }

  return undefined;
}

/**
 * Checks whether an error represents the user rejecting the prompt in their wallet.
 */
export function isUserRejection(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("User rejected") ||
    msg.includes("User denied") ||
    msg.includes("user rejected") ||
    msg.includes("ACTION_REJECTED") ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 4001)
  );
}

/**
 * Translates contract and client errors into dry, plain bookkeeping copy.
 */
export function describeError(err: unknown): string {
  if (isUserRejection(err)) {
    return "Transaction cancelled in wallet.";
  }

  const rev = extractRevert(err);
  if (rev?.errorName) {
    switch (rev.errorName) {
      case "BadParty":
        return "Choose someone other than yourself.";
      case "ZeroAmount":
        return "An entry needs an amount.";
      case "NoteTooLong": {
        const len = rev.args?.[0];
        const max = rev.args?.[1];
        if (len !== undefined && max !== undefined) {
          return `Notes run to ${max} bytes; yours is ${len}.`;
        }
        return "Note exceeds 140 bytes.";
      }
      case "NoSuchProposal":
        return "Entry proposal not found.";
      case "NotCounterparty": {
        const caller = rev.args?.[1];
        const short = typeof caller === "string" ? shortAddress(caller) : "the counterparty";
        return `Only ${short} can answer this entry.`;
      }
      case "NotProposer":
        return "Only the proposer can withdraw this entry.";
      case "NotPending": {
        const state = rev.args?.[1];
        const stateName =
          state === 1 ? "confirmed" : state === 2 ? "declined" : state === 3 ? "withdrawn" : "decided";
        return `This entry has already been ${stateName}.`;
      }
      case "NothingOwed":
        return "There's nothing owed in that direction.";
      case "BadPayment": {
        const owed = rev.args?.[0];
        const sent = rev.args?.[1];
        if (owed !== undefined && sent !== undefined) {
          const owedEth = typeof owed === "bigint" ? formatEther(owed) : String(owed);
          const sentEth = typeof sent === "bigint" ? formatEther(sent) : String(sent);
          return `You owe ${owedEth} BOT; you tried to pay ${sentEth} BOT.`;
        }
        return "Payment must be between 1 wei and the balance owed.";
      }
      case "ForgiveTooMuch": {
        const owed = rev.args?.[0];
        const req = rev.args?.[1];
        if (owed !== undefined && req !== undefined) {
          const owedEth = typeof owed === "bigint" ? formatEther(owed) : String(owed);
          return `They only owe ${owedEth} BOT. You can forgive up to that.`;
        }
        return "Cannot forgive more than the amount owed.";
      }
      case "NothingToWithdraw":
        return "Nothing to collect.";
      case "TransferFailed":
        return "BOT transfer failed.";
      case "Reentrancy":
        return "Reentrant call detected.";
      default:
        return `Contract error: ${rev.errorName}`;
    }
  }

  if (err instanceof Error) {
    return err.message;
  }
  return "An unexpected error occurred.";
}
