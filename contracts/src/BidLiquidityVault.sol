// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBidLiquidityMarket is IERC20 {
    function collateral() external view returns (IERC20);
    function addFunding(uint256 collateralAmount, uint256 minSharesMinted) external returns (uint256 sharesMinted);
    function removeFundingToCollateral(uint256 sharesToBurn, uint256 minCollateralOut)
        external
        returns (uint256 collateralOut, uint256[] memory residualOutcomeTokensOut);
    function redeem() external returns (uint256 collateralOut);
}

contract BidLiquidityVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotOperator();
    error InvalidAddress();
    error MarketNotApproved();
    error CollateralMismatch();
    error NativeTransferFailed();

    event OperatorUpdated(address indexed operator);
    event MarketApprovalUpdated(address indexed market, bool approved);
    event LiquidityDeployed(address indexed market, uint256 collateralAmount, uint256 sharesMinted);
    event LiquidityRemoved(address indexed market, uint256 sharesBurned, uint256 collateralOut);
    event MarketRedeemed(address indexed market, uint256 collateralOut);
    event TokenRecovered(address indexed token, address indexed recipient, uint256 amount);
    event NativeRecovered(address indexed recipient, uint256 amount);

    IERC20 public immutable collateral;
    address public operator;
    mapping(address => bool) public approvedMarkets;

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(IERC20 collateral_, address operator_, address initialOwner) Ownable(initialOwner) {
        if (address(collateral_) == address(0) || operator_ == address(0)) revert InvalidAddress();
        collateral = collateral_;
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    receive() external payable {}

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert InvalidAddress();
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    function setMarketApproval(address market, bool approved) external onlyOwner {
        if (market == address(0) || market.code.length == 0) revert InvalidAddress();
        if (address(IBidLiquidityMarket(market).collateral()) != address(collateral)) revert CollateralMismatch();
        approvedMarkets[market] = approved;
        emit MarketApprovalUpdated(market, approved);
    }

    function deployLiquidity(address market, uint256 collateralAmount, uint256 minSharesMinted)
        external
        onlyOperator
        nonReentrant
        returns (uint256 sharesMinted)
    {
        if (!approvedMarkets[market]) revert MarketNotApproved();
        collateral.forceApprove(market, collateralAmount);
        sharesMinted = IBidLiquidityMarket(market).addFunding(collateralAmount, minSharesMinted);
        collateral.forceApprove(market, 0);
        emit LiquidityDeployed(market, collateralAmount, sharesMinted);
    }

    function removeLiquidity(address market, uint256 sharesToBurn, uint256 minCollateralOut)
        external
        onlyOwner
        nonReentrant
        returns (uint256 collateralOut, uint256[] memory residualOutcomeTokensOut)
    {
        if (!approvedMarkets[market]) revert MarketNotApproved();
        (collateralOut, residualOutcomeTokensOut) =
            IBidLiquidityMarket(market).removeFundingToCollateral(sharesToBurn, minCollateralOut);
        emit LiquidityRemoved(market, sharesToBurn, collateralOut);
    }

    function redeemMarket(address market) external onlyOwner nonReentrant returns (uint256 collateralOut) {
        if (!approvedMarkets[market]) revert MarketNotApproved();
        collateralOut = IBidLiquidityMarket(market).redeem();
        emit MarketRedeemed(market, collateralOut);
    }

    function recoverToken(IERC20 token, address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        token.safeTransfer(recipient, amount);
        emit TokenRecovered(address(token), recipient, amount);
    }

    function recoverNative(address payable recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) revert NativeTransferFailed();
        emit NativeRecovered(recipient, amount);
    }
}
