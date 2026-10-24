# Handover — Tab

## What was built
- **Smart Contract (`contracts/src/Tab.sol`):**
  - Bilateral shared ledger engine on BOT Chain with consent-based entries.
  - Packed `Proposal` storage (2 slots per proposal) and symmetric pairwise storage mapping `_net[lo][hi]` (positive = hi owes lo).
  - Strict mathematical antisymmetry: `balanceBetween(a, b) == -balanceBetween(b, a)` holds for any pair in any state.
  - First-time confirmation links peers into both parties' counterparty lists (`_peers[a]`, `_peers[b]`).
  - Native BOT settlements accrue into `pending[creditor]` (pull payments) and reduce debt without allowing crossing past zero.
  - Non-reentrant CEI patterns for settlements, forgiveness, and withdrawals.
  - Custom errors with full contextual parameters and zero compiler warnings in `src/`.
- **Foundry Test Suite (`contracts/test/Tab.t.sol`):**
  - 16 passed tests, 0 failed, 0 skipped.
  - Stateful invariant test `invariant_BalanceEqualsPending`: 256 runs, 128,000 calls across `TabHandler` with 0 reverts, proving `address(tab).balance == Σ pending[*]`.
  - 256 fuzz runs on `testFuzz_AntisymmetryAndConservation`.
  - Gas ceilings verified for propose (<180k), confirm (<160k), settle (<75k), and withdraw (<65k).
- **TypeScript Library (`lib/tab.ts`, `lib/limits.ts`, `lib/errors.ts`, `lib/botchain/abi.ts`):**
  - `tabAbi as const` with all 14 functions, 7 events, and 12 custom errors.
  - `signedFor(viewer, a, b, balance)` converting pairwise sign conventions to viewer perspective.
  - `formatSigned(amount)` formatting signed numbers with brackets for negative values (`(0.2500) BOT`).
  - `buildStatement(proposals, settles, forgives, viewer, peer, expectedBalance)` merging logs chronologically and computing running balance, verified against contract `balanceBetween`.
  - `loadStatement(client, address, viewer, peer)` fetching and reconstructing statements directly from event logs.
  - `describeError()` translating all 12 custom errors into bookkeeping sentences.
- **Integration Tests & Local Stack (`test/integration/tab.test.ts`, `scripts/local-stack.mjs`):**
  - 17 integration tests on port 8609 (chain 968) checking propose/confirm/netting, proposal rejection, withdrawal, partial settle, full settle, forgiveness, pull collection, statement reconstruction balance equality, pagination, and custom error decoding.
  - Local stack runner on port 8709 seeding 5 accounts:
    1. `0↔1`: 5 confirmed entries both ways ending with 0 owed 0.75 BOT, 1 partial settle, 1 forgive.
    2. `0↔2`: pending proposal awaiting 0's confirmation.
    3. `0↔3`: proposal by 0 awaiting 3's confirmation.
    4. `0↔4`: balanced to zero after full settle.
    5. Account 0 has 2.7 BOT pending to collect.
- **Frontend & Archetype L Ledger (`components/layout/PageShell.tsx`, `components/tab/`, `app/`):**
  - Physical bound ledger aesthetic: peach ground (`#FFE3D3`), laid parchment (`#FFF6EE`), brown ink (`#3A1F14`), red ink accent (`#B8371F`), 28px ruled hairlines, and margin lines.
  - Two-page spread on desktop (left 38%, right 62%) with center gutter shadow and leather-like edge bookmark tabs (Ledger · Waiting · New Entry).
  - Collapses to a single-page view on mobile with "← Ledger" back affordance.
  - Screens:
    - `/`: Ledger directory with net position, counterparty balances with dotted leaders, collect banner, and public address lookup.
    - `/with/[address]`: Bilateral pair statement with running balance column, inked stamp badges, and settle / forgive actions.
    - `/waiting`: Decision inbox for inbound and outbound proposals.
    - `/new`: Bilateral entry creation with live preview of counterparty view.

## Verification Commands and Test Counts

```bash
# 1. Forge build & test
cd contracts && forge build --force && forge test -vv
# Result: 16 passed; 0 failed; 0 skipped; 256 fuzz runs; 128,000 invariant calls; 0 warnings

# 2. TypeScript typecheck
npm run typecheck
# Result: clean, 0 errors

# 3. Frontend unit tests & linting
npm test
# Result: 65 passed (10 test files), 0 failed; hook-deps lint passes

# 4. Integration tests on Anvil
npm run test:integration
# Result: 17 passed (2 test files: abi-matches-contract & tab.test.ts)

# 5. Production build
npm run build
# Result: ✓ Compiled successfully; all 5 routes prerendered / dynamic

# 6. Distinctness check
python3 ../scripts/check-distinct.py tab
# Result: 24 projects compared; 0 pair/file problem(s)
```

## Known Limits & Invariants
- Debt balances cannot cross zero on settlement: paying more than owed reverts `BadPayment`.
- Netting is strictly pairwise; multi-party circular settlements require mutual individual pairwise settlement.
- A proposal does not alter state until confirmed by the counterparty.
