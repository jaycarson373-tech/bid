// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract BidTestVault is Ownable {
    using SafeERC20 for IERC20;

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    function sweepToken(IERC20 token, address recipient) external onlyOwner {
        token.safeTransfer(recipient, token.balanceOf(address(this)));
    }

    function sweepNative(address payable recipient) external onlyOwner {
        (bool sent,) = recipient.call{value: address(this).balance}("");
        require(sent, "NATIVE_SWEEP_FAILED");
    }
}
