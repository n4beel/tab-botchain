import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { tabAbi } from "@/lib/botchain/abi";
import { buildStatement, loadStatement } from "@/lib/tab";
import { MAX_NOTE_BYTES, MAX_PAGE } from "@/lib/limits";

const PORT = 8609;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

const MNEMONIC = "test test test test test test test test test test test junk";
const accounts = Array.from({ length: 6 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: PublicClient;
let wallets: any[];
let tabAddress: Address;

function revertDetails(
  err: unknown
): { errorName?: string; args?: readonly unknown[] } | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName)
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data;
}

beforeAll(async () => {
  node = spawn(
    "anvil",
    ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"],
    {
      stdio: ["ignore", "ignore", "inherit"],
    }
  );

  publicClient = createPublicClient({ chain: local, transport: http() }) as PublicClient;
  wallets = accounts.map((acc) =>
    createWalletClient({ account: acc, chain: local, transport: http() })
  );

  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Deploy Tab contract
  const tabArtifact = JSON.parse(
    readFileSync("contracts/out/Tab.sol/Tab.json", "utf8")
  ) as { abi: any; bytecode: { object: Hex } };

  const tabDeployHash = await wallets[0].deployContract({
    abi: tabArtifact.abi,
    bytecode: tabArtifact.bytecode.object,
    args: [],
  });
  const tabReceipt = await publicClient.waitForTransactionReceipt({
    hash: tabDeployHash,
  });
  tabAddress = tabReceipt.contractAddress!;
}, 30000);

afterAll(() => {
  if (node && !node.killed) {
    node.kill();
  }
});

describe("Tab integration on Anvil", () => {
  it("deploys Tab contract with code", async () => {
    const code = await publicClient.getBytecode({ address: tabAddress });
    expect(code).toBeDefined();
    expect(code?.length).toBeGreaterThan(2);
  });

  it("checks constants match limits.ts", async () => {
    const maxNote = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "MAX_NOTE_BYTES",
    });
    expect(maxNote).toBe(BigInt(MAX_NOTE_BYTES));

    const maxPage = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "MAX_PAGE",
    });
    expect(maxPage).toBe(BigInt(MAX_PAGE));
  });

  it("propose and confirm an entry: proposer owes other", async () => {
    const alice = wallets[0];
    const bob = wallets[1];

    // Alice: "I owe Bob 1 BOT"
    const hash = await alice.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "propose",
      args: [bob.account.address, false, parseEther("1.0"), "Coffee"],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    // Check proposal state
    const prop = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "proposalOf",
      args: [1n],
    });
    expect(prop.id).toBe(1n);
    expect(prop.amount).toBe(parseEther("1.0"));
    expect(prop.proposerIsOwed).toBe(false);
    expect(prop.state).toBe(0); // Pending

    // Bob confirms
    const confirmHash = await bob.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "confirm",
      args: [1n],
    });
    const confirmReceipt = await publicClient.waitForTransactionReceipt({ hash: confirmHash });
    expect(confirmReceipt.status).toBe("success");

    // Check balances
    // Alice owes Bob 1 BOT => balanceBetween(Alice, Bob) = -1 BOT
    const balAliceBob = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "balanceBetween",
      args: [alice.account.address, bob.account.address],
    });
    expect(balAliceBob).toBe(-parseEther("1.0"));

    const balBobAlice = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "balanceBetween",
      args: [bob.account.address, alice.account.address],
    });
    expect(balBobAlice).toBe(parseEther("1.0"));
  });

  it("propose and confirm an entry: other owes proposer (netting)", async () => {
    const alice = wallets[0];
    const bob = wallets[1];

    // Alice: "Bob owes me 2.5 BOT" (proposerIsOwed: true)
    const hash = await alice.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "propose",
      args: [bob.account.address, true, parseEther("2.5"), "Dinner"],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    // Bob confirms
    const confirmHash = await bob.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "confirm",
      args: [2n],
    });
    await publicClient.waitForTransactionReceipt({ hash: confirmHash });

    // Net balance: Bob owed 1 BOT from Alice, now owes 2.5 BOT to Alice => Bob net owes Alice 1.5 BOT
    const balAliceBob = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "balanceBetween",
      args: [alice.account.address, bob.account.address],
    });
    expect(balAliceBob).toBe(parseEther("1.5"));
  });

  it("reject a proposal", async () => {
    const alice = wallets[0];
    const bob = wallets[1];

    const hash = await alice.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "propose",
      args: [bob.account.address, true, parseEther("5.0"), "Erroneous charge"],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const rejectHash = await bob.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "reject",
      args: [3n],
    });
    await publicClient.waitForTransactionReceipt({ hash: rejectHash });

    const prop = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "proposalOf",
      args: [3n],
    });
    expect(prop.state).toBe(2); // Rejected

    // Balance remains 1.5 BOT
    const balAliceBob = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "balanceBetween",
      args: [alice.account.address, bob.account.address],
    });
    expect(balAliceBob).toBe(parseEther("1.5"));
  });

  it("withdraw a proposal by proposer", async () => {
    const alice = wallets[0];
    const bob = wallets[1];

    const hash = await alice.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "propose",
      args: [bob.account.address, true, parseEther("0.1"), "Mistake"],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const withdrawHash = await alice.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "withdrawProposal",
      args: [4n],
    });
    await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

    const prop = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "proposalOf",
      args: [4n],
    });
    expect(prop.state).toBe(3); // Withdrawn
  });

  it("settle partial amount", async () => {
    const alice = wallets[0];
    const bob = wallets[1];

    // Bob owes Alice 1.5 BOT. Bob settles 0.5 BOT.
    const hash = await bob.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "settle",
      args: [alice.account.address],
      value: parseEther("0.5"),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    // Alice is now owed 1.0 BOT
    const balAliceBob = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "balanceBetween",
      args: [alice.account.address, bob.account.address],
    });
    expect(balAliceBob).toBe(parseEther("1.0"));

    // Alice has 0.5 BOT pending withdrawal
    const pendingAlice = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "pending",
      args: [alice.account.address],
    });
    expect(pendingAlice).toBe(parseEther("0.5"));
  });

  it("forgive partial amount", async () => {
    const alice = wallets[0];
    const bob = wallets[1];

    // Alice forgives 0.25 BOT of Bob's debt
    const hash = await alice.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "forgive",
      args: [bob.account.address, parseEther("0.25")],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    // Alice is now owed 0.75 BOT
    const balAliceBob = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "balanceBetween",
      args: [alice.account.address, bob.account.address],
    });
    expect(balAliceBob).toBe(parseEther("0.75"));
  });

  it("settle full remaining amount", async () => {
    const alice = wallets[0];
    const bob = wallets[1];

    // Bob settles remaining 0.75 BOT
    const hash = await bob.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "settle",
      args: [alice.account.address],
      value: parseEther("0.75"),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    // Balance is now 0 (Square)
    const balAliceBob = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "balanceBetween",
      args: [alice.account.address, bob.account.address],
    });
    expect(balAliceBob).toBe(0n);

    // Alice has 0.5 + 0.75 = 1.25 BOT pending
    const pendingAlice = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "pending",
      args: [alice.account.address],
    });
    expect(pendingAlice).toBe(parseEther("1.25"));
  });

  it("loadStatement and buildStatement computes matching running balance", async () => {
    const alice = wallets[0];
    const bob = wallets[1];

    const { statement, balance } = await loadStatement(
      publicClient,
      tabAddress,
      alice.account.address,
      bob.account.address
    );

    expect(balance).toBe(0n);
    expect(statement.length).toBeGreaterThan(0);
    const finalEntry = statement[statement.length - 1];
    expect(finalEntry.runningBalance).toBe(balance);
  });

  it("withdraw collected settlement funds", async () => {
    const alice = wallets[0];

    const balBefore = await publicClient.getBalance({ address: alice.account.address });

    const hash = await alice.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "withdraw",
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const balAfter = await publicClient.getBalance({ address: alice.account.address });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;
    expect(balAfter + gasUsed - balBefore).toBe(parseEther("1.25"));

    const pendingAlice = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "pending",
      args: [alice.account.address],
    });
    expect(pendingAlice).toBe(0n);
  });

  it("ledgerOf pagination and peerCount", async () => {
    const alice = wallets[0];
    const charlie = wallets[2];

    // Create entry between Alice and Charlie to link them
    const hash = await alice.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "propose",
      args: [charlie.account.address, true, parseEther("3.0"), "Supplies"],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const confHash = await charlie.writeContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "confirm",
      args: [5n],
    });
    await publicClient.waitForTransactionReceipt({ hash: confHash });

    const peerCount = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "peerCount",
      args: [alice.account.address],
    });
    expect(peerCount).toBe(2n); // Bob and Charlie

    const page1 = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "ledgerOf",
      args: [alice.account.address, 0n, 1n],
    });
    expect(page1[0]).toHaveLength(1);
    expect(page1[0][0].toLowerCase()).toBe(wallets[1].account.address.toLowerCase());

    const page2 = await publicClient.readContract({
      address: tabAddress,
      abi: tabAbi,
      functionName: "ledgerOf",
      args: [alice.account.address, 1n, 1n],
    });
    expect(page2[0]).toHaveLength(1);
    expect(page2[0][0].toLowerCase()).toBe(charlie.account.address.toLowerCase());
    expect(page2[1][0]).toBe(parseEther("3.0"));
  });

  it("reverts on custom errors with expected names", async () => {
    const alice = wallets[0];
    const bob = wallets[1];

    // BadParty: propose with self
    try {
      await alice.writeContract({
        address: tabAddress,
        abi: tabAbi,
        functionName: "propose",
        args: [alice.account.address, true, parseEther("1.0"), "Self"],
      });
      expect.fail("Should have reverted");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("BadParty");
    }

    // ZeroAmount: propose with 0 amount
    try {
      await alice.writeContract({
        address: tabAddress,
        abi: tabAbi,
        functionName: "propose",
        args: [bob.account.address, true, 0n, "Zero"],
      });
      expect.fail("Should have reverted");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("ZeroAmount");
    }

    // NoteTooLong: note > 140 bytes
    try {
      const longNote = "a".repeat(141);
      await alice.writeContract({
        address: tabAddress,
        abi: tabAbi,
        functionName: "propose",
        args: [bob.account.address, true, parseEther("1.0"), longNote],
      });
      expect.fail("Should have reverted");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("NoteTooLong");
    }

    // NothingOwed: Bob tries to settle Alice when balance is 0
    try {
      await bob.writeContract({
        address: tabAddress,
        abi: tabAbi,
        functionName: "settle",
        args: [alice.account.address],
        value: parseEther("1.0"),
      });
      expect.fail("Should have reverted");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("NothingOwed");
    }

    // NothingToWithdraw: Bob calls withdraw when pending is 0
    try {
      await bob.writeContract({
        address: tabAddress,
        abi: tabAbi,
        functionName: "withdraw",
      });
      expect.fail("Should have reverted");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("NothingToWithdraw");
    }
  });
});
