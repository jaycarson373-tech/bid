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
        address liquidityVaultOwner = vm.envAddress("BID_LIQUIDITY_VAULT_OWNER");
        BidMarketFactory factory = BidMarketFactory(vm.envAddress("BID_MARKET_FACTORY"));
        BidLiquidityVault liquidityVault = BidLiquidityVault(payable(vm.envAddress("BID_LIQUIDITY_VAULT")));
        uint64 closesAt = uint64(vm.envUint("BID_MARKET_CLOSE_TIME"));
        uint256 liquidityPerMarket = vm.envUint("BID_INITIAL_LIQUIDITY");
        uint256 marketCount = vm.envOr("BID_GENESIS_MARKET_COUNT", uint256(1));

        require(block.chainid == expectedChainId, "unexpected chain");
        require(deployer != address(0) && liquidityVaultOwner != address(0), "zero owner");
        require(address(factory).code.length > 0, "factory has no code");
        require(address(liquidityVault).code.length > 0, "liquidity vault has no code");
        require(factory.owner() == deployer, "deployer is not factory owner");
        require(liquidityVault.owner() == deployer, "deployer is not liquidity vault owner");
        require(address(liquidityVault.collateral()) == address(factory.collateral()), "collateral mismatch");
        require(closesAt > block.timestamp, "market already closed");
        require(liquidityPerMarket > 0, "zero liquidity");
        require(marketCount > 0 && marketCount <= 3, "market count must be 1-3");

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
        factory.collateral().approve(address(factory), liquidityPerMarket * marketCount);
        miamiTampa = factory.createProtocolGenesisMarket(
            "Which city will post the larger home-price increase by year-end?",
            floridaOutcomes,
            closesAt,
            liquidityPerMarket,
            address(liquidityVault)
        );
        if (marketCount >= 2) {
            cityField = factory.createProtocolGenesisMarket(
                "Which U.S. city will have the highest home-price increase by EOY?",
                cityOutcomes,
                closesAt,
                liquidityPerMarket,
                address(liquidityVault)
            );
        }
        if (marketCount == 3) {
            austin = factory.createProtocolGenesisMarket(
                "Will Austin home prices finish 2026 positive year over year?",
                austinOutcomes,
                closesAt,
                liquidityPerMarket,
                address(liquidityVault)
            );
        }
        liquidityVault.setMarketApproval(miamiTampa, true);
        if (cityField != address(0)) liquidityVault.setMarketApproval(cityField, true);
        if (austin != address(0)) liquidityVault.setMarketApproval(austin, true);
        liquidityVault.transferOwnership(liquidityVaultOwner);
        vm.stopBroadcast();

        console2.log("NEXT_PUBLIC_BID_MARKET_MIA_TPA=%s", miamiTampa);
        if (cityField != address(0)) console2.log("NEXT_PUBLIC_BID_MARKET_CITY_FIELD=%s", cityField);
        if (austin != address(0)) console2.log("NEXT_PUBLIC_BID_MARKET_AUSTIN=%s", austin);
        console2.log("Factory ownership remains temporarily with BID_DEPLOYER until the final BID CA is bound");
    }
}
