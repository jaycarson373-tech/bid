// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {BidMarket} from "./BidMarket.sol";

contract BidMarketFactory is Ownable {
    using SafeERC20 for IERC20;

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint16 public constant MAX_COMMUNITY_CREATOR_FEE_BPS = 300;

    error CommunityCreationDisabled();
    error TokenGateNotMet();
    error InvalidCommunityFee();
    error InvalidAddress();
    error ZeroInitialLiquidity();
    error BidTokenNotBound();
    error BidTokenAlreadyBound();
    error InvalidTradeLimit();

    event MarketCreated(
        address indexed market,
        address indexed creator,
        bool indexed communityCreated,
        uint256 initialLiquidity,
        uint16 creatorFeeBps
    );
    event CommunityCreationConfigured(
        bool enabled, uint256 minimumBidBalance, uint256 bidBurnAmount, uint16 creatorRoyaltyBps
    );
    event BidTokenBound(address indexed bidToken);
    event DefaultMaxTradeAmountUpdated(uint256 previousAmount, uint256 newAmount);
    event MarketMaxTradeAmountUpdated(address indexed market, uint256 newAmount);

    IERC20 public immutable collateral;
    IERC20 public bidToken;
    address public immutable resolutionOracle;
    uint256 public maxTradeAmount;

    bool public communityCreationEnabled;
    uint256 public minimumBidBalance;
    uint256 public bidBurnAmount;
    uint16 public creatorRoyaltyBps;

    address[] private _markets;
    mapping(address => bool) public isBidMarket;

    constructor(IERC20 collateral_, address resolutionOracle_, address initialOwner, uint256 maxTradeAmount_)
        Ownable(initialOwner)
    {
        if (address(collateral_) == address(0) || resolutionOracle_ == address(0)) {
            revert InvalidAddress();
        }
        if (maxTradeAmount_ == 0) revert InvalidTradeLimit();
        collateral = collateral_;
        resolutionOracle = resolutionOracle_;
        maxTradeAmount = maxTradeAmount_;
    }

    function bindBidToken(IERC20 bidToken_) external onlyOwner {
        if (address(bidToken) != address(0)) revert BidTokenAlreadyBound();
        if (address(bidToken_) == address(0) || address(bidToken_).code.length == 0) revert InvalidAddress();
        bidToken = bidToken_;
        emit BidTokenBound(address(bidToken_));
    }

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function marketAt(uint256 index) external view returns (address) {
        return _markets[index];
    }

    function setDefaultMaxTradeAmount(uint256 newMaxTradeAmount) external onlyOwner {
        if (newMaxTradeAmount == 0) revert InvalidTradeLimit();
        uint256 previousAmount = maxTradeAmount;
        maxTradeAmount = newMaxTradeAmount;
        emit DefaultMaxTradeAmountUpdated(previousAmount, newMaxTradeAmount);
    }

    function setMarketMaxTradeAmount(address market, uint256 newMaxTradeAmount) external onlyOwner {
        if (!isBidMarket[market]) revert InvalidAddress();
        if (newMaxTradeAmount == 0) revert InvalidTradeLimit();
        BidMarket(market).setMaxTradeAmount(newMaxTradeAmount);
        emit MarketMaxTradeAmountUpdated(market, newMaxTradeAmount);
    }

    function allMarkets() external view returns (address[] memory) {
        return _markets;
    }

    function createGenesisMarket(
        string calldata question,
        string[] calldata outcomes,
        uint64 closesAt,
        uint256 initialLiquidity
    ) external onlyOwner returns (address market) {
        market = _createMarket(msg.sender, msg.sender, question, outcomes, closesAt, initialLiquidity, 0, false);
    }

    function createProtocolGenesisMarket(
        string calldata question,
        string[] calldata outcomes,
        uint64 closesAt,
        uint256 initialLiquidity,
        address liquidityRecipient
    ) external onlyOwner returns (address market) {
        if (liquidityRecipient == address(0)) revert InvalidAddress();
        market = _createMarket(msg.sender, liquidityRecipient, question, outcomes, closesAt, initialLiquidity, 0, false);
    }

    function createCommunityMarket(
        string calldata question,
        string[] calldata outcomes,
        uint64 closesAt,
        uint256 initialLiquidity
    ) external returns (address market) {
        if (!communityCreationEnabled) revert CommunityCreationDisabled();
        IERC20 token = bidToken;
        if (address(token) == address(0)) revert BidTokenNotBound();
        if (token.balanceOf(msg.sender) < minimumBidBalance) revert TokenGateNotMet();
        if (bidBurnAmount > 0) {
            token.safeTransferFrom(msg.sender, BURN_ADDRESS, bidBurnAmount);
        }

        market = _createMarket(
            msg.sender, msg.sender, question, outcomes, closesAt, initialLiquidity, creatorRoyaltyBps, true
        );
    }

    function setCommunityCreationConfig(
        bool enabled,
        uint256 minimumBidBalance_,
        uint256 bidBurnAmount_,
        uint16 creatorRoyaltyBps_
    ) external onlyOwner {
        if (creatorRoyaltyBps_ > MAX_COMMUNITY_CREATOR_FEE_BPS) {
            revert InvalidCommunityFee();
        }
        if (enabled && address(bidToken) == address(0)) revert BidTokenNotBound();
        communityCreationEnabled = enabled;
        minimumBidBalance = minimumBidBalance_;
        bidBurnAmount = bidBurnAmount_;
        creatorRoyaltyBps = creatorRoyaltyBps_;
        emit CommunityCreationConfigured(enabled, minimumBidBalance_, bidBurnAmount_, creatorRoyaltyBps_);
    }

    function _createMarket(
        address creator,
        address liquidityRecipient,
        string calldata question,
        string[] calldata outcomes,
        uint64 closesAt,
        uint256 initialLiquidity,
        uint16 creatorFeeBps,
        bool communityCreated
    ) private returns (address marketAddress) {
        if (initialLiquidity == 0) revert ZeroInitialLiquidity();

        BidMarket.MarketConfig memory config = BidMarket.MarketConfig({
            collateral: collateral,
            factory: address(this),
            oracle: resolutionOracle,
            marketCreator: creator,
            closesAt: closesAt,
            creatorFeeBps: creatorFeeBps,
            maxTradeAmount: maxTradeAmount
        });
        BidMarket market = new BidMarket(config, question, outcomes);
        marketAddress = address(market);
        isBidMarket[marketAddress] = true;
        _markets.push(marketAddress);

        collateral.safeTransferFrom(msg.sender, marketAddress, initialLiquidity);
        market.seed(liquidityRecipient, initialLiquidity);
        emit MarketCreated(marketAddress, creator, communityCreated, initialLiquidity, creatorFeeBps);
    }
}
