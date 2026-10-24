import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import {
  buildStatement,
  formatSigned,
  ForgiveRecord,
  ProposalRecord,
  SettleRecord,
  signedFor,
} from "../tab";

const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";
const CHARLIE = "0x3333333333333333333333333333333333333333";

describe("signedFor", () => {
  it("computes creditor perspective for party A", () => {
    const res = signedFor(ALICE, ALICE, BOB, parseEther("1.5"));
    expect(res.role).toBe("creditor");
    expect(res.text).toBe("They owe you");
    expect(res.amount).toBe(parseEther("1.5"));
    expect(res.isOwed).toBe(true);
  });

  it("computes debtor perspective for party A", () => {
    const res = signedFor(ALICE, ALICE, BOB, -parseEther("0.75"));
    expect(res.role).toBe("debtor");
    expect(res.text).toBe("You owe");
    expect(res.amount).toBe(parseEther("0.75"));
    expect(res.isOwed).toBe(false);
  });

  it("computes debtor perspective for party B", () => {
    // balanceBetween(A, B) > 0 means B owes A
    const res = signedFor(BOB, ALICE, BOB, parseEther("1.5"));
    expect(res.role).toBe("debtor");
    expect(res.text).toBe("You owe");
    expect(res.amount).toBe(parseEther("1.5"));
    expect(res.isOwed).toBe(false);
  });

  it("computes creditor perspective for party B", () => {
    // balanceBetween(A, B) < 0 means A owes B
    const res = signedFor(BOB, ALICE, BOB, -parseEther("2.0"));
    expect(res.role).toBe("creditor");
    expect(res.text).toBe("They owe you");
    expect(res.amount).toBe(parseEther("2.0"));
    expect(res.isOwed).toBe(true);
  });

  it("handles zero balance as Square", () => {
    const res = signedFor(ALICE, ALICE, BOB, 0n);
    expect(res.role).toBe("square");
    expect(res.text).toBe("Square");
    expect(res.amount).toBe(0n);
  });

  it("handles observer perspective", () => {
    const res = signedFor(CHARLIE, ALICE, BOB, parseEther("1.0"));
    expect(res.role).toBe("observer");
    expect(res.isOwed).toBe(true);
  });
});

describe("formatSigned", () => {
  it("formats positive amount without brackets", () => {
    const { formatted, isNegative } = formatSigned(parseEther("1.25"));
    expect(formatted).toBe("1.2500 BOT");
    expect(isNegative).toBe(false);
  });

  it("formats negative amount in brackets", () => {
    const { formatted, isNegative } = formatSigned(-parseEther("0.25"));
    expect(formatted).toBe("(0.2500) BOT");
    expect(isNegative).toBe(true);
  });

  it("formats zero", () => {
    const { formatted, isNegative } = formatSigned(0n);
    expect(formatted).toBe("0.0000 BOT");
    expect(isNegative).toBe(false);
  });
});

describe("buildStatement", () => {
  it("returns empty list if no entries exist", () => {
    const statement = buildStatement([], [], [], ALICE, BOB, 0n);
    expect(statement).toEqual([]);
  });

  it("filters out unrelated third party events", () => {
    const proposals: ProposalRecord[] = [
      {
        id: 1n,
        proposer: ALICE,
        other: CHARLIE,
        proposerIsOwed: true,
        amount: parseEther("1.0"),
        note: "Not for Bob",
        confirmedBlock: 100n,
        logIndex: 0,
      },
    ];
    const statement = buildStatement(proposals, [], [], ALICE, BOB, 0n);
    expect(statement).toHaveLength(0);
  });

  it("builds running statement with netting, partial settle, and forgiveness", () => {
    // 1. Alice proposes "Bob owes me 2 BOT" (proposerIsOwed: true)
    const p1: ProposalRecord = {
      id: 1n,
      proposer: ALICE,
      other: BOB,
      proposerIsOwed: true,
      amount: parseEther("2.0"),
      note: "Groceries",
      confirmedBlock: 100n,
      logIndex: 0,
    };

    // 2. Bob proposes "I owe Alice another 1 BOT" (proposerIsOwed: false)
    const p2: ProposalRecord = {
      id: 2n,
      proposer: BOB,
      other: ALICE,
      proposerIsOwed: false,
      amount: parseEther("1.0"),
      note: "Dinner",
      confirmedBlock: 101n,
      logIndex: 0,
    };

    // 3. Alice proposes "I owe Bob 0.5 BOT" (netting against debt: proposerIsOwed: false)
    const p3: ProposalRecord = {
      id: 3n,
      proposer: ALICE,
      other: BOB,
      proposerIsOwed: false,
      amount: parseEther("0.5"),
      note: "Coffee reimbursement",
      confirmedBlock: 102n,
      logIndex: 0,
    };

    // 4. Bob settles 1.0 BOT
    const s1: SettleRecord = {
      debtor: BOB,
      creditor: ALICE,
      amount: parseEther("1.0"),
      remaining: parseEther("1.5"),
      blockNumber: 103n,
      logIndex: 0,
    };

    // 5. Alice forgives 0.5 BOT
    const f1: ForgiveRecord = {
      creditor: ALICE,
      debtor: BOB,
      amount: parseEther("0.5"),
      remaining: parseEther("1.0"),
      blockNumber: 104n,
      logIndex: 0,
    };

    // View from Alice (creditor)
    const statementAlice = buildStatement(
      [p1, p2, p3],
      [s1],
      [f1],
      ALICE,
      BOB,
      parseEther("1.0")
    );

    expect(statementAlice).toHaveLength(5);

    // Entry 1: +2.0 => running 2.0
    expect(statementAlice[0].delta).toBe(parseEther("2.0"));
    expect(statementAlice[0].runningBalance).toBe(parseEther("2.0"));

    // Entry 2: +1.0 => running 3.0
    expect(statementAlice[1].delta).toBe(parseEther("1.0"));
    expect(statementAlice[1].runningBalance).toBe(parseEther("3.0"));

    // Entry 3: -0.5 => running 2.5
    expect(statementAlice[2].delta).toBe(-parseEther("0.5"));
    expect(statementAlice[2].runningBalance).toBe(parseEther("2.5"));

    // Entry 4: Bob settles 1.0 => delta -1.0 => running 1.5
    expect(statementAlice[3].type).toBe("settle");
    expect(statementAlice[3].delta).toBe(-parseEther("1.0"));
    expect(statementAlice[3].runningBalance).toBe(parseEther("1.5"));

    // Entry 5: Alice forgives 0.5 => delta -0.5 => running 1.0
    expect(statementAlice[4].type).toBe("forgive");
    expect(statementAlice[4].delta).toBe(-parseEther("0.5"));
    expect(statementAlice[4].runningBalance).toBe(parseEther("1.0"));

    // View from Bob (debtor)
    const statementBob = buildStatement(
      [p1, p2, p3],
      [s1],
      [f1],
      BOB,
      ALICE,
      -parseEther("1.0")
    );

    expect(statementBob).toHaveLength(5);
    // Entry 1: Bob owes 2.0 => delta -2.0, running -2.0
    expect(statementBob[0].delta).toBe(-parseEther("2.0"));
    expect(statementBob[0].runningBalance).toBe(-parseEther("2.0"));

    // Entry 2: Bob owes another 1.0 => delta -1.0, running -3.0
    expect(statementBob[1].delta).toBe(-parseEther("1.0"));
    expect(statementBob[1].runningBalance).toBe(-parseEther("3.0"));

    // Entry 3: Alice owes Bob 0.5 => delta +0.5, running -2.5
    expect(statementBob[2].delta).toBe(parseEther("0.5"));
    expect(statementBob[2].runningBalance).toBe(-parseEther("2.5"));

    // Entry 4: Bob settles 1.0 => delta +1.0 (towards zero), running -1.5
    expect(statementBob[3].delta).toBe(parseEther("1.0"));
    expect(statementBob[3].runningBalance).toBe(-parseEther("1.5"));

    // Entry 5: Alice forgives 0.5 => delta +0.5, running -1.0
    expect(statementBob[4].delta).toBe(parseEther("0.5"));
    expect(statementBob[4].runningBalance).toBe(-parseEther("1.0"));
  });
});
