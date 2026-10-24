import { Address, formatEther, getAddress, isAddressEqual, PublicClient } from "viem";
import { tabAbi } from "./botchain/abi";

export const ProposalState = {
  Pending: 0,
  Confirmed: 1,
  Rejected: 2,
  Withdrawn: 3,
} as const;

export type ProposalStateType = (typeof ProposalState)[keyof typeof ProposalState];

export interface ProposalView {
  id: bigint;
  proposer: Address;
  other: Address;
  amount: bigint;
  proposerIsOwed: boolean;
  state: number;
  createdBlock: number;
  note?: string;
}

export interface StatementEntry {
  id: string;
  type: "entry" | "settle" | "forgive";
  blockNumber: bigint;
  logIndex: number;
  timestamp?: number;
  description: string;
  amount: bigint;
  delta: bigint;
  runningBalance: bigint;
  from: Address;
  to: Address;
}

export interface SignedBalance {
  role: "creditor" | "debtor" | "square" | "observer";
  text: string;
  amount: bigint;
  isOwed: boolean;
}

/**
 * Converts contract balanceBetween sign convention into viewer's perspective.
 * In Tab contract, balanceBetween(a, b) > 0 means b owes a.
 * If viewer is a:
 *   balance > 0 => b owes viewer (creditor)
 *   balance < 0 => viewer owes b (debtor)
 *   balance == 0 => square
 * If viewer is b:
 *   balance > 0 => viewer owes a (debtor)
 *   balance < 0 => a owes viewer (creditor)
 *   balance == 0 => square
 */
export function signedFor(
  viewer: Address,
  a: Address,
  b: Address,
  balance: bigint
): SignedBalance {
  const viewerAddr = getAddress(viewer);
  const aAddr = getAddress(a);
  const bAddr = getAddress(b);

  if (isAddressEqual(viewerAddr, aAddr)) {
    if (balance > 0n) {
      return { role: "creditor", text: "They owe you", amount: balance, isOwed: true };
    }
    if (balance < 0n) {
      return { role: "debtor", text: "You owe", amount: -balance, isOwed: false };
    }
    return { role: "square", text: "Square", amount: 0n, isOwed: false };
  }

  if (isAddressEqual(viewerAddr, bAddr)) {
    if (balance > 0n) {
      return { role: "debtor", text: "You owe", amount: balance, isOwed: false };
    }
    if (balance < 0n) {
      return { role: "creditor", text: "They owe you", amount: -balance, isOwed: true };
    }
    return { role: "square", text: "Square", amount: 0n, isOwed: false };
  }

  // Observer
  if (balance > 0n) {
    return {
      role: "observer",
      text: `${bAddr.slice(0, 6)} owes ${aAddr.slice(0, 6)}`,
      amount: balance,
      isOwed: true,
    };
  }
  if (balance < 0n) {
    return {
      role: "observer",
      text: `${aAddr.slice(0, 6)} owes ${bAddr.slice(0, 6)}`,
      amount: -balance,
      isOwed: false,
    };
  }
  return { role: "square", text: "Square", amount: 0n, isOwed: false };
}

/**
 * Formats signed amounts with brackets for negative values, e.g., (0.2500) BOT.
 */
export function formatSigned(balance: bigint, symbol: string = "BOT"): {
  formatted: string;
  isNegative: boolean;
  valueStr: string;
} {
  const isNegative = balance < 0n;
  const absVal = isNegative ? -balance : balance;
  const eth = formatEther(absVal);
  const parts = eth.split(".");
  const integer = parts[0];
  const decimals = parts[1] ? parts[1].slice(0, 4).padEnd(4, "0") : "0000";
  const numStr = `${integer}.${decimals}`;

  if (balance === 0n) {
    return {
      formatted: `0.0000 ${symbol}`,
      isNegative: false,
      valueStr: "0.0000",
    };
  }

  return {
    formatted: isNegative ? `(${numStr}) ${symbol}` : `${numStr} ${symbol}`,
    isNegative,
    valueStr: numStr,
  };
}

export interface ProposalRecord {
  id: bigint;
  proposer: Address;
  other: Address;
  proposerIsOwed: boolean;
  amount: bigint;
  note: string;
  confirmedBlock: bigint;
  logIndex: number;
}

export interface SettleRecord {
  debtor: Address;
  creditor: Address;
  amount: bigint;
  remaining: bigint;
  blockNumber: bigint;
  logIndex: number;
}

export interface ForgiveRecord {
  creditor: Address;
  debtor: Address;
  amount: bigint;
  remaining: bigint;
  blockNumber: bigint;
  logIndex: number;
}

/**
 * Merges confirmed proposals, settlements, and forgiveness events between viewer and peer
 * chronologically and computes the running balance.
 * Returns the statement entries, where delta and runningBalance are from viewer's perspective:
 * positive runningBalance = peer owes viewer
 * negative runningBalance = viewer owes peer
 */
export function buildStatement(
  proposals: ProposalRecord[],
  settles: SettleRecord[],
  forgives: ForgiveRecord[],
  viewer: Address,
  peer: Address,
  expectedBalance?: bigint
): StatementEntry[] {
  const viewerAddr = getAddress(viewer);
  const peerAddr = getAddress(peer);

  const rawEntries: Array<{
    id: string;
    type: "entry" | "settle" | "forgive";
    blockNumber: bigint;
    logIndex: number;
    description: string;
    amount: bigint;
    delta: bigint;
    from: Address;
    to: Address;
  }> = [];

  // 1. Process proposals
  for (const p of proposals) {
    const pProposer = getAddress(p.proposer);
    const pOther = getAddress(p.other);

    const isViewerProposer = isAddressEqual(pProposer, viewerAddr);
    const isViewerOther = isAddressEqual(pOther, viewerAddr);
    const isPeerProposer = isAddressEqual(pProposer, peerAddr);
    const isPeerOther = isAddressEqual(pOther, peerAddr);

    if (
      !(
        (isViewerProposer && isPeerOther) ||
        (isPeerProposer && isViewerOther)
      )
    ) {
      continue;
    }

    // Determine delta from viewer's perspective:
    // If proposerIsOwed: other owes proposer `amount`.
    // If not proposerIsOwed: proposer owes other `amount`.
    let delta = 0n;
    if (p.proposerIsOwed) {
      // other owes proposer
      if (isViewerProposer) {
        // peer owes viewer
        delta = p.amount;
      } else {
        // viewer owes peer
        delta = -p.amount;
      }
    } else {
      // proposer owes other
      if (isViewerProposer) {
        // viewer owes peer
        delta = -p.amount;
      } else {
        // peer owes viewer
        delta = p.amount;
      }
    }

    rawEntries.push({
      id: `prop-${p.id.toString()}`,
      type: "entry",
      blockNumber: p.confirmedBlock,
      logIndex: p.logIndex,
      description: p.note || `Entry #${p.id.toString()}`,
      amount: p.amount,
      delta,
      from: p.proposer,
      to: p.other,
    });
  }

  // 2. Process settlements
  for (const s of settles) {
    const debtor = getAddress(s.debtor);
    const creditor = getAddress(s.creditor);

    const isViewerDebtor = isAddressEqual(debtor, viewerAddr);
    const isViewerCreditor = isAddressEqual(creditor, viewerAddr);
    const isPeerDebtor = isAddressEqual(debtor, peerAddr);
    const isPeerCreditor = isAddressEqual(creditor, peerAddr);

    if (
      !(
        (isViewerDebtor && isPeerCreditor) ||
        (isViewerCreditor && isPeerDebtor)
      )
    ) {
      continue;
    }

    // In a settlement, debtor pays creditor.
    // If viewer is creditor: peer (debtor) pays viewer -> peer owes viewer less (delta = -amount).
    // If viewer is debtor: viewer pays peer (creditor) -> viewer owes peer less (delta = +amount towards 0).
    const delta = isViewerCreditor ? -s.amount : s.amount;

    rawEntries.push({
      id: `settle-${s.blockNumber}-${s.logIndex}`,
      type: "settle",
      blockNumber: s.blockNumber,
      logIndex: s.logIndex,
      description: isViewerDebtor ? "Settled by you" : "Settled by peer",
      amount: s.amount,
      delta,
      from: s.debtor,
      to: s.creditor,
    });
  }

  // 3. Process forgiveness
  for (const f of forgives) {
    const creditor = getAddress(f.creditor);
    const debtor = getAddress(f.debtor);

    const isViewerCreditor = isAddressEqual(creditor, viewerAddr);
    const isViewerDebtor = isAddressEqual(debtor, viewerAddr);
    const isPeerCreditor = isAddressEqual(creditor, peerAddr);
    const isPeerDebtor = isAddressEqual(debtor, peerAddr);

    if (
      !(
        (isViewerCreditor && isPeerDebtor) ||
        (isViewerDebtor && isPeerCreditor)
      )
    ) {
      continue;
    }

    // In forgiveness, creditor forgives debtor.
    // If viewer is creditor: viewer forgives peer -> peer owes viewer less (delta = -amount).
    // If viewer is debtor: peer forgives viewer -> viewer owes peer less (delta = +amount towards 0).
    const delta = isViewerCreditor ? -f.amount : f.amount;

    rawEntries.push({
      id: `forgive-${f.blockNumber}-${f.logIndex}`,
      type: "forgive",
      blockNumber: f.blockNumber,
      logIndex: f.logIndex,
      description: isViewerCreditor ? "Forgiven by you" : "Forgiven by peer",
      amount: f.amount,
      delta,
      from: f.creditor,
      to: f.debtor,
    });
  }

  // Sort chronologically: blockNumber ascending, then logIndex ascending
  rawEntries.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber < b.blockNumber ? -1 : 1;
    }
    return a.logIndex - b.logIndex;
  });

  // Calculate cumulative running balances
  let currentBalance = 0n;
  const statement: StatementEntry[] = rawEntries.map((e) => {
    currentBalance += e.delta;
    return {
      ...e,
      runningBalance: currentBalance,
    };
  });

  if (expectedBalance !== undefined && statement.length > 0) {
    if (currentBalance !== expectedBalance) {
      console.warn(
        `Statement balance mismatch: computed ${currentBalance}, contract reports ${expectedBalance}`
      );
    }
  }

  return statement;
}

/**
 * Loads statement data for two parties by querying on-chain events.
 */
export async function loadStatement(
  client: PublicClient,
  contractAddress: Address,
  viewer: Address,
  peer: Address,
  fromBlock: bigint = 0n
): Promise<{ statement: StatementEntry[]; balance: bigint }> {
  // Read current balance
  const balance = await client.readContract({
    address: contractAddress,
    abi: tabAbi,
    functionName: "balanceBetween",
    args: [viewer, peer],
  });

  // Query Proposed events
  const proposedLogs = await client.getContractEvents({
    address: contractAddress,
    abi: tabAbi,
    eventName: "Proposed",
    fromBlock,
  });

  // Query Confirmed events
  const confirmedLogs = await client.getContractEvents({
    address: contractAddress,
    abi: tabAbi,
    eventName: "Confirmed",
    fromBlock,
  });

  const confirmedMap = new Map<bigint, { blockNumber: bigint; logIndex: number }>();
  for (const log of confirmedLogs) {
    const id = (log.args as { id?: bigint }).id;
    if (id !== undefined) {
      confirmedMap.set(id, {
        blockNumber: log.blockNumber ?? 0n,
        logIndex: log.logIndex ?? 0,
      });
    }
  }

  // Match proposals that were confirmed
  const proposals: ProposalRecord[] = [];
  for (const log of proposedLogs) {
    const args = log.args as {
      id?: bigint;
      proposer?: Address;
      other?: Address;
      proposerIsOwed?: boolean;
      amount?: bigint;
      note?: string;
    };
    if (args.id !== undefined && confirmedMap.has(args.id)) {
      const conf = confirmedMap.get(args.id)!;
      proposals.push({
        id: args.id,
        proposer: args.proposer!,
        other: args.other!,
        proposerIsOwed: args.proposerIsOwed!,
        amount: args.amount!,
        note: args.note || "",
        confirmedBlock: conf.blockNumber,
        logIndex: conf.logIndex,
      });
    }
  }

  // Query Settled events
  const settledLogs = await client.getContractEvents({
    address: contractAddress,
    abi: tabAbi,
    eventName: "Settled",
    fromBlock,
  });

  const settles: SettleRecord[] = settledLogs.map((log) => {
    const args = log.args as {
      debtor?: Address;
      creditor?: Address;
      amount?: bigint;
      remaining?: bigint;
    };
    return {
      debtor: args.debtor!,
      creditor: args.creditor!,
      amount: args.amount!,
      remaining: args.remaining!,
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
    };
  });

  // Query Forgiven events
  const forgivenLogs = await client.getContractEvents({
    address: contractAddress,
    abi: tabAbi,
    eventName: "Forgiven",
    fromBlock,
  });

  const forgives: ForgiveRecord[] = forgivenLogs.map((log) => {
    const args = log.args as {
      creditor?: Address;
      debtor?: Address;
      amount?: bigint;
      remaining?: bigint;
    };
    return {
      creditor: args.creditor!,
      debtor: args.debtor!,
      amount: args.amount!,
      remaining: args.remaining!,
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
    };
  });

  const statement = buildStatement(proposals, settles, forgives, viewer, peer, balance);
  return { statement, balance };
}
