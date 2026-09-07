// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BidMarket} from "../src/BidMarket.sol";
import {BidLiquidityVault} from "../src/BidLiquidityVault.sol";

/// @dev One-time, replay-safe recovery for the retired Miami public beta.
contract RecoverPublicBetaLiquidity is Script {
    IERC20 private constant USDG = IERC20(0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168);
    BidMarket private constant MARKET = BidMarket(0xb5693d5C6c944Bea96c1c62B66c736D5C69AAd32);
    BidLiquidityVault private constant VAULT =
        BidLiquidityVault(payable(0x0f45ea0d8F59BAd9203FD9e541645CAED048D215));
    address private constant RECIPIENT = 0xD935D28E466A3a95c4c4daA1421Fc8E1a5af24aD;
    uint256 private constant EXPECTED_LP_SUPPLY = 50e6;

    function run() external {
        require(block.chainid == 4663, "mainnet chain 4663 required");
        require(address(MARKET.collateral()) == address(USDG), "market collateral mismatch");
        require(VAULT.owner() == RECIPIENT, "liquidity vault owner mismatch");
        require(VAULT.approvedMarkets(address(MARKET)), "market not approved by vault");

        uint256 walletShares = MARKET.balanceOf(RECIPIENT);
        uint256 vaultShares = MARKET.balanceOf(address(VAULT));
        uint256 totalShares = MARKET.totalSupply();
        require(totalShares <= EXPECTED_LP_SUPPLY, "LP supply exceeds verified beta amount");
        require(totalShares == walletShares + vaultShares, "unexpected third-party LP holder");

        uint256 privateKey = vm.envUint("LP_DEPLOYER_PRIVATE_KEY");
        require(vm.addr(privateKey) == RECIPIENT, "LP deployer mismatch");

        if (totalShares == 0 && USDG.balanceOf(address(VAULT)) == 0) {
            console2.log("BID public beta liquidity already recovered; no transaction submitted");
            return;
        }

        vm.startBroadcast(privateKey);

        if (walletShares > 0) {
            (uint256 collateralOut, uint256[] memory residuals) =
                MARKET.quoteRemoveFundingToCollateral(walletShares);
            require(collateralOut > 0, "wallet LP recovery quote is zero");
            _requireTinyResidual(residuals);
            MARKET.removeFundingToCollateral(walletShares, collateralOut);
            console2.log("Wallet LP recovered USDG", collateralOut);
        }

        vaultShares = MARKET.balanceOf(address(VAULT));
        if (vaultShares > 0) {
            (uint256 collateralOut, uint256[] memory residuals) =
                MARKET.quoteRemoveFundingToCollateral(vaultShares);
            require(collateralOut > 0, "vault LP recovery quote is zero");
            _requireTinyResidual(residuals);
            VAULT.removeLiquidity(address(MARKET), vaultShares, collateralOut);
            console2.log("Vault LP recovered USDG", collateralOut);
        }

        uint256 vaultBalance = USDG.balanceOf(address(VAULT));
        if (vaultBalance > 0) {
            VAULT.recoverToken(USDG, RECIPIENT, vaultBalance);
            console2.log("Vault USDG returned to recipient", vaultBalance);
        }

        vm.stopBroadcast();

        require(MARKET.totalSupply() == 0, "LP supply remains after recovery");
        require(MARKET.balanceOf(RECIPIENT) == 0, "wallet LP remains after recovery");
        require(MARKET.balanceOf(address(VAULT)) == 0, "vault LP remains after recovery");
        require(USDG.balanceOf(address(VAULT)) == 0, "USDG remains in vault");
        require(USDG.balanceOf(address(MARKET)) <= 1, "unexpected market USDG remains");
        console2.log("BID public beta 50 USDG recovery complete");
    }

    function _requireTinyResidual(uint256[] memory residuals) private pure {
        uint256 totalResidual;
        for (uint256 i; i < residuals.length; ++i) totalResidual += residuals[i];
        require(totalResidual <= 1, "recovery would leave material outcome inventory");
    }
}
