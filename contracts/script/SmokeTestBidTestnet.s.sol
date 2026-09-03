// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BidFlywheelTreasury} from "../src/BidFlywheelTreasury.sol";
import {BidMarket} from "../src/BidMarket.sol";

contract SmokeTestBidTestnet is Script {
    function run() external {
        address deployer = vm.envAddress("BID_TESTNET_DEPLOYER");
        BidMarket market = BidMarket(vm.envAddress("NEXT_PUBLIC_BID_MARKET_MIA_TPA"));
        IERC20 collateral = market.collateral();
        IERC20 bidToken = IERC20(vm.envAddress("NEXT_PUBLIC_BID_CONTRACT_ADDRESS"));
        BidFlywheelTreasury flywheel = BidFlywheelTreasury(payable(vm.envAddress("NEXT_PUBLIC_BID_FLYWHEEL_TREASURY")));

        uint256[] memory pricesBefore = market.spotPricesBps();
        require(pricesBefore.length == 2, "WRONG_OUTCOME_COUNT");
        require(pricesBefore[0] + pricesBefore[1] == 10_000, "BAD_PRICE_SUM");

        vm.startBroadcast(deployer);
        collateral.approve(address(market), 10_000e6);
        uint256 bought = market.buy(1_000e6, 0, 0);
        (uint256 shares,) = market.quoteAddFunding(5_000e6);
        uint256 mintedShares = market.addFunding(5_000e6, shares * 9_950 / 10_000);
        (uint256 collateralOut,) = market.quoteRemoveFundingToCollateral(mintedShares);
        market.removeFundingToCollateral(mintedShares, collateralOut * 9_950 / 10_000);
        uint256 restingOrder = market.placeBuyLimit(500e6, 1, 5_000e6);
        market.cancelLimitOrder(restingOrder);
        _testFlywheel(flywheel, bidToken);
        vm.stopBroadcast();

        uint256[] memory pricesAfter = market.spotPricesBps();
        require(bought > 0, "ZERO_BUY_OUTPUT");
        require(pricesAfter[0] > pricesBefore[0], "PRICE_DID_NOT_MOVE");
        require(pricesAfter[0] + pricesAfter[1] == 10_000, "BAD_FINAL_PRICE_SUM");

        console2.log("SMOKE_BUY_OUTPUT=%s", bought);
        console2.log("SMOKE_PRICE_MIA_BPS=%s", pricesAfter[0]);
        console2.log("SMOKE_PRICE_TPA_BPS=%s", pricesAfter[1]);
        console2.log("SMOKE_LIMIT_ORDER_CANCELLED=%s", restingOrder);
    }

    function _testFlywheel(BidFlywheelTreasury flywheel, IERC20 bidToken) private {
        address rewardsVault = flywheel.rewardsVault();
        address liquidityVault = flywheel.liquidityVault();
        uint256 rewardsBefore = bidToken.balanceOf(rewardsVault);
        uint256 liquidityBefore = bidToken.balanceOf(liquidityVault);

        bidToken.transfer(address(flywheel), 10_000e18);
        flywheel.distributeToken(bidToken);

        require(bidToken.balanceOf(rewardsVault) - rewardsBefore == 5_000e18, "BAD_REWARDS_SPLIT");
        require(bidToken.balanceOf(liquidityVault) - liquidityBefore == 5_000e18, "BAD_LIQUIDITY_SPLIT");
        console2.log("SMOKE_FLYWHEEL_SPLIT_TBID=%s", uint256(5_000e18));
    }
}
