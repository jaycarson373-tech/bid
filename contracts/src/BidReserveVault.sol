// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Holds one fee-policy bucket until the owner approves its use.
contract BidReserveVault is Ownable {
    using SafeERC20 for IERC20;

    error NativeTransferFailed();

    event NativeWithdrawn(address indexed recipient, uint256 amount);
    event TokenWithdrawn(address indexed token, address indexed recipient, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    function withdrawNative(address payable recipient, uint256 amount) external onlyOwner {
        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) revert NativeTransferFailed();
        emit NativeWithdrawn(recipient, amount);
    }

    function withdrawToken(IERC20 token, address recipient, uint256 amount) external onlyOwner {
        token.safeTransfer(recipient, amount);
        emit TokenWithdrawn(address(token), recipient, amount);
    }
}
