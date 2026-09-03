// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BidTestToken} from "../src/testnet/BidTestToken.sol";
import {BidTestVault} from "../src/testnet/BidTestVault.sol";

contract BidTestnetTest is Test {
    BidTestToken internal collateral;
    BidTestToken internal bidToken;
    BidTestVault internal vault;
    address internal trader = makeAddr("trader");
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        collateral = new BidTestToken("BID Test USDG", "tUSDG", 6, address(this), 1_000_000e6, true);
        bidToken = new BidTestToken("BID Test Token", "tBID", 18, address(this), 1_000_000_000e18, false);
        vault = new BidTestVault(address(this));
    }

    function testCollateralFaucetMintsOncePerCooldown() public {
        vm.prank(trader);
        collateral.faucet(10_000e6);
        assertEq(collateral.balanceOf(trader), 10_000e6);
        assertEq(collateral.decimals(), 6);

        vm.prank(trader);
        vm.expectRevert(BidTestToken.FaucetCooldownActive.selector);
        collateral.faucet(1e6);

        vm.warp(block.timestamp + collateral.FAUCET_COOLDOWN());
        vm.prank(trader);
        collateral.faucet(1e6);
        assertEq(collateral.balanceOf(trader), 10_001e6);
    }

    function testFaucetRejectsOversizedAndBidClaims() public {
        vm.prank(trader);
        vm.expectRevert(BidTestToken.FaucetAmountTooHigh.selector);
        collateral.faucet(50_001e6);

        vm.prank(trader);
        vm.expectRevert(BidTestToken.FaucetDisabled.selector);
        bidToken.faucet(1e18);
    }

    function testOwnerCanSweepTestVaultAssets() public {
        collateral.transfer(address(vault), 25_000e6);
        vm.deal(address(vault), 2 ether);

        vault.sweepToken(IERC20(address(collateral)), recipient);
        vault.sweepNative(payable(recipient));

        assertEq(collateral.balanceOf(recipient), 25_000e6);
        assertEq(recipient.balance, 2 ether);
    }

    function testNonOwnerCannotSweepVault() public {
        vm.prank(trader);
        vm.expectRevert();
        vault.sweepToken(IERC20(address(collateral)), trader);
    }
}
