// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Tab
/// @notice A shared bilateral ledger between two addresses on BOT Chain.
/// Either party can propose an entry; confirmed entries net against each other.
/// Balances can be cleared by paying in native BOT or forgiven by the creditor.
contract Tab {
    uint256 public constant MAX_NOTE_BYTES = 140;
    uint256 public constant MAX_PAGE = 50;

    enum State {
        Pending,
        Confirmed,
        Rejected,
        Withdrawn
    }

    struct Proposal {
        address proposer; // 20B ┐ slot 1
        uint32 createdBlock; // 4B  │ block when Proposed was emitted
        bool proposerIsOwed; // 1B  │ true = "the other party owes me"
        uint8 state; // 1B  ┘ 0 Pending, 1 Confirmed, 2 Rejected, 3 Withdrawn
        address other; // 20B ┐ slot 2
        uint96 amount; // 12B ┘ amount in wei
    }

    struct ProposalView {
        uint256 id;
        address proposer;
        address other;
        uint96 amount;
        bool proposerIsOwed;
        uint8 state;
        uint32 createdBlock;
    }

    mapping(uint256 => Proposal) private _proposals;
    // _net[lo][hi]: positive = hi owes lo (for lo < hi)
    mapping(address => mapping(address => int256)) private _net;
    mapping(address => mapping(address => bool)) private _linked;
    mapping(address => address[]) private _peers;
    mapping(address => uint256[]) private _proposalsOf;
    mapping(address => uint256) public pending;
    uint256 public proposalCount;

    bool private _locked;

    // Events
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

    // Errors
    error BadParty();
    error ZeroAmount();
    error NoteTooLong(uint256 length, uint256 max);
    error NoSuchProposal(uint256 id);
    error NotCounterparty(uint256 id, address caller);
    error NotProposer(uint256 id, address caller);
    error NotPending(uint256 id, uint8 state);
    error NothingOwed(address creditor, address debtor);
    error BadPayment(uint256 owed, uint256 sent);
    error ForgiveTooMuch(uint256 owed, uint256 requested);
    error NothingToWithdraw();
    error TransferFailed();

    modifier nonReentrant() {
        require(!_locked, "REENTRANT");
        _locked = true;
        _;
        _locked = false;
    }

    /// @notice Returns balance between a and b.
    /// Positive value means b owes a; negative value means a owes b.
    /// Antisymmetric: balanceBetween(a, b) == -balanceBetween(b, a).
    function balanceBetween(address a, address b) public view returns (int256) {
        if (a == b) return 0;
        if (a < b) {
            return _net[a][b];
        } else {
            return -_net[b][a];
        }
    }

    /// @notice Proposes an IOU entry between msg.sender and other.
    /// @param other Counterparty address.
    /// @param proposerIsOwed True if other owes msg.sender; false if msg.sender owes other.
    /// @param amount Amount in wei (up to uint96 max).
    /// @param note Up to 140-byte description, emitted in Proposed log.
    function propose(
        address other,
        bool proposerIsOwed,
        uint96 amount,
        string calldata note
    ) external returns (uint256 id) {
        if (other == address(0) || other == msg.sender) revert BadParty();
        if (amount == 0) revert ZeroAmount();
        if (bytes(note).length > MAX_NOTE_BYTES) {
            revert NoteTooLong(bytes(note).length, MAX_NOTE_BYTES);
        }

        id = ++proposalCount;
        _proposals[id] = Proposal({
            proposer: msg.sender,
            createdBlock: uint32(block.number),
            proposerIsOwed: proposerIsOwed,
            state: uint8(State.Pending),
            other: other,
            amount: amount
        });

        _proposalsOf[msg.sender].push(id);
        _proposalsOf[other].push(id);

        emit Proposed(id, msg.sender, other, proposerIsOwed, amount, note);
    }

    /// @notice Confirms a pending proposal. Only the counterparty (other) may call this.
    /// Upon confirmation, the entry is applied to the pairwise balance.
    /// @param id The proposal ID to confirm.
    function confirm(uint256 id) external {
        if (id == 0 || id > proposalCount) revert NoSuchProposal(id);
        Proposal storage p = _proposals[id];
        if (p.other != msg.sender) revert NotCounterparty(id, msg.sender);
        if (p.state != uint8(State.Pending)) revert NotPending(id, p.state);

        p.state = uint8(State.Confirmed);

        // Apply netting
        address lo = p.proposer < p.other ? p.proposer : p.other;
        address hi = p.proposer < p.other ? p.other : p.proposer;

        // Overflow is mathematically unreachable: amounts are uint96 (max ~7.9e28),
        // balances are signed int256 (max ~5.7e76).
        int256 delta = int256(uint256(p.amount));
        if (p.proposer == lo) {
            // lo is proposer, hi is other
            if (p.proposerIsOwed) {
                // hi owes lo (+hi owes lo)
                _net[lo][hi] += delta;
            } else {
                // lo owes hi (-hi owes lo)
                _net[lo][hi] -= delta;
            }
        } else {
            // hi is proposer, lo is other
            if (p.proposerIsOwed) {
                // lo owes hi (-hi owes lo)
                _net[lo][hi] -= delta;
            } else {
                // hi owes lo (+hi owes lo)
                _net[lo][hi] += delta;
            }
        }

        // Link peers on first confirmed entry
        if (!_linked[lo][hi]) {
            _linked[lo][hi] = true;
            _peers[p.proposer].push(p.other);
            _peers[p.other].push(p.proposer);
        }

        emit Confirmed(id, msg.sender, balanceBetween(p.proposer, p.other));
    }

    /// @notice Rejects a pending proposal. Only the counterparty (other) may call this.
    /// @param id The proposal ID to reject.
    function reject(uint256 id) external {
        if (id == 0 || id > proposalCount) revert NoSuchProposal(id);
        Proposal storage p = _proposals[id];
        if (p.other != msg.sender) revert NotCounterparty(id, msg.sender);
        if (p.state != uint8(State.Pending)) revert NotPending(id, p.state);

        p.state = uint8(State.Rejected);

        emit Rejected(id, msg.sender);
    }

    /// @notice Withdraws a pending proposal. Only the proposer may call this.
    /// @param id The proposal ID to withdraw.
    function withdrawProposal(uint256 id) external {
        if (id == 0 || id > proposalCount) revert NoSuchProposal(id);
        Proposal storage p = _proposals[id];
        if (p.proposer != msg.sender) revert NotProposer(id, msg.sender);
        if (p.state != uint8(State.Pending)) revert NotPending(id, p.state);

        p.state = uint8(State.Withdrawn);

        emit ProposalWithdrawn(id, msg.sender);
    }

    /// @notice Settles an outstanding debt owed by msg.sender to creditor with native BOT.
    /// @param creditor The party to whom debt is owed.
    function settle(address creditor) external payable nonReentrant {
        int256 b = balanceBetween(creditor, msg.sender);
        if (b <= 0) revert NothingOwed(creditor, msg.sender);

        uint256 owed = uint256(b);
        if (msg.value == 0 || msg.value > owed) revert BadPayment(owed, msg.value);

        // Reduce debt
        address lo = creditor < msg.sender ? creditor : msg.sender;
        address hi = creditor < msg.sender ? msg.sender : creditor;

        if (creditor == lo) {
            _net[lo][hi] -= int256(msg.value);
        } else {
            _net[lo][hi] += int256(msg.value);
        }

        pending[creditor] += msg.value;
        uint256 remaining = owed - msg.value;

        emit Settled(msg.sender, creditor, uint96(msg.value), remaining);
    }

    /// @notice Forgives part or all of an outstanding debt owed to msg.sender by debtor.
    /// @param debtor The party who owes debt to msg.sender.
    /// @param amount Amount to forgive in wei.
    function forgive(address debtor, uint96 amount) external {
        int256 b = balanceBetween(msg.sender, debtor);
        if (b <= 0) revert NothingOwed(msg.sender, debtor);

        uint256 owed = uint256(b);
        if (amount == 0 || amount > owed) revert ForgiveTooMuch(owed, amount);

        // Reduce debt
        address lo = msg.sender < debtor ? msg.sender : debtor;
        address hi = msg.sender < debtor ? debtor : msg.sender;

        if (msg.sender == lo) {
            _net[lo][hi] -= int256(uint256(amount));
        } else {
            _net[lo][hi] += int256(uint256(amount));
        }

        uint256 remaining = owed - amount;

        emit Forgiven(msg.sender, debtor, amount, remaining);
    }

    /// @notice Withdraws accrued settled funds.
    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Returns details of a proposal.
    function proposalOf(uint256 id) external view returns (ProposalView memory) {
        if (id == 0 || id > proposalCount) revert NoSuchProposal(id);
        Proposal storage p = _proposals[id];
        return
            ProposalView({
                id: id,
                proposer: p.proposer,
                other: p.other,
                amount: p.amount,
                proposerIsOwed: p.proposerIsOwed,
                state: p.state,
                createdBlock: p.createdBlock
            });
    }

    /// @notice Returns proposals involving address `who`, paginated in newest-first order.
    function proposalsFor(
        address who,
        uint256 offset,
        uint256 count
    ) external view returns (ProposalView[] memory) {
        if (count > MAX_PAGE) count = MAX_PAGE;
        uint256 total = _proposalsOf[who].length;
        if (total == 0 || offset >= total) {
            return new ProposalView[](0);
        }

        uint256 remaining = total - offset;
        uint256 limit = count < remaining ? count : remaining;

        ProposalView[] memory views = new ProposalView[](limit);
        for (uint256 i = 0; i < limit; i++) {
            uint256 id = _proposalsOf[who][total - 1 - offset - i];
            Proposal storage p = _proposals[id];
            views[i] = ProposalView({
                id: id,
                proposer: p.proposer,
                other: p.other,
                amount: p.amount,
                proposerIsOwed: p.proposerIsOwed,
                state: p.state,
                createdBlock: p.createdBlock
            });
        }

        return views;
    }

    /// @notice Returns counterparties and pairwise balances for address `who`.
    /// Paged over the peers array. Positive balance indicates that peer owes `who`.
    function ledgerOf(
        address who,
        uint256 start,
        uint256 count
    ) external view returns (address[] memory peers, int256[] memory balances) {
        if (count > MAX_PAGE) count = MAX_PAGE;
        uint256 total = _peers[who].length;
        if (total == 0 || start >= total) {
            return (new address[](0), new int256[](0));
        }

        uint256 remaining = total - start;
        uint256 limit = count < remaining ? count : remaining;

        peers = new address[](limit);
        balances = new int256[](limit);

        for (uint256 i = 0; i < limit; i++) {
            address peer = _peers[who][start + i];
            peers[i] = peer;
            balances[i] = balanceBetween(who, peer);
        }

        return (peers, balances);
    }

    /// @notice Returns number of linked counterparties for address `who`.
    function peerCount(address who) external view returns (uint256) {
        return _peers[who].length;
    }
}
