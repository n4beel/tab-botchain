# Tab

Keep the IOUs between friends. Settle in BOT.

Tab is a bilateral shared ledger between two addresses on BOT Chain. Either party can propose an entry ("you owe me 0.5 BOT for dinner"); the other confirms or declines it. Confirmed entries net against each other in a single running balance per pair. When the debtor wants to clear it, they settle in BOT directly. The creditor can also forgive any part.

## Key Properties

- **Consent on both sides:** A proposal changes nothing until the counterparty explicitly confirms it.
- **Antisymmetric pairwise netting:** For every pair, `balanceBetween(a, b) == -balanceBetween(b, a)` holds unconditionally. Netting is automatic.
- **Balance conservation:** `address(this).balance == Σ pending[*]` holds invariant across all states. Settled funds sit in the creditor's pending vault until withdrawn.
- **Non-crossing settle:** Settle never allows paying more than is owed or crossing zero into opposite debt.
- **Pull payments:** Debts settled in BOT are stored in `pending[creditor]` and withdrawn via standard pull payments.

## Archetype L · Ledger Design System

- **Parchment & Ink Palette:**
  - Base ground: `#FFE3D3` (peach)
  - Paper surface: `#FFF6EE` (warm laid parchment)
  - Primary text: `#3A1F14` (deep brown ink)
  - Muted text: `#7A5646` (sepia note ink)
  - Ruling hairlines: `#E8C9B8` (28px repeating linear gradient)
  - Red accent: `#B8371F` (red ink)
  - Confirmation blue: `#1E3A6B` (rubber stamp blue)
- **Typography:**
  - `Libre Franklin` for headings, folios, and UI controls.
  - `Courier Prime` for entries, dates, running balances, and stamped labels.
- **Two-Page Bound Spread:**
  - Left page (38% width): Net position, counterparty directory with dotted leaders, collect banner, and public lookup.
  - Right page (62% width): Chronological running statement with running balance column, inked stamp badges, and action buttons.
  - Mobile: Collapses smoothly to a single page with "← Ledger" back affordance.
  - Bookmark navigation tabs along the right book edge instead of a generic navbar.

## Contrast Report

| Foreground | Background | Ratio | Rating | Usage |
|---|---|---|---|---|
| Deep brown ink (`#3A1F14`) | Paper (`#FFF6EE`) | 13.3:1 | AAA | Body copy, headers, totals |
| Red ink (`#B8371F`) | Paper (`#FFF6EE`) | 5.5:1 | AA | Debtor balances, action tags |
| White (`#FFFFFF`) | Red button (`#B8371F`) | 6.0:1 | AA | Primary action buttons |
| Muted ink (`#7A5646`) | Paper (`#FFF6EE`) | 6.1:1 | AA | Notes, timestamps, subtitles |
| Confirmation blue (`#1E3A6B`) | Paper (`#FFF6EE`) | 9.5:1 | AAA | Inked confirmation stamps |
| Deep brown ink (`#3A1F14`) | Peach base (`#FFE3D3`) | 11.2:1 | AAA | Book exterior and folios |

All body text satisfies WCAG 2.1 AAA; all interactive elements satisfy WCAG 2.1 AA.

## Gas Benchmarks

| Operation | Gas (Cold) | Gas (Warm) | Ceiling |
|---|---|---|---|
| `propose(other, isOwed, amount, note)` | ~167k | ~110k | 180k |
| `confirm(id)` (first time: links peers) | ~139k | ~45k | 160k |
| `settle(creditor)` (payable) | ~48k | ~48k | 75k |
| `forgive(debtor, amount)` | ~32k | ~32k | 50k |
| `withdraw()` | ~55k | ~30k | 65k |

## What Tab Deliberately Cannot Do

- **It cannot force anyone to pay:** A tab entry is an on-chain record of mutual agreement, not a legal garnishment.
- **No unilateral debt creation:** Proposing an entry does not change any balance until the other party confirms it.
- **Pairwise only:** Does not solve cyclic debts (A owes B owes C) or split multi-party bills.
- **Fixed currency:** All balances are in native BOT. There is no fiat peg or volatility protection.
- **Public:** All entries, notes, and addresses are public on BOT Chain.

## Verification

```bash
# 1. Forge test suite (16 tests + 128k invariant calls)
cd contracts && forge test -vv

# 2. TypeScript compilation
npm run typecheck

# 3. Unit & lint tests (65 tests)
npm test

# 4. Integration tests (17 tests on Anvil)
npm run test:integration

# 5. Production build
npm run build

# 6. Distinctness check
python3 ../scripts/check-distinct.py tab
```
