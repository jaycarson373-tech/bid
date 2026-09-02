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
    error ZeroInitialLiquidity();

    event MarketCreated(
        address indexed market,
        address indexed creator,
        bool indexed communityCreated,
        uint256 initialLiquidity,
        uint16 creatorFeeBps
    );
    event CommunityCreationConfigured(
        bool enabled,
        uint256 minimumBidBalance,
        uint256 bidBurnAmount,
        uint16 creatorRoyaltyBps
    );

    IERC20 public immutable collateral;
    IERC20 public immutable bidToken;
    address public immutable resolutionOracle;

    bool public communityCreationEnabled;
    uint256 public minimumBidBalance;
    uint256 public bidBurnAmount;
    uint16 public creatorRoyaltyBps;

    address[] private _markets;
    mapping(address => bool) public isBidMarket;

    constructor(
        IERC20 collateral_,
        IERC20 bidToken_,
        address resolutionOracle_,
        address initialOwner
    ) Ownable(initialOwner) {
        collateral = collateral_;
        bidToken = bidToken_;
        resolutionOracle = resolutionOracle_;
    }

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function marketAt(uint256 index) external view returns (address) {
        return _markets[index];
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
        market = _createMarket(
            msg.sender,
            question,
            outcomes,
            closesAt,
            initialLiquidity,
            0,
            false
        );
    }

    function createCommunityMarket(
        string calldata question,
        string[] calldata outcomes,
        uint64 closesAt,
        uint256 initialLiquidity
    ) external returns (address market) {
        if (!communityCreationEnabled) revert CommunityCreationDisabled();
        if (bidToken.balanceOf(msg.sender) < minimumBidBalance) revert TokenGateNotMet();
        if (bidBurnAmount > 0) {
            bidToken.safeTransferFrom(msg.sender, BURN_ADDRESS, bidBurnAmount);
        }

        market = _createMarket(
            msg.sender,
            question,
            outcomes,
            closesAt,
            initialLiquidity,
            creatorRoyaltyBps,
            true
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
        communityCreationEnabled = enabled;
        minimumBidBalance = minimumBidBalance_;
        bidBurnAmount = bidBurnAmount_;
        creatorRoyaltyBps = creatorRoyaltyBps_;
        emit CommunityCreationConfigured(
            enabled,
            minimumBidBalance_,
            bidBurnAmount_,
            creatorRoyaltyBps_
        );
    }

    function _createMarket(
        address creator,
        string calldata question,
        string[] calldata outcomes,
        uint64 closesAt,
        uint256 initialLiquidity,
        uint16 creatorFeeBps,
        bool communityCreated
    ) private returns (address marketAddress) {
        if (initialLiquidity == 0) revert ZeroInitialLiquidity();

        BidMarket market = new BidMarket(
            collateral,
            address(this),
            resolutionOracle,
            creator,
            closesAt,
            creatorFeeBps,
            question,
            outcomes
        );
        marketAddress = address(market);
        isBidMarket[marketAddress] = true;
        _markets.push(marketAddress);

        collateral.safeTransferFrom(msg.sender, marketAddress, initialLiquidity);
        market.seed(msg.sender, initialLiquidity);
        emit MarketCreated(
            marketAddress,
            creator,
            communityCreated,
            initialLiquidity,
            creatorFeeBps
        );
    }
}
