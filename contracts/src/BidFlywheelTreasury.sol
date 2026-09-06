// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {BidFeePolicy} from "./BidFeePolicy.sol";

interface IPonsFeeEscrow {
    function claim() external returns (uint256 amount);
    function claimToken(address token) external returns (uint256 amount);
}

interface IPonsFeeHook {
    function sweepPoolFees(bytes32 poolId, uint256 minConversionQuoteOut, uint256 minBuybackTokensOut) external;
}

interface IPonsCurve {
    function sweepFees(uint256 minBuybackTokensOut) external;
}

interface IPonsCreatorControls {
    function transferCreatorFeeRecipient(address token, address newRecipient) external;
}

contract BidFlywheelTreasury is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ALLOCATION_VERSION = BidFeePolicy.VERSION;
    uint256 public constant LP_REWARDS_BPS = BidFeePolicy.LP_REWARDS_BPS;
    uint256 public constant MARKET_LIQUIDITY_BPS = BidFeePolicy.MARKET_LIQUIDITY_BPS;
    uint256 public constant BUYBACK_BURN_BPS = BidFeePolicy.BUYBACK_BURN_BPS;
    uint256 public constant TREASURY_BPS = BidFeePolicy.TREASURY_BPS;
    uint256 public constant CREATOR_REWARDS_BPS = BidFeePolicy.CREATOR_REWARDS_BPS;
    uint256 public constant BPS = BidFeePolicy.BPS;

    error InvalidDestination();
    error InvalidFeeEscrow();
    error InvalidFeeHook();
    error InvalidPonsFactory();
    error InvalidPonsCurve();
    error NothingToDistribute();
    error NativeTransferFailed();
    error ClaimAmountMismatch();

    event DestinationsUpdated(
        address indexed lpRewardsReserve,
        address indexed liquidityVault,
        address indexed buybackBurnReserve,
        address protocolTreasury,
        address creatorRewardsReserve
    );
    event PonsFeeEscrowUpdated(address indexed feeEscrow);
    event PonsFeeHookUpdated(address indexed feeHook);
    event PonsCurveUpdated(address indexed curve);
    event PonsCreatorFeeRecipientTransferred(address indexed token, address indexed newRecipient);
    event PonsCurveFeesSwept(address indexed curve);
    event PonsPoolFeesSwept(bytes32 indexed poolId);
    event PonsFeesClaimed(address indexed token, uint256 amount);
    event FeeAllocated(
        bytes32 indexed allocationVersion,
        address indexed asset,
        uint256 grossAmount,
        uint256 lpRewardsAmount,
        uint256 marketLiquidityAmount,
        uint256 buybackBurnAmount,
        uint256 treasuryAmount,
        uint256 creatorRewardsAmount
    );

    address public lpRewardsReserve;
    address public liquidityVault;
    address public buybackBurnReserve;
    address public protocolTreasury;
    address public creatorRewardsReserve;
    IPonsFeeEscrow public ponsFeeEscrow;
    IPonsFeeHook public ponsFeeHook;
    IPonsCreatorControls public immutable ponsFactory;
    IPonsCurve public ponsCurve;

    constructor(
        address lpRewardsReserve_,
        address liquidityVault_,
        address buybackBurnReserve_,
        address protocolTreasury_,
        address creatorRewardsReserve_,
        address ponsFactory_,
        address ponsFeeEscrow_,
        address ponsFeeHook_,
        address initialOwner
    ) Ownable(initialOwner) {
        BidFeePolicy.validate();
        _setDestinations(
            lpRewardsReserve_, liquidityVault_, buybackBurnReserve_, protocolTreasury_, creatorRewardsReserve_
        );
        if (ponsFactory_ != address(0) && ponsFactory_.code.length == 0) revert InvalidPonsFactory();
        ponsFactory = IPonsCreatorControls(ponsFactory_);
        if (ponsFeeEscrow_ != address(0)) _setPonsFeeEscrow(ponsFeeEscrow_);
        if (ponsFeeHook_ != address(0)) _setPonsFeeHook(ponsFeeHook_);
    }

    receive() external payable {}

    function setDestinations(
        address lpRewardsReserve_,
        address liquidityVault_,
        address buybackBurnReserve_,
        address protocolTreasury_,
        address creatorRewardsReserve_
    ) external onlyOwner {
        _setDestinations(
            lpRewardsReserve_, liquidityVault_, buybackBurnReserve_, protocolTreasury_, creatorRewardsReserve_
        );
    }

    function setPonsFeeEscrow(address feeEscrow_) external onlyOwner {
        _setPonsFeeEscrow(feeEscrow_);
    }

    function setPonsFeeHook(address feeHook_) external onlyOwner {
        _setPonsFeeHook(feeHook_);
    }

    function setPonsCurve(address curve_) external onlyOwner {
        if (curve_ == address(0) || curve_.code.length == 0) revert InvalidPonsCurve();
        ponsCurve = IPonsCurve(curve_);
        emit PonsCurveUpdated(curve_);
    }

    function transferPonsCreatorFeeRecipient(address token, address newRecipient) external onlyOwner nonReentrant {
        IPonsCreatorControls factory = ponsFactory;
        if (address(factory) == address(0) || token == address(0) || newRecipient == address(0)) {
            revert InvalidPonsFactory();
        }
        factory.transferCreatorFeeRecipient(token, newRecipient);
        emit PonsCreatorFeeRecipientTransferred(token, newRecipient);
    }

    function sweepPonsCurveFees(uint256 minBuybackTokensOut) external nonReentrant {
        IPonsCurve curve = ponsCurve;
        if (address(curve) == address(0)) revert InvalidPonsCurve();
        curve.sweepFees(minBuybackTokensOut);
        emit PonsCurveFeesSwept(address(curve));
    }

    function sweepPonsPoolFees(bytes32 poolId, uint256 minConversionQuoteOut, uint256 minBuybackTokensOut)
        external
        nonReentrant
    {
        IPonsFeeHook feeHook = ponsFeeHook;
        if (address(feeHook) == address(0)) revert InvalidFeeHook();
        feeHook.sweepPoolFees(poolId, minConversionQuoteOut, minBuybackTokensOut);
        emit PonsPoolFeesSwept(poolId);
    }

    function claimPonsNative() external nonReentrant returns (uint256 amount) {
        amount = _claimPonsNative();
    }

    function claimPonsToken(address token) external nonReentrant returns (uint256 amount) {
        amount = _claimPonsToken(token);
    }

    function claimAndDistributePonsNative() external nonReentrant returns (uint256 amount) {
        amount = _claimPonsNative();
        if (amount == 0) revert NothingToDistribute();
        _distributeNative(amount);
    }

    function claimAndDistributePonsToken(IERC20 token) external nonReentrant returns (uint256 amount) {
        amount = _claimPonsToken(address(token));
        if (amount == 0) revert NothingToDistribute();
        _distributeToken(token, amount);
    }

    function distributeNative() external nonReentrant {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToDistribute();
        _distributeNative(amount);
    }

    function distributeToken(IERC20 token) external nonReentrant {
        uint256 amount = token.balanceOf(address(this));
        if (amount == 0) revert NothingToDistribute();
        _distributeToken(token, amount);
    }

    function previewAllocation(uint256 grossAmount)
        external
        pure
        returns (
            uint256 lpRewardsAmount,
            uint256 marketLiquidityAmount,
            uint256 buybackBurnAmount,
            uint256 treasuryAmount,
            uint256 creatorRewardsAmount
        )
    {
        return _split(grossAmount);
    }

    function _claimPonsNative() private returns (uint256 amount) {
        IPonsFeeEscrow feeEscrow = ponsFeeEscrow;
        if (address(feeEscrow) == address(0)) revert InvalidFeeEscrow();
        uint256 balanceBefore = address(this).balance;
        uint256 reportedAmount = feeEscrow.claim();
        amount = address(this).balance - balanceBefore;
        if (amount != reportedAmount) revert ClaimAmountMismatch();
        emit PonsFeesClaimed(address(0), amount);
    }

    function _claimPonsToken(address token) private returns (uint256 amount) {
        IPonsFeeEscrow feeEscrow = ponsFeeEscrow;
        if (address(feeEscrow) == address(0) || token == address(0)) revert InvalidFeeEscrow();
        IERC20 feeToken = IERC20(token);
        uint256 balanceBefore = feeToken.balanceOf(address(this));
        uint256 reportedAmount = feeEscrow.claimToken(token);
        amount = feeToken.balanceOf(address(this)) - balanceBefore;
        if (amount != reportedAmount) revert ClaimAmountMismatch();
        emit PonsFeesClaimed(token, amount);
    }

    function _distributeNative(uint256 amount) private {
        (
            uint256 lpRewardsAmount,
            uint256 marketLiquidityAmount,
            uint256 buybackBurnAmount,
            uint256 treasuryAmount,
            uint256 creatorRewardsAmount
        ) = _split(amount);

        _sendNative(lpRewardsReserve, lpRewardsAmount);
        _sendNative(liquidityVault, marketLiquidityAmount);
        _sendNative(buybackBurnReserve, buybackBurnAmount);
        _sendNative(protocolTreasury, treasuryAmount);
        _sendNative(creatorRewardsReserve, creatorRewardsAmount);
        emit FeeAllocated(
            ALLOCATION_VERSION,
            address(0),
            amount,
            lpRewardsAmount,
            marketLiquidityAmount,
            buybackBurnAmount,
            treasuryAmount,
            creatorRewardsAmount
        );
    }

    function _distributeToken(IERC20 token, uint256 amount) private {
        (
            uint256 lpRewardsAmount,
            uint256 marketLiquidityAmount,
            uint256 buybackBurnAmount,
            uint256 treasuryAmount,
            uint256 creatorRewardsAmount
        ) = _split(amount);

        token.safeTransfer(lpRewardsReserve, lpRewardsAmount);
        token.safeTransfer(liquidityVault, marketLiquidityAmount);
        token.safeTransfer(buybackBurnReserve, buybackBurnAmount);
        token.safeTransfer(protocolTreasury, treasuryAmount);
        token.safeTransfer(creatorRewardsReserve, creatorRewardsAmount);
        emit FeeAllocated(
            ALLOCATION_VERSION,
            address(token),
            amount,
            lpRewardsAmount,
            marketLiquidityAmount,
            buybackBurnAmount,
            treasuryAmount,
            creatorRewardsAmount
        );
    }

    function _split(uint256 grossAmount)
        private
        pure
        returns (
            uint256 lpRewardsAmount,
            uint256 marketLiquidityAmount,
            uint256 buybackBurnAmount,
            uint256 treasuryAmount,
            uint256 creatorRewardsAmount
        )
    {
        lpRewardsAmount = grossAmount * LP_REWARDS_BPS / BPS;
        marketLiquidityAmount = grossAmount * MARKET_LIQUIDITY_BPS / BPS;
        buybackBurnAmount = grossAmount * BUYBACK_BURN_BPS / BPS;
        creatorRewardsAmount = grossAmount * CREATOR_REWARDS_BPS / BPS;
        treasuryAmount =
            grossAmount - lpRewardsAmount - marketLiquidityAmount - buybackBurnAmount - creatorRewardsAmount;
    }

    function _setDestinations(
        address lpRewardsReserve_,
        address liquidityVault_,
        address buybackBurnReserve_,
        address protocolTreasury_,
        address creatorRewardsReserve_
    ) private {
        if (
            lpRewardsReserve_ == address(0) || liquidityVault_ == address(0) || buybackBurnReserve_ == address(0)
                || protocolTreasury_ == address(0) || creatorRewardsReserve_ == address(0)
        ) revert InvalidDestination();

        lpRewardsReserve = lpRewardsReserve_;
        liquidityVault = liquidityVault_;
        buybackBurnReserve = buybackBurnReserve_;
        protocolTreasury = protocolTreasury_;
        creatorRewardsReserve = creatorRewardsReserve_;
        emit DestinationsUpdated(
            lpRewardsReserve_, liquidityVault_, buybackBurnReserve_, protocolTreasury_, creatorRewardsReserve_
        );
    }

    function _setPonsFeeEscrow(address feeEscrow_) private {
        if (feeEscrow_ == address(0) || feeEscrow_.code.length == 0) revert InvalidFeeEscrow();
        ponsFeeEscrow = IPonsFeeEscrow(feeEscrow_);
        emit PonsFeeEscrowUpdated(feeEscrow_);
    }

    function _setPonsFeeHook(address feeHook_) private {
        if (feeHook_ == address(0) || feeHook_.code.length == 0) revert InvalidFeeHook();
        ponsFeeHook = IPonsFeeHook(feeHook_);
        emit PonsFeeHookUpdated(feeHook_);
    }

    function _sendNative(address recipient, uint256 amount) private {
        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) revert NativeTransferFailed();
    }
}
