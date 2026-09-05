// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BidLiquidityVault} from "../src/BidLiquidityVault.sol";
import {BidMarketFactory} from "../src/BidMarketFactory.sol";

contract CreateGenesisMarkets is Script {
    function run() external returns (address miamiTampa, address cityField, address austin) {
        uint256 expectedChainId = vm.envUint("BID_EXPECTED_CHAIN_ID");
        address deployer = vm.envAddress("BID_DEPLOYER");
        address finalOwner = vm.envAddress("BID_FACTORY_OWNER");
        address liquidityVaultOwner = vm.envAddress("BID_LIQUIDITY_VAULT_OWNER");
        BidMarketFactory factory = BidMarketFactory(vm.envAddress("BID_MARKET_FACTORY"));
        BidLiquidityVault liquidityVault = BidLiquidityVault(payable(vm.envAddress("BID_LIQUIDITY_VAULT")));
        uint64 closesAt = uint64(vm.envUint("BID_MARKET_CLOSE_TIME"));
        uint256 liquidityPerMarket = vm.envUint("BID_INITIAL_LIQUIDITY");

        require(block.chainid == expectedChainId, "unexpected chain");
        require(deployer != address(0) && finalOwner != address(0) && liquidityVaultOwner != address(0), "zero owner");
        require(address(factory).code.length > 0, "factory has no code");
        require(address(liquidityVault).code.length > 0, "liquidity vault has no code");
        require(factory.owner() == deployer, "deployer is not factory owner");
        require(liquidityVault.owner() == deployer, "deployer is not liquidity vault owner");
        require(address(liquidityVault.collateral()) == address(factory.collateral()), "collateral mismatch");
        require(closesAt > block.timestamp, "market already closed");
        require(liquidityPerMarket > 0, "zero liquidity");

        string[] memory floridaOutcomes = new string[](2);
        floridaOutcomes[0] = "Miami";
        floridaOutcomes[1] = "Tampa";

        string[] memory cityOutcomes = new string[](5);
        cityOutcomes[0] = "Miami";
        cityOutcomes[1] = "Tampa";
        cityOutcomes[2] = "New York";
        cityOutcomes[3] = "Dallas";
        cityOutcomes[4] = "Phoenix";

        string[] memory austinOutcomes = new string[](2);
        austinOutcomes[0] = "Yes";
        austinOutcomes[1] = "No";

        vm.startBroadcast(deployer);
        factory.collateral().approve(address(factory), liquidityPerMarket * 3);
        miamiTampa = factory.createGenesisMarket(
            "Which city will post the larger home-price increase by year-end?",
            floridaOutcomes,
            closesAt,
            liquidityPerMarket
        );
        cityField = factory.createGenesisMarket(
            "Which U.S. city will have the highest home-price increase by EOY?",
            cityOutcomes,
            closesAt,
            liquidityPerMarket
        );
        austin = factory.createGenesisMarket(
            "Will Austin home prices finish 2026 positive year over year?", austinOutcomes, closesAt, liquidityPerMarket
        );
        liquidityVault.setMarketApproval(miamiTampa, true);
        liquidityVault.setMarketApproval(cityField, true);
        liquidityVault.setMarketApproval(austin, true);
        liquidityVault.transferOwnership(liquidityVaultOwner);
        factory.transferOwnership(finalOwner);
        vm.stopBroadcast();

        console2.log("NEXT_PUBLIC_BID_MARKET_MIA_TPA=%s", miamiTampa);
        console2.log("NEXT_PUBLIC_BID_MARKET_CITY_FIELD=%s", cityField);
        console2.log("NEXT_PUBLIC_BID_MARKET_AUSTIN=%s", austin);
    }
}
