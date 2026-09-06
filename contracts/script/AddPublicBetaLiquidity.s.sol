// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BidMarket} from "../src/BidMarket.sol";

/// @dev One-time, replay-safe top-up for the verified Miami public beta.
contract AddPublicBetaLiquidity is Script {
    IERC20 private constant USDG = IERC20(0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168);
    BidMarket private constant MARKET = BidMarket(0xb5693d5C6c944Bea96c1c62B66c736D5C69AAd32);
    address private constant EXPECTED_DEPLOYER = 0xD935D28E466A3a95c4c4daA1421Fc8E1a5af24aD;
    uint256 private constant TOP_UP = 25e6;
    uint256 private constant TARGET_BACKING = 50e6;

    function run() external {
        require(block.chainid == 4663, "mainnet chain 4663 required");
        require(address(MARKET.collateral()) == address(USDG), "market collateral mismatch");
        require(!MARKET.resolved() && block.timestamp < MARKET.closesAt(), "market is not open");

        uint256 backingBefore = USDG.balanceOf(address(MARKET));
        if (backingBefore >= TARGET_BACKING) {
            console2.log("BID liquidity target already reached; no transaction submitted");
            return;
        }
        require(backingBefore == 25e6, "unexpected market backing");

        uint256 privateKey = vm.envUint("LP_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        require(deployer == EXPECTED_DEPLOYER, "LP deployer mismatch");
        require(USDG.balanceOf(deployer) >= TOP_UP, "LP deployer needs 25 USDG");

        (uint256 quotedShares, uint256[] memory residuals) = MARKET.quoteAddFunding(TOP_UP);
        require(quotedShares == TOP_UP, "unexpected LP quote");
        for (uint256 i; i < residuals.length; ++i) require(residuals[i] == 0, "pool is not balanced");

        uint256 lpBefore = MARKET.balanceOf(deployer);
        vm.startBroadcast(privateKey);
        require(USDG.approve(address(MARKET), TOP_UP), "USDG approval failed");
        uint256 sharesMinted = MARKET.addFunding(TOP_UP, TOP_UP);
        vm.stopBroadcast();

        require(sharesMinted == TOP_UP, "unexpected LP shares");
        require(USDG.balanceOf(address(MARKET)) == TARGET_BACKING, "backing target not reached");
        require(MARKET.balanceOf(deployer) == lpBefore + TOP_UP, "LP shares not received");
        console2.log("BID public beta backing increased to 50 USDG");
    }
}
