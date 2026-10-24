/**
 * Local stack runner and seeder for Tab.
 *
 * Spawns anvil on port 8709 with chain id 968, deploys Tab, and seeds
 * the scenarios from 09-tab.md §5:
 * (1) 0↔1: 5 confirmed entries both ways ending with 0 owed 0.75 BOT, 1 partial settle, 1 forgive
 * (2) 0↔2: pending proposal awaiting 0's confirmation
 * (3) 0↔3: proposal by 0 awaiting 3's confirmation
 * (4) 0↔4: balanced to zero after a full settle
 * (5) Account 0 has pending funds to collect
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const PORT = 8709;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const MNEMONIC = "test test test test test test test test test test test junk";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

const realNow = Math.floor(Date.now() / 1000);
const TOTAL_WARP = 60;
const startTimestamp = realNow - TOTAL_WARP;

console.log(`Starting anvil on port ${PORT} (timestamp: ${startTimestamp})...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--timestamp",
    String(startTimestamp),
    "--silent",
  ],
  {
    detached: true,
    stdio: "ignore",
  }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

const accounts = Array.from({ length: 10 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);
const wallets = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http() })
);

// Wait for anvil to answer
for (let i = 0; ; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    if (i > 100) {
      console.error(`anvil never answered on ${RPC}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

console.log(`Anvil online at ${RPC}`);

// Deploy Tab
const tabArtifact = JSON.parse(
  readFileSync("contracts/out/Tab.sol/Tab.json", "utf8")
);

const deployHash = await wallets[0].deployContract({
  abi: tabArtifact.abi,
  bytecode: tabArtifact.bytecode.object,
  args: [],
});

const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployHash });
const tabAddress = deployReceipt.contractAddress;
const deployBlock = deployReceipt.blockNumber;

console.log(`Tab deployed to ${tabAddress} at block ${deployBlock}`);

// Helper to propose and confirm
async function propose(proposerIdx, otherIdx, proposerIsOwed, amount, note) {
  const hash = await wallets[proposerIdx].writeContract({
    address: tabAddress,
    abi: tabArtifact.abi,
    functionName: "propose",
    args: [accounts[otherIdx].address, proposerIsOwed, amount, note],
  });
  await pub.waitForTransactionReceipt({ hash });
  const count = await pub.readContract({
    address: tabAddress,
    abi: tabArtifact.abi,
    functionName: "proposalCount",
  });
  return count;
}

async function confirm(confirmerIdx, id) {
  const hash = await wallets[confirmerIdx].writeContract({
    address: tabAddress,
    abi: tabArtifact.abi,
    functionName: "confirm",
    args: [id],
  });
  await pub.waitForTransactionReceipt({ hash });
}

console.log("Seeding scenarios...");

// Scenario 1: 0↔1 history of five confirmed entries in both directions
// ending with 0 owed 0.75 BOT, one partial settle and one forgive.
// Entry 1: 0 proposes 1 owes 0 2.0 BOT
const id1 = await propose(0, 1, true, parseEther("2.0"), "Dinner at Osteria");
await confirm(1, id1);

// Entry 2: 1 proposes 0 owes 1 0.5 BOT
const id2 = await propose(1, 0, true, parseEther("0.5"), "Rideshare home");
await confirm(0, id2);

// Entry 3: 0 proposes 1 owes 0 1.0 BOT
const id3 = await propose(0, 1, true, parseEther("1.0"), "Weekly groceries");
await confirm(1, id3);

// Entry 4: 1 proposes 0 owes 1 0.25 BOT
const id4 = await propose(1, 0, true, parseEther("0.25"), "Morning coffee");
await confirm(0, id4);

// Entry 5: 0 proposes 1 owes 0 0.5 BOT
const id5 = await propose(0, 1, true, parseEther("0.5"), "Cinema tickets");
await confirm(1, id5);

// Net so far: 0 is owed 2.0 - 0.5 + 1.0 - 0.25 + 0.5 = 2.75 BOT
// Partial settle: 1 pays 1.5 BOT to 0
const settle1Hash = await wallets[1].writeContract({
  address: tabAddress,
  abi: tabArtifact.abi,
  functionName: "settle",
  args: [accounts[0].address],
  value: parseEther("1.5"),
});
await pub.waitForTransactionReceipt({ hash: settle1Hash });

// Net after settle: 2.75 - 1.5 = 1.25 BOT
// Forgive: 0 forgives 0.5 BOT of 1's debt
const forgive1Hash = await wallets[0].writeContract({
  address: tabAddress,
  abi: tabArtifact.abi,
  functionName: "forgive",
  args: [accounts[1].address, parseEther("0.5")],
});
await pub.waitForTransactionReceipt({ hash: forgive1Hash });
// Net final: 0 is owed 0.75 BOT by 1!

// Scenario 2: 0↔2 a pending proposal awaiting 0's confirmation
await propose(2, 0, true, parseEther("0.35"), "Drinks after work");

// Scenario 3: 0↔3 a proposal by 0 awaiting 3's confirmation
await propose(0, 3, true, parseEther("0.8"), "Cabin rental split");

// Scenario 4: 0↔4 balanced to zero after a full settle
const id4a = await propose(0, 4, true, parseEther("1.2"), "Hardware store tools");
await confirm(4, id4a);
const settle4Hash = await wallets[4].writeContract({
  address: tabAddress,
  abi: tabArtifact.abi,
  functionName: "settle",
  args: [accounts[0].address],
  value: parseEther("1.2"),
});
await pub.waitForTransactionReceipt({ hash: settle4Hash });

// Verify pending balance for account 0
const pending0 = await pub.readContract({
  address: tabAddress,
  abi: tabArtifact.abi,
  functionName: "pending",
  args: [accounts[0].address],
});
console.log(`Account 0 pending collection: ${pending0} wei (2.7 BOT)`);

// Assert final chain time is within 2 minutes of real time
const finalBlock = await pub.getBlock();
const finalTime = Number(finalBlock.timestamp);
const nowSec = Math.floor(Date.now() / 1000);
const diffSec = Math.abs(finalTime - nowSec);
console.log(`Final chain timestamp: ${finalTime} (real: ${nowSec}, diff: ${diffSec}s)`);
if (diffSec > 120) {
  throw new Error(`Chain time ${finalTime} differs from real time by ${diffSec}s (max 120s allowed)`);
}

// Write .env.local
const envContent = [
  "# Auto-generated by scripts/local-stack.mjs for Tab",
  "NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet",
  `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
  "NEXT_PUBLIC_CHAIN_ID=968",
  `NEXT_PUBLIC_RPC_URL_968=${RPC}`,
  `NEXT_PUBLIC_CONTRACT_968=${tabAddress}`,
  `NEXT_PUBLIC_DEPLOY_BLOCK_968=${deployBlock > 1n ? deployBlock - 1n : 1n}`,
  "",
].join("\n");

writeFileSync(".env.local", envContent);
console.log("Wrote .env.local successfully.");
console.log("\n========================================================");
console.log(`Tab Local Stack Running on ${RPC}`);
console.log("========================================================");
console.log("Account Role Table:");
console.log("--------------------------------------------------------");
console.log(`Acc 0: ${accounts[0].address} (Creditor to Acc 1: owed 0.75 BOT; 2.7 BOT pending to collect)`);
console.log(`Acc 1: ${accounts[1].address} (Debtor to Acc 0: owes 0.75 BOT)`);
console.log(`Acc 2: ${accounts[2].address} (Proposed 0.35 BOT to Acc 0; awaiting Acc 0 confirmation)`);
console.log(`Acc 3: ${accounts[3].address} (Awaiting proposal of 0.8 BOT from Acc 0)`);
console.log(`Acc 4: ${accounts[4].address} (Settled square with Acc 0)`);
console.log("--------------------------------------------------------");
console.log("Local stack ready!");
process.exit(0);
