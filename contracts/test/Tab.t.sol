// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {Tab} from "../src/Tab.sol";

contract HostileReceiver {
    Tab public tab;

    constructor(Tab _tab) {
        tab = _tab;
    }

    receive() external payable {
        // Attempt reentrancy
        if (address(tab).balance >= msg.value && msg.value > 0) {
            try tab.withdraw() {} catch {}
        }
    }
}

contract ReentrantWithdrawer {
    Tab public tab;
    bool public reentrancyReverted;

    constructor(Tab _tab) {
        tab = _tab;
    }

    receive() external payable {
        try tab.withdraw() {
        } catch (bytes memory reason) {
            // forge-lint: disable-next-line(unsafe-typecast)
            if (bytes4(reason) == Tab.Reentrancy.selector) {
                reentrancyReverted = true;
            }
        }
    }

    function triggerWithdraw() external {
        tab.withdraw();
    }
}

contract TabHandler is CommonBase, StdCheats, StdUtils {
    Tab public tab;
    address[] public actors;
    uint256[] public activeProposalIds;

    constructor(Tab _tab, address[] memory _actors) {
        tab = _tab;
        actors = _actors;
    }

    function propose(
        uint8 fromIdx,
        uint8 toIdx,
        bool proposerIsOwed,
        uint96 amount
    ) external {
        if (actors.length < 2) return;
        address from = actors[fromIdx % actors.length];
        address to = actors[toIdx % actors.length];
        if (from == to) return;
        if (amount == 0) amount = 1 ether;

        vm.prank(from);
        uint256 id = tab.propose(to, proposerIsOwed, amount, "handler note");
        activeProposalIds.push(id);
    }

    function confirm(uint256 idIndex) external {
        if (activeProposalIds.length == 0) return;
        uint256 id = activeProposalIds[idIndex % activeProposalIds.length];

        Tab.ProposalView memory pv = tab.proposalOf(id);
        if (pv.state == 0) {
            vm.prank(pv.other);
            try tab.confirm(id) {} catch {}
        }
    }

    function reject(uint256 idIndex) external {
        if (activeProposalIds.length == 0) return;
        uint256 id = activeProposalIds[idIndex % activeProposalIds.length];

        Tab.ProposalView memory pv = tab.proposalOf(id);
        if (pv.state == 0) {
            vm.prank(pv.other);
            try tab.reject(id) {} catch {}
        }
    }

    function withdrawProposal(uint256 idIndex) external {
        if (activeProposalIds.length == 0) return;
        uint256 id = activeProposalIds[idIndex % activeProposalIds.length];

        Tab.ProposalView memory pv = tab.proposalOf(id);
        if (pv.state == 0) {
            vm.prank(pv.proposer);
            try tab.withdrawProposal(id) {} catch {}
        }
    }

    function settle(uint8 fromIdx, uint8 toIdx, uint96 amount) external {
        if (actors.length < 2) return;
        address debtor = actors[fromIdx % actors.length];
        address creditor = actors[toIdx % actors.length];
        if (debtor == creditor) return;

        int256 b = tab.balanceBetween(creditor, debtor);
        if (b <= 0) return;

        uint256 owed = uint256(b);
        uint256 payVal = (uint256(amount) % owed) + 1;

        vm.deal(debtor, debtor.balance + payVal);
        vm.prank(debtor);
        try tab.settle{value: payVal}(creditor) {} catch {}
    }

    function forgive(uint8 fromIdx, uint8 toIdx, uint96 amount) external {
        if (actors.length < 2) return;
        address creditor = actors[fromIdx % actors.length];
        address debtor = actors[toIdx % actors.length];
        if (debtor == creditor) return;

        int256 b = tab.balanceBetween(creditor, debtor);
        if (b <= 0) return;

        uint256 owed = uint256(b);
        uint96 forgiveVal = uint96((uint256(amount) % owed) + 1);

        vm.prank(creditor);
        try tab.forgive(debtor, forgiveVal) {} catch {}
    }

    function withdraw(uint8 whoIdx) external {
        if (actors.length == 0) return;
        address who = actors[whoIdx % actors.length];
        if (tab.pending(who) > 0) {
            vm.prank(who);
            try tab.withdraw() {} catch {}
        }
    }
}

contract TabTest is Test {
    Tab public tab;
    TabHandler public handler;

    address public alice = address(0xAA11);
    address public bob = address(0xBB22);
    address public charlie = address(0xCC33);
    address public dave = address(0xDD44);

    address[] public actors;

    event Proposed(
        uint256 indexed id,
        address indexed proposer,
        address indexed other,
        bool proposerIsOwed,
        uint96 amount,
        string note
    );
    event Confirmed(uint256 indexed id, address indexed by, int256 balance);
    event Rejected(uint256 indexed id, address indexed by);
    event ProposalWithdrawn(uint256 indexed id, address indexed by);
    event Settled(
        address indexed debtor,
        address indexed creditor,
        uint96 amount,
        uint256 remaining
    );
    event Forgiven(
        address indexed creditor,
        address indexed debtor,
        uint96 amount,
        uint256 remaining
    );
    event Withdrawn(address indexed who, uint256 amount);

    function setUp() public {
        vm.warp(1_760_000_000);
        tab = new Tab();

        actors = new address[](4);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = charlie;
        actors[3] = dave;

        handler = new TabHandler(tab, actors);
        targetContract(address(handler));
    }

    function test_Propose_StoresAndIndexesBothSides() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, false);
        emit Proposed(1, alice, bob, true, 1 ether, "Dinner at Luigi's");

        uint256 id = tab.propose(bob, true, 1 ether, "Dinner at Luigi's");
        assertEq(id, 1);
        assertEq(tab.proposalCount(), 1);

        Tab.ProposalView memory pv = tab.proposalOf(1);
        assertEq(pv.id, 1);
        assertEq(pv.proposer, alice);
        assertEq(pv.other, bob);
        assertEq(pv.amount, 1 ether);
        assertTrue(pv.proposerIsOwed);
        assertEq(pv.state, 0); // Pending

        Tab.ProposalView[] memory pAlice = tab.proposalsFor(alice, 0, 10);
        Tab.ProposalView[] memory pBob = tab.proposalsFor(bob, 0, 10);
        assertEq(pAlice.length, 1);
        assertEq(pBob.length, 1);
        assertEq(pAlice[0].id, 1);
        assertEq(pBob[0].id, 1);
    }

    function test_Propose_Rejects_Self_Zero_Zero_LongNote() public {
        // other == 0
        vm.prank(alice);
        vm.expectRevert(Tab.BadParty.selector);
        tab.propose(address(0), true, 1 ether, "note");

        // other == msg.sender
        vm.prank(alice);
        vm.expectRevert(Tab.BadParty.selector);
        tab.propose(alice, true, 1 ether, "note");

        // amount == 0
        vm.prank(alice);
        vm.expectRevert(Tab.ZeroAmount.selector);
        tab.propose(bob, true, 0, "note");

        // note > 140 bytes
        string memory longNote = new string(141);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Tab.NoteTooLong.selector, 141, 140));
        tab.propose(bob, true, 1 ether, longNote);
    }

    function test_Confirm_OwedDirection_BothWays() public {
        // Alice proposes: "Bob owes me 2 ether" (proposerIsOwed = true)
        vm.prank(alice);
        uint256 id1 = tab.propose(bob, true, 2 ether, "Groceries");

        // Confirm by Bob
        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit Confirmed(id1, bob, 2 ether);
        tab.confirm(id1);

        // Bob owes Alice 2 ether
        assertEq(tab.balanceBetween(alice, bob), 2 ether);
        assertEq(tab.balanceBetween(bob, alice), -2 ether);

        // Charlie proposes: "I owe Alice 1 ether" (proposerIsOwed = false)
        vm.prank(charlie);
        uint256 id2 = tab.propose(alice, false, 1 ether, "Cab ride");

        // Confirm by Alice
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Confirmed(id2, alice, -1 ether);
        tab.confirm(id2);

        // Charlie owes Alice 1 ether
        assertEq(tab.balanceBetween(alice, charlie), 1 ether);
        assertEq(tab.balanceBetween(charlie, alice), -1 ether);
    }

    function test_Confirm_NetsAgainstExisting() public {
        // Alice proposes: Bob owes Alice 3 ether
        vm.prank(alice);
        uint256 id1 = tab.propose(bob, true, 3 ether, "Rent");
        vm.prank(bob);
        tab.confirm(id1);
        assertEq(tab.balanceBetween(alice, bob), 3 ether);

        // Bob proposes: Alice owes Bob 1 ether (proposerIsOwed = true)
        vm.prank(bob);
        uint256 id2 = tab.propose(alice, true, 1 ether, "Internet");
        vm.prank(alice);
        tab.confirm(id2);

        // Net: Bob owes Alice 2 ether
        assertEq(tab.balanceBetween(alice, bob), 2 ether);
        assertEq(tab.balanceBetween(bob, alice), -2 ether);

        // Bob proposes: Alice owes Bob 5 ether
        vm.prank(bob);
        uint256 id3 = tab.propose(alice, true, 5 ether, "Utilities");
        vm.prank(alice);
        tab.confirm(id3);

        // Net: Alice owes Bob 3 ether (from Alice's view: -3 ether)
        assertEq(tab.balanceBetween(alice, bob), -3 ether);
        assertEq(tab.balanceBetween(bob, alice), 3 ether);
    }

    function test_Confirm_OnlyOther_OnlyPending() public {
        vm.prank(alice);
        uint256 id = tab.propose(bob, true, 1 ether, "Coffee");

        // Alice (proposer) cannot confirm
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Tab.NotCounterparty.selector, id, alice));
        tab.confirm(id);

        // Stranger cannot confirm
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(Tab.NotCounterparty.selector, id, charlie));
        tab.confirm(id);

        // Bob confirms
        vm.prank(bob);
        tab.confirm(id);

        // Second confirm reverts NotPending
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Tab.NotPending.selector, id, 1));
        tab.confirm(id);
    }

    function test_Reject() public {
        vm.prank(alice);
        uint256 id = tab.propose(bob, true, 1 ether, "Lunch");

        // Proposer cannot reject
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Tab.NotCounterparty.selector, id, alice));
        tab.reject(id);

        // Bob rejects
        vm.prank(bob);
        vm.expectEmit(true, true, false, false);
        emit Rejected(id, bob);
        tab.reject(id);

        assertEq(tab.proposalOf(id).state, 2); // Rejected

        // Balance unaffected
        assertEq(tab.balanceBetween(alice, bob), 0);
    }

    function test_WithdrawProposal() public {
        vm.prank(alice);
        uint256 id = tab.propose(bob, true, 1 ether, "Movie");

        // Bob cannot withdraw Alice's proposal
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Tab.NotProposer.selector, id, bob));
        tab.withdrawProposal(id);

        // Alice withdraws
        vm.prank(alice);
        vm.expectEmit(true, true, false, false);
        emit ProposalWithdrawn(id, alice);
        tab.withdrawProposal(id);

        assertEq(tab.proposalOf(id).state, 3); // Withdrawn

        // Cannot confirm withdrawn proposal
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Tab.NotPending.selector, id, 3));
        tab.confirm(id);
    }

    function test_Settle_PartialAndFull() public {
        // Bob owes Alice 2 ether
        vm.prank(alice);
        uint256 id = tab.propose(bob, true, 2 ether, "Books");
        vm.prank(bob);
        tab.confirm(id);

        // Partial settle: Bob pays 0.5 ether
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit Settled(bob, alice, 0.5 ether, 1.5 ether);
        tab.settle{value: 0.5 ether}(alice);

        assertEq(tab.balanceBetween(alice, bob), 1.5 ether);
        assertEq(tab.pending(alice), 0.5 ether);

        // Full settle of remaining 1.5 ether
        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit Settled(bob, alice, 1.5 ether, 0);
        tab.settle{value: 1.5 ether}(alice);

        assertEq(tab.balanceBetween(alice, bob), 0);
        assertEq(tab.pending(alice), 2 ether);
    }

    function test_Settle_NothingOwed_BadPayment_Overpay() public {
        // Nothing owed initially
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Tab.NothingOwed.selector, alice, bob));
        tab.settle{value: 1 ether}(alice);

        // Alice owes Bob (so Bob cannot settle Alice)
        vm.prank(bob);
        uint256 id = tab.propose(alice, true, 1 ether, "Lunch");
        vm.prank(alice);
        tab.confirm(id);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Tab.NothingOwed.selector, alice, bob));
        tab.settle{value: 1 ether}(alice);

        // Alice owes Bob 1 ether: Alice tries zero payment
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Tab.BadPayment.selector, 1 ether, 0));
        tab.settle{value: 0}(bob);

        // Alice tries overpaying (2 ether vs 1 ether owed)
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Tab.BadPayment.selector, 1 ether, 2 ether));
        tab.settle{value: 2 ether}(bob);
    }

    function test_Forgive_Partial_Full_TooMuch() public {
        // Bob owes Alice 2 ether
        vm.prank(alice);
        uint256 id = tab.propose(bob, true, 2 ether, "Gifts");
        vm.prank(bob);
        tab.confirm(id);

        // Non-creditor cannot forgive
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Tab.NothingOwed.selector, bob, alice));
        tab.forgive(alice, 1 ether);

        // Alice forgives 0.5 ether
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Forgiven(alice, bob, 0.5 ether, 1.5 ether);
        tab.forgive(bob, 0.5 ether);
        assertEq(tab.balanceBetween(alice, bob), 1.5 ether);

        // Forgive too much
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Tab.ForgiveTooMuch.selector, 1.5 ether, 2 ether));
        tab.forgive(bob, 2 ether);

        // Forgive remaining
        vm.prank(alice);
        tab.forgive(bob, 1.5 ether);
        assertEq(tab.balanceBetween(alice, bob), 0);
    }

    function test_Withdraw_Pays_Nothing() public {
        vm.deal(bob, 2 ether);
        vm.prank(alice);
        uint256 id = tab.propose(bob, true, 1 ether, "Food");
        vm.prank(bob);
        tab.confirm(id);

        vm.prank(bob);
        tab.settle{value: 1 ether}(alice);

        // Alice withdraws
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Withdrawn(alice, 1 ether);
        tab.withdraw();

        assertEq(alice.balance - balBefore, 1 ether);
        assertEq(tab.pending(alice), 0);

        // Second withdraw reverts NothingToWithdraw
        vm.prank(alice);
        vm.expectRevert(Tab.NothingToWithdraw.selector);
        tab.withdraw();
    }

    function test_PeersLinkedOnce_And_LedgerOf() public {
        assertEq(tab.peerCount(alice), 0);

        // Alice proposes to Bob
        vm.prank(alice);
        uint256 id1 = tab.propose(bob, true, 1 ether, "First");
        vm.prank(bob);
        tab.confirm(id1);

        assertEq(tab.peerCount(alice), 1);
        assertEq(tab.peerCount(bob), 1);

        // Second proposal between same pair does not duplicate peers
        vm.prank(alice);
        uint256 id2 = tab.propose(bob, true, 1 ether, "Second");
        vm.prank(bob);
        tab.confirm(id2);

        assertEq(tab.peerCount(alice), 1);
        assertEq(tab.peerCount(bob), 1);

        // Alice and Charlie
        vm.prank(alice);
        uint256 id3 = tab.propose(charlie, true, 3 ether, "Third");
        vm.prank(charlie);
        tab.confirm(id3);

        assertEq(tab.peerCount(alice), 2);

        // Check ledgerOf
        (address[] memory peers, int256[] memory balances) = tab.ledgerOf(alice, 0, 10);
        assertEq(peers.length, 2);
        assertEq(balances.length, 2);
        assertEq(peers[0], bob);
        assertEq(balances[0], 2 ether);
        assertEq(peers[1], charlie);
        assertEq(balances[1], 3 ether);
    }

    function test_ProposalsFor_NewestFirst() public {
        vm.prank(alice);
        tab.propose(bob, true, 1 ether, "1");
        vm.prank(alice);
        tab.propose(bob, true, 2 ether, "2");
        vm.prank(alice);
        tab.propose(bob, true, 3 ether, "3");

        Tab.ProposalView[] memory list = tab.proposalsFor(alice, 0, 10);
        assertEq(list.length, 3);
        assertEq(list[0].id, 3);
        assertEq(list[1].id, 2);
        assertEq(list[2].id, 1);
    }

    function testFuzz_AntisymmetryAndConservation(
        uint8 dir1,
        uint96 amt1,
        uint8 dir2,
        uint96 amt2
    ) public {
        vm.assume(amt1 > 0 && amt1 < 100_000 ether);
        vm.assume(amt2 > 0 && amt2 < 100_000 ether);

        vm.prank(alice);
        uint256 id1 = tab.propose(bob, dir1 % 2 == 0, amt1, "fuzz 1");
        vm.prank(bob);
        tab.confirm(id1);

        assertEq(tab.balanceBetween(alice, bob), -tab.balanceBetween(bob, alice));

        vm.prank(bob);
        uint256 id2 = tab.propose(alice, dir2 % 2 == 0, amt2, "fuzz 2");
        vm.prank(alice);
        tab.confirm(id2);

        assertEq(tab.balanceBetween(alice, bob), -tab.balanceBetween(bob, alice));
    }

    function invariant_BalanceEqualsPending() public view {
        uint256 sum = tab.pending(alice) +
            tab.pending(bob) +
            tab.pending(charlie) +
            tab.pending(dave);
        assertEq(address(tab).balance, sum);
    }

    function test_GasCeilings() public {
        vm.prank(alice);
        uint256 g0 = gasleft();
        uint256 id = tab.propose(bob, true, 1 ether, "Ceiling check");
        uint256 gasPropose = g0 - gasleft();
        assertLt(gasPropose, 180_000);

        vm.prank(bob);
        g0 = gasleft();
        tab.confirm(id);
        uint256 gasConfirm = g0 - gasleft();
        assertLt(gasConfirm, 160_000);

        vm.deal(bob, 2 ether);
        vm.prank(bob);
        g0 = gasleft();
        tab.settle{value: 1 ether}(alice);
        uint256 gasSettle = g0 - gasleft();
        assertLt(gasSettle, 75_000);

        vm.prank(alice);
        g0 = gasleft();
        tab.withdraw();
        uint256 gasWithdraw = g0 - gasleft();
        assertLt(gasWithdraw, 65_000);
    }

    function test_Reentrancy_RevertsWithCustomError() public {
        ReentrantWithdrawer attacker = new ReentrantWithdrawer(tab);
        vm.prank(alice);
        uint256 id = tab.propose(address(attacker), false, 1 ether, "Reentrancy test");
        vm.prank(address(attacker));
        tab.confirm(id);

        vm.deal(alice, 2 ether);
        vm.prank(alice);
        tab.settle{value: 1 ether}(address(attacker));

        assertEq(tab.pending(address(attacker)), 1 ether);

        attacker.triggerWithdraw();
        assertTrue(attacker.reentrancyReverted());
    }
}
