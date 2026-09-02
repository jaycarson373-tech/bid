// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BidMarket is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant PAYOUT_SCALE = 1e18;
    uint256 public constant MAX_OUTCOMES = 8;
    uint256 public constant MAX_CREATOR_FEE_BPS = 300;

    enum OrderKind {
        Buy,
        Sell
    }

    struct LimitOrder {
        address owner;
        OrderKind kind;
        uint256 outcomeIndex;
        uint256 collateralAmount;
        uint256 outcomeTokenLimit;
        bool active;
    }

    error InvalidOutcome();
    error InvalidOutcomeCount();
    error InvalidPayouts();
    error MarketNotOpen();
    error MarketNotResolved();
    error MarketNotClosed();
    error AlreadySeeded();
    error ZeroAmount();
    error SlippageExceeded();
    error NotFactory();
    error NotOracle();
    error NotCreator();
    error NotOrderOwner();
    error OrderNotActive();
    error CreatorFeeTooHigh();

    event FundingAdded(address indexed provider, uint256 collateralIn, uint256 sharesMinted);
    event FundingRemoved(address indexed provider, uint256 sharesBurned, uint256[] outcomeTokensOut);
    event Trade(
        address indexed trader,
        bool indexed isBuy,
        uint256 indexed outcomeIndex,
        uint256 collateralAmount,
        uint256 outcomeTokenAmount,
        uint256 creatorFee
    );
    event LimitOrderPlaced(
        uint256 indexed orderId,
        address indexed owner,
        OrderKind kind,
        uint256 outcomeIndex,
        uint256 collateralAmount,
        uint256 outcomeTokenLimit
    );
    event LimitOrderFilled(uint256 indexed orderId, address indexed filler);
    event LimitOrderCancelled(uint256 indexed orderId);
    event MarketResolved(uint256[] payouts);
    event Redeemed(address indexed account, uint256 collateralOut);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);

    IERC20 public immutable collateral;
    address public immutable factory;
    address public immutable oracle;
    address public immutable marketCreator;
    uint64 public immutable closesAt;
    uint16 public immutable creatorFeeBps;
    string public question;

    bool public resolved;
    uint256 public creatorFeesAccrued;
    uint256 public nextLimitOrderId = 1;

    string[] private _outcomeLabels;
    uint256[] private _poolBalances;
    uint256[] private _payouts;
    mapping(address => mapping(uint256 => uint256)) private _outcomeBalances;
    mapping(uint256 => LimitOrder) public limitOrders;

    modifier onlyOpen() {
        if (resolved || block.timestamp >= closesAt) revert MarketNotOpen();
        _;
    }

    constructor(
        IERC20 collateral_,
        address factory_,
        address oracle_,
        address marketCreator_,
        uint64 closesAt_,
        uint16 creatorFeeBps_,
        string memory question_,
        string[] memory outcomeLabels_
    ) ERC20("BID Market LP", "BID-LP") {
        if (outcomeLabels_.length < 2 || outcomeLabels_.length > MAX_OUTCOMES) {
            revert InvalidOutcomeCount();
        }
        if (creatorFeeBps_ > MAX_CREATOR_FEE_BPS) revert CreatorFeeTooHigh();
        if (closesAt_ <= block.timestamp) revert MarketNotClosed();

        collateral = collateral_;
        factory = factory_;
        oracle = oracle_;
        marketCreator = marketCreator_;
        closesAt = closesAt_;
        creatorFeeBps = creatorFeeBps_;
        question = question_;
        _outcomeLabels = outcomeLabels_;
        _poolBalances = new uint256[](outcomeLabels_.length);
    }

    function outcomeCount() external view returns (uint256) {
        return _outcomeLabels.length;
    }

    function outcomeLabel(uint256 outcomeIndex) external view returns (string memory) {
        _requireOutcome(outcomeIndex);
        return _outcomeLabels[outcomeIndex];
    }

    function poolBalances() external view returns (uint256[] memory) {
        return _poolBalances;
    }

    function payouts() external view returns (uint256[] memory) {
        return _payouts;
    }

    function outcomeBalanceOf(address account, uint256 outcomeIndex) external view returns (uint256) {
        _requireOutcome(outcomeIndex);
        return _outcomeBalances[account][outcomeIndex];
    }

    function spotPricesBps() external view returns (uint256[] memory prices) {
        uint256 count = _poolBalances.length;
        prices = new uint256[](count);
        uint256[] memory weights = new uint256[](count);
        uint256 totalWeight;

        for (uint256 i; i < count; ++i) {
            if (_poolBalances[i] == 0) return prices;
            weights[i] = Math.mulDiv(PAYOUT_SCALE, PAYOUT_SCALE, _poolBalances[i]);
            totalWeight += weights[i];
        }

        uint256 assigned;
        for (uint256 i; i + 1 < count; ++i) {
            prices[i] = Math.mulDiv(weights[i], BPS, totalWeight);
            assigned += prices[i];
        }
        prices[count - 1] = BPS - assigned;
    }

    function seed(address provider, uint256 collateralAmount) external nonReentrant {
        if (msg.sender != factory) revert NotFactory();
        if (totalSupply() != 0) revert AlreadySeeded();
        if (collateralAmount == 0) revert ZeroAmount();
        if (collateral.balanceOf(address(this)) < collateralAmount) revert ZeroAmount();

        for (uint256 i; i < _poolBalances.length; ++i) {
            _poolBalances[i] = collateralAmount;
        }
        _mint(provider, collateralAmount);
        emit FundingAdded(provider, collateralAmount, collateralAmount);
    }

    function addFunding(uint256 collateralAmount)
        external
        onlyOpen
        nonReentrant
        returns (uint256 sharesMinted)
    {
        if (collateralAmount == 0) revert ZeroAmount();
        uint256 supply = totalSupply();
        if (supply == 0) revert ZeroAmount();

        uint256 poolWeight;
        for (uint256 i; i < _poolBalances.length; ++i) {
            if (_poolBalances[i] > poolWeight) poolWeight = _poolBalances[i];
        }

        collateral.safeTransferFrom(msg.sender, address(this), collateralAmount);
        sharesMinted = Math.mulDiv(collateralAmount, supply, poolWeight);
        if (sharesMinted == 0) revert ZeroAmount();

        for (uint256 i; i < _poolBalances.length; ++i) {
            uint256 amountIntoPool = Math.mulDiv(collateralAmount, _poolBalances[i], poolWeight);
            _poolBalances[i] += amountIntoPool;
            _outcomeBalances[msg.sender][i] += collateralAmount - amountIntoPool;
        }

        _mint(msg.sender, sharesMinted);
        emit FundingAdded(msg.sender, collateralAmount, sharesMinted);
    }

    function removeFunding(uint256 sharesToBurn)
        external
        nonReentrant
        returns (uint256[] memory outcomeTokensOut)
    {
        if (sharesToBurn == 0) revert ZeroAmount();
        uint256 supply = totalSupply();
        outcomeTokensOut = new uint256[](_poolBalances.length);

        for (uint256 i; i < _poolBalances.length; ++i) {
            uint256 amount = Math.mulDiv(_poolBalances[i], sharesToBurn, supply);
            _poolBalances[i] -= amount;
            _outcomeBalances[msg.sender][i] += amount;
            outcomeTokensOut[i] = amount;
        }

        _burn(msg.sender, sharesToBurn);
        emit FundingRemoved(msg.sender, sharesToBurn, outcomeTokensOut);
    }

    function quoteBuy(uint256 collateralIn, uint256 outcomeIndex)
        public
        view
        returns (uint256 outcomeTokensOut, uint256 creatorFee)
    {
        _requireOutcome(outcomeIndex);
        if (collateralIn == 0 || totalSupply() == 0) revert ZeroAmount();

        creatorFee = Math.mulDiv(collateralIn, creatorFeeBps, BPS);
        uint256 netInvestment = collateralIn - creatorFee;
        uint256 endingBalanceFixed = _poolBalances[outcomeIndex] * PAYOUT_SCALE;

        for (uint256 i; i < _poolBalances.length; ++i) {
            if (i == outcomeIndex) continue;
            endingBalanceFixed = Math.mulDiv(
                endingBalanceFixed,
                _poolBalances[i],
                _poolBalances[i] + netInvestment,
                Math.Rounding.Ceil
            );
        }

        uint256 endingBalance = Math.ceilDiv(endingBalanceFixed, PAYOUT_SCALE);
        outcomeTokensOut = _poolBalances[outcomeIndex] + netInvestment - endingBalance;
    }

    function buy(uint256 collateralIn, uint256 outcomeIndex, uint256 minOutcomeTokensOut)
        external
        onlyOpen
        nonReentrant
        returns (uint256 outcomeTokensOut)
    {
        collateral.safeTransferFrom(msg.sender, address(this), collateralIn);
        outcomeTokensOut = _executeBuy(msg.sender, collateralIn, outcomeIndex, minOutcomeTokensOut);
    }

    function quoteSell(uint256 collateralOut, uint256 outcomeIndex)
        public
        view
        returns (uint256 outcomeTokensIn, uint256 creatorFee)
    {
        _requireOutcome(outcomeIndex);
        if (collateralOut == 0 || totalSupply() == 0) revert ZeroAmount();

        uint256 grossReturn = Math.mulDiv(
            collateralOut,
            BPS,
            BPS - creatorFeeBps,
            Math.Rounding.Ceil
        );
        creatorFee = grossReturn - collateralOut;
        uint256 endingBalanceFixed = _poolBalances[outcomeIndex] * PAYOUT_SCALE;

        for (uint256 i; i < _poolBalances.length; ++i) {
            if (i == outcomeIndex) continue;
            if (_poolBalances[i] <= grossReturn) revert SlippageExceeded();
            endingBalanceFixed = Math.mulDiv(
                endingBalanceFixed,
                _poolBalances[i],
                _poolBalances[i] - grossReturn,
                Math.Rounding.Ceil
            );
        }

        outcomeTokensIn = grossReturn
            + Math.ceilDiv(endingBalanceFixed, PAYOUT_SCALE)
            - _poolBalances[outcomeIndex];
    }

    function sell(uint256 collateralOut, uint256 outcomeIndex, uint256 maxOutcomeTokensIn)
        external
        onlyOpen
        nonReentrant
        returns (uint256 outcomeTokensIn)
    {
        uint256 creatorFee;
        (outcomeTokensIn, creatorFee) = quoteSell(collateralOut, outcomeIndex);
        if (outcomeTokensIn > maxOutcomeTokensIn) revert SlippageExceeded();
        if (_outcomeBalances[msg.sender][outcomeIndex] < outcomeTokensIn) revert SlippageExceeded();

        _outcomeBalances[msg.sender][outcomeIndex] -= outcomeTokensIn;
        _executeSell(msg.sender, collateralOut, outcomeIndex, outcomeTokensIn, creatorFee);
    }

    function placeBuyLimit(
        uint256 collateralIn,
        uint256 outcomeIndex,
        uint256 minOutcomeTokensOut
    ) external onlyOpen nonReentrant returns (uint256 orderId) {
        _requireOutcome(outcomeIndex);
        if (collateralIn == 0 || minOutcomeTokensOut == 0) revert ZeroAmount();
        collateral.safeTransferFrom(msg.sender, address(this), collateralIn);

        orderId = nextLimitOrderId++;
        (uint256 quotedTokens,) = quoteBuy(collateralIn, outcomeIndex);
        limitOrders[orderId] = LimitOrder({
            owner: msg.sender,
            kind: OrderKind.Buy,
            outcomeIndex: outcomeIndex,
            collateralAmount: collateralIn,
            outcomeTokenLimit: minOutcomeTokensOut,
            active: quotedTokens < minOutcomeTokensOut
        });
        emit LimitOrderPlaced(
            orderId,
            msg.sender,
            OrderKind.Buy,
            outcomeIndex,
            collateralIn,
            minOutcomeTokensOut
        );

        if (quotedTokens >= minOutcomeTokensOut) {
            _executeBuy(msg.sender, collateralIn, outcomeIndex, minOutcomeTokensOut);
            emit LimitOrderFilled(orderId, msg.sender);
        }
    }

    function placeSellLimit(
        uint256 collateralOut,
        uint256 outcomeIndex,
        uint256 maxOutcomeTokensIn
    ) external onlyOpen nonReentrant returns (uint256 orderId) {
        _requireOutcome(outcomeIndex);
        if (collateralOut == 0 || maxOutcomeTokensIn == 0) revert ZeroAmount();
        if (_outcomeBalances[msg.sender][outcomeIndex] < maxOutcomeTokensIn) {
            revert SlippageExceeded();
        }
        _outcomeBalances[msg.sender][outcomeIndex] -= maxOutcomeTokensIn;

        orderId = nextLimitOrderId++;
        limitOrders[orderId] = LimitOrder({
            owner: msg.sender,
            kind: OrderKind.Sell,
            outcomeIndex: outcomeIndex,
            collateralAmount: collateralOut,
            outcomeTokenLimit: maxOutcomeTokensIn,
            active: true
        });
        emit LimitOrderPlaced(
            orderId,
            msg.sender,
            OrderKind.Sell,
            outcomeIndex,
            collateralOut,
            maxOutcomeTokensIn
        );
    }

    function fillLimitOrder(uint256 orderId) external onlyOpen nonReentrant {
        LimitOrder storage order = limitOrders[orderId];
        if (!order.active) revert OrderNotActive();
        order.active = false;

        if (order.kind == OrderKind.Buy) {
            _executeBuy(
                order.owner,
                order.collateralAmount,
                order.outcomeIndex,
                order.outcomeTokenLimit
            );
        } else {
            (uint256 outcomeTokensIn, uint256 creatorFee) = quoteSell(
                order.collateralAmount,
                order.outcomeIndex
            );
            if (outcomeTokensIn > order.outcomeTokenLimit) revert SlippageExceeded();
            _outcomeBalances[order.owner][order.outcomeIndex] +=
                order.outcomeTokenLimit - outcomeTokensIn;
            _executeSell(
                order.owner,
                order.collateralAmount,
                order.outcomeIndex,
                outcomeTokensIn,
                creatorFee
            );
        }

        emit LimitOrderFilled(orderId, msg.sender);
    }

    function cancelLimitOrder(uint256 orderId) external nonReentrant {
        LimitOrder storage order = limitOrders[orderId];
        if (!order.active) revert OrderNotActive();
        if (order.owner != msg.sender) revert NotOrderOwner();
        order.active = false;

        if (order.kind == OrderKind.Buy) {
            collateral.safeTransfer(order.owner, order.collateralAmount);
        } else {
            _outcomeBalances[order.owner][order.outcomeIndex] += order.outcomeTokenLimit;
        }
        emit LimitOrderCancelled(orderId);
    }

    function resolve(uint256[] calldata payoutVector) external {
        if (msg.sender != oracle) revert NotOracle();
        if (resolved) revert InvalidPayouts();
        if (block.timestamp < closesAt) revert MarketNotClosed();
        if (payoutVector.length != _outcomeLabels.length) revert InvalidPayouts();

        uint256 total;
        for (uint256 i; i < payoutVector.length; ++i) total += payoutVector[i];
        if (total != PAYOUT_SCALE) revert InvalidPayouts();

        resolved = true;
        _payouts = payoutVector;
        emit MarketResolved(payoutVector);
    }

    function redeem() external nonReentrant returns (uint256 collateralOut) {
        if (!resolved) revert MarketNotResolved();

        for (uint256 i; i < _payouts.length; ++i) {
            uint256 balance = _outcomeBalances[msg.sender][i];
            if (balance == 0) continue;
            _outcomeBalances[msg.sender][i] = 0;
            collateralOut += Math.mulDiv(balance, _payouts[i], PAYOUT_SCALE);
        }
        if (collateralOut == 0) revert ZeroAmount();

        collateral.safeTransfer(msg.sender, collateralOut);
        emit Redeemed(msg.sender, collateralOut);
    }

    function claimCreatorFees() external nonReentrant returns (uint256 amount) {
        if (msg.sender != marketCreator) revert NotCreator();
        amount = creatorFeesAccrued;
        if (amount == 0) revert ZeroAmount();
        creatorFeesAccrued = 0;
        collateral.safeTransfer(marketCreator, amount);
        emit CreatorFeesClaimed(marketCreator, amount);
    }

    function _executeBuy(
        address recipient,
        uint256 collateralIn,
        uint256 outcomeIndex,
        uint256 minOutcomeTokensOut
    ) private returns (uint256 outcomeTokensOut) {
        uint256 creatorFee;
        (outcomeTokensOut, creatorFee) = quoteBuy(collateralIn, outcomeIndex);
        if (outcomeTokensOut < minOutcomeTokensOut) revert SlippageExceeded();
        uint256 netInvestment = collateralIn - creatorFee;

        for (uint256 i; i < _poolBalances.length; ++i) {
            _poolBalances[i] += netInvestment;
        }
        _poolBalances[outcomeIndex] -= outcomeTokensOut;
        _outcomeBalances[recipient][outcomeIndex] += outcomeTokensOut;
        creatorFeesAccrued += creatorFee;

        emit Trade(recipient, true, outcomeIndex, collateralIn, outcomeTokensOut, creatorFee);
    }

    function _executeSell(
        address recipient,
        uint256 collateralOut,
        uint256 outcomeIndex,
        uint256 outcomeTokensIn,
        uint256 creatorFee
    ) private {
        uint256 grossReturn = collateralOut + creatorFee;
        _poolBalances[outcomeIndex] += outcomeTokensIn;
        for (uint256 i; i < _poolBalances.length; ++i) {
            _poolBalances[i] -= grossReturn;
        }
        creatorFeesAccrued += creatorFee;
        collateral.safeTransfer(recipient, collateralOut);

        emit Trade(recipient, false, outcomeIndex, collateralOut, outcomeTokensIn, creatorFee);
    }

    function _requireOutcome(uint256 outcomeIndex) private view {
        if (outcomeIndex >= _outcomeLabels.length) revert InvalidOutcome();
    }
}
