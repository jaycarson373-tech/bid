// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BidMarketFactory} from "../src/BidMarketFactory.sol";

contract DeployBidMarkets is Script {
    function run() external returns (BidMarketFactory factory) {
        uint256 expectedChainId = vm.envUint("BID_EXPECTED_CHAIN_ID");
        uint256 deployerKey = vm.envOr("LP_DEPLOYER_PRIVATE_KEY", uint256(0));
        address deployer = vm.envAddress("BID_DEPLOYER");
        address collateral = vm.envAddress("BID_COLLATERAL_TOKEN");
        address oracle = vm.envAddress("BID_RESOLUTION_ORACLE");
        uint256 maxTradeAmount = vm.envUint("BID_MAX_TRADE_AMOUNT");

        require(block.chainid == expectedChainId, "unexpected chain");
        if (deployerKey != 0) require(vm.addr(deployerKey) == deployer, "LP deployer key mismatch");
        require(deployer != address(0) && oracle != address(0), "zero address");
        require(collateral.code.length > 0, "collateral has no code");

        if (deployerKey == 0) vm.startBroadcast(deployer);
        else vm.startBroadcast(deployerKey);
        require(maxTradeAmount > 0, "zero trade limit");
        factory = new BidMarketFactory(IERC20(collateral), oracle, deployer, maxTradeAmount);
        vm.stopBroadcast();

        console2.log("NEXT_PUBLIC_BID_MARKET_FACTORY=%s", address(factory));
        console2.log("BID_MAX_TRADE_AMOUNT=%s", maxTradeAmount);
        console2.log("BID market factory deployed before final token CA; BID token remains unbound");
    }
}
