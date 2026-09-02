// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BidFlywheelTreasury is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant REWARDS_SHARE_BPS = 5_000;
    uint256 public constant BPS = 10_000;

    error InvalidDestination();
    error NothingToDistribute();
    error NativeTransferFailed();

    event DestinationsUpdated(address indexed rewardsVault, address indexed liquidityVault);
    event NativeDistributed(uint256 rewardsAmount, uint256 liquidityAmount);
    event TokenDistributed(
        address indexed token,
        uint256 rewardsAmount,
        uint256 liquidityAmount
    );

    address public rewardsVault;
    address public liquidityVault;

    constructor(address rewardsVault_, address liquidityVault_, address initialOwner)
        Ownable(initialOwner)
    {
        _setDestinations(rewardsVault_, liquidityVault_);
    }

    receive() external payable {}

    function setDestinations(address rewardsVault_, address liquidityVault_) external onlyOwner {
        _setDestinations(rewardsVault_, liquidityVault_);
    }

    function distributeNative() external nonReentrant {
        uint256 total = address(this).balance;
        if (total == 0) revert NothingToDistribute();
        (uint256 rewardsAmount, uint256 liquidityAmount) = _split(total);

        (bool rewardsSent,) = rewardsVault.call{value: rewardsAmount}("");
        if (!rewardsSent) revert NativeTransferFailed();
        (bool liquiditySent,) = liquidityVault.call{value: liquidityAmount}("");
        if (!liquiditySent) revert NativeTransferFailed();

        emit NativeDistributed(rewardsAmount, liquidityAmount);
    }

    function distributeToken(IERC20 token) external nonReentrant {
        uint256 total = token.balanceOf(address(this));
        if (total == 0) revert NothingToDistribute();
        (uint256 rewardsAmount, uint256 liquidityAmount) = _split(total);

        token.safeTransfer(rewardsVault, rewardsAmount);
        token.safeTransfer(liquidityVault, liquidityAmount);
        emit TokenDistributed(address(token), rewardsAmount, liquidityAmount);
    }

    function _split(uint256 total)
        private
        pure
        returns (uint256 rewardsAmount, uint256 liquidityAmount)
    {
        rewardsAmount = total * REWARDS_SHARE_BPS / BPS;
        liquidityAmount = total - rewardsAmount;
    }

    function _setDestinations(address rewardsVault_, address liquidityVault_) private {
        if (rewardsVault_ == address(0) || liquidityVault_ == address(0)) {
            revert InvalidDestination();
        }
        rewardsVault = rewardsVault_;
        liquidityVault = liquidityVault_;
        emit DestinationsUpdated(rewardsVault_, liquidityVault_);
    }
}
