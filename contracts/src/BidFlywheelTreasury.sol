// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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

    uint256 public constant REWARDS_SHARE_BPS = 7_000;
    uint256 public constant LIQUIDITY_SHARE_BPS = 2_000;
    uint256 public constant RESERVE_SHARE_BPS = 1_000;
    uint256 public constant BPS = 10_000;

    error InvalidDestination();
    error InvalidFeeEscrow();
    error InvalidFeeHook();
    error InvalidPonsFactory();
    error InvalidPonsCurve();
    error NothingToDistribute();
    error NativeTransferFailed();

    event DestinationsUpdated(
        address indexed rewardsVault, address indexed liquidityVault, address indexed reserveVault
    );
    event PonsFeeEscrowUpdated(address indexed feeEscrow);
    event PonsFeeHookUpdated(address indexed feeHook);
    event PonsCurveUpdated(address indexed curve);
    event PonsCreatorFeeRecipientTransferred(address indexed token, address indexed newRecipient);
    event PonsCurveFeesSwept(address indexed curve);
    event PonsPoolFeesSwept(bytes32 indexed poolId);
    event PonsFeesClaimed(address indexed token, uint256 amount);
    event NativeDistributed(uint256 rewardsAmount, uint256 liquidityAmount, uint256 reserveAmount);
    event TokenDistributed(
        address indexed token, uint256 rewardsAmount, uint256 liquidityAmount, uint256 reserveAmount
    );

    address public rewardsVault;
    address public liquidityVault;
    address public reserveVault;
    IPonsFeeEscrow public ponsFeeEscrow;
    IPonsFeeHook public ponsFeeHook;
    IPonsCreatorControls public immutable ponsFactory;
    IPonsCurve public ponsCurve;

    constructor(
        address rewardsVault_,
        address liquidityVault_,
        address reserveVault_,
        address ponsFactory_,
        address ponsFeeEscrow_,
        address ponsFeeHook_,
        address initialOwner
    ) Ownable(initialOwner) {
        _setDestinations(rewardsVault_, liquidityVault_, reserveVault_);
        if (ponsFactory_ != address(0) && ponsFactory_.code.length == 0) revert InvalidPonsFactory();
        ponsFactory = IPonsCreatorControls(ponsFactory_);
        if (ponsFeeEscrow_ != address(0)) _setPonsFeeEscrow(ponsFeeEscrow_);
        if (ponsFeeHook_ != address(0)) _setPonsFeeHook(ponsFeeHook_);
    }

    receive() external payable {}

    function setDestinations(address rewardsVault_, address liquidityVault_, address reserveVault_) external onlyOwner {
        _setDestinations(rewardsVault_, liquidityVault_, reserveVault_);
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
        IPonsFeeEscrow feeEscrow = ponsFeeEscrow;
        if (address(feeEscrow) == address(0)) revert InvalidFeeEscrow();
        amount = feeEscrow.claim();
        emit PonsFeesClaimed(address(0), amount);
    }

    function claimPonsToken(address token) external nonReentrant returns (uint256 amount) {
        IPonsFeeEscrow feeEscrow = ponsFeeEscrow;
        if (address(feeEscrow) == address(0) || token == address(0)) revert InvalidFeeEscrow();
        amount = feeEscrow.claimToken(token);
        emit PonsFeesClaimed(token, amount);
    }

    function distributeNative() external nonReentrant {
        uint256 total = address(this).balance;
        if (total == 0) revert NothingToDistribute();
        (uint256 rewardsAmount, uint256 liquidityAmount, uint256 reserveAmount) = _split(total);

        (bool rewardsSent,) = rewardsVault.call{value: rewardsAmount}("");
        if (!rewardsSent) revert NativeTransferFailed();
        (bool liquiditySent,) = liquidityVault.call{value: liquidityAmount}("");
        if (!liquiditySent) revert NativeTransferFailed();
        (bool reserveSent,) = reserveVault.call{value: reserveAmount}("");
        if (!reserveSent) revert NativeTransferFailed();

        emit NativeDistributed(rewardsAmount, liquidityAmount, reserveAmount);
    }

    function distributeToken(IERC20 token) external nonReentrant {
        uint256 total = token.balanceOf(address(this));
        if (total == 0) revert NothingToDistribute();
        (uint256 rewardsAmount, uint256 liquidityAmount, uint256 reserveAmount) = _split(total);

        token.safeTransfer(rewardsVault, rewardsAmount);
        token.safeTransfer(liquidityVault, liquidityAmount);
        token.safeTransfer(reserveVault, reserveAmount);
        emit TokenDistributed(address(token), rewardsAmount, liquidityAmount, reserveAmount);
    }

    function _split(uint256 total)
        private
        pure
        returns (uint256 rewardsAmount, uint256 liquidityAmount, uint256 reserveAmount)
    {
        rewardsAmount = total * REWARDS_SHARE_BPS / BPS;
        liquidityAmount = total * LIQUIDITY_SHARE_BPS / BPS;
        reserveAmount = total - rewardsAmount - liquidityAmount;
    }

    function _setDestinations(address rewardsVault_, address liquidityVault_, address reserveVault_) private {
        if (rewardsVault_ == address(0) || liquidityVault_ == address(0) || reserveVault_ == address(0)) {
            revert InvalidDestination();
        }
        rewardsVault = rewardsVault_;
        liquidityVault = liquidityVault_;
        reserveVault = reserveVault_;
        emit DestinationsUpdated(rewardsVault_, liquidityVault_, reserveVault_);
    }

    function _setPonsFeeEscrow(address feeEscrow_) private {
        if (feeEscrow_ == address(0) || feeEscrow_.code.length == 0) {
            revert InvalidFeeEscrow();
        }
        ponsFeeEscrow = IPonsFeeEscrow(feeEscrow_);
        emit PonsFeeEscrowUpdated(feeEscrow_);
    }

    function _setPonsFeeHook(address feeHook_) private {
        if (feeHook_ == address(0) || feeHook_.code.length == 0) {
            revert InvalidFeeHook();
        }
        ponsFeeHook = IPonsFeeHook(feeHook_);
        emit PonsFeeHookUpdated(feeHook_);
    }
}
