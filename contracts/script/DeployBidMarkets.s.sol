// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BidMarketFactory} from "../src/BidMarketFactory.sol";
import {BidFlywheelTreasury} from "../src/BidFlywheelTreasury.sol";

contract DeployBidMarkets is Script {
    function run()
        external
        returns (BidMarketFactory factory, BidFlywheelTreasury flywheelTreasury)
    {
        address collateral = vm.envAddress("BID_COLLATERAL_TOKEN");
        address bidToken = vm.envAddress("BID_TOKEN_ADDRESS");
        address oracle = vm.envAddress("BID_RESOLUTION_ORACLE");
        address owner = vm.envAddress("BID_FACTORY_OWNER");
        address rewardsVault = vm.envAddress("BID_REWARDS_VAULT");
        address liquidityVault = vm.envAddress("BID_LIQUIDITY_VAULT");

        vm.startBroadcast();
        factory = new BidMarketFactory(IERC20(collateral), IERC20(bidToken), oracle, owner);
        flywheelTreasury = new BidFlywheelTreasury(rewardsVault, liquidityVault, owner);
        vm.stopBroadcast();
    }
}
