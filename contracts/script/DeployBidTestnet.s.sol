// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {BidMarket} from "../src/BidMarket.sol";
import {BidMarketFactory} from "../src/BidMarketFactory.sol";
import {BidFlywheelTreasury} from "../src/BidFlywheelTreasury.sol";
import {BidTestToken} from "../src/testnet/BidTestToken.sol";
import {BidTestVault} from "../src/testnet/BidTestVault.sol";

contract DeployBidTestnet is Script {
    uint256 private constant DEFAULT_CLOSE_TIME = 1_798_761_599;
    uint256 private constant DEFAULT_LIQUIDITY = 100_000e6;

    BidTestToken private collateral;
    BidTestToken private bidToken;
    BidTestVault private rewardsVault;
    BidTestVault private liquidityVault;
    BidFlywheelTreasury private flywheelTreasury;
    BidMarketFactory private factory;
    address private miamiTampa;
    address private cityField;
    address private austin;

    function run() external {
        address deployer = vm.envAddress("BID_TESTNET_DEPLOYER");
        uint256 liquidityPerMarket = vm.envOr("BID_TESTNET_INITIAL_LIQUIDITY", DEFAULT_LIQUIDITY);
        uint256 defaultCloseTime =
            block.timestamp < DEFAULT_CLOSE_TIME ? DEFAULT_CLOSE_TIME : block.timestamp + 180 days;
        uint64 closesAt = uint64(vm.envOr("BID_TESTNET_CLOSE_TIME", defaultCloseTime));

        vm.startBroadcast(deployer);
        _deployInfrastructure(deployer, liquidityPerMarket);
        _createGenesisMarkets(closesAt, liquidityPerMarket);
        vm.stopBroadcast();

        _logDeployment(deployer, closesAt);
    }

    function _deployInfrastructure(address deployer, uint256 liquidityPerMarket) private {
        collateral = new BidTestToken("BID Test USDG", "tUSDG", 6, deployer, liquidityPerMarket * 3 + 2_000_000e6, true);
        bidToken = new BidTestToken("BID Test Token", "tBID", 18, deployer, 1_000_000_000e18, false);
        rewardsVault = new BidTestVault(deployer);
        liquidityVault = new BidTestVault(deployer);
        flywheelTreasury = new BidFlywheelTreasury(address(rewardsVault), address(liquidityVault), deployer);
        factory = new BidMarketFactory(collateral, bidToken, deployer, deployer);

        collateral.approve(address(factory), liquidityPerMarket * 3);
    }

    function _createGenesisMarkets(uint64 closesAt, uint256 liquidityPerMarket) private {
        string[] memory floridaOutcomes = new string[](2);
        floridaOutcomes[0] = "Miami";
        floridaOutcomes[1] = "Tampa";
        miamiTampa = factory.createGenesisMarket(
            "Which city will post the larger home-price increase by year-end?",
            floridaOutcomes,
            closesAt,
            liquidityPerMarket
        );

        string[] memory cityOutcomes = new string[](5);
        cityOutcomes[0] = "Miami";
        cityOutcomes[1] = "Tampa";
        cityOutcomes[2] = "New York";
        cityOutcomes[3] = "Dallas";
        cityOutcomes[4] = "Phoenix";
        cityField = factory.createGenesisMarket(
            "Which U.S. city will have the highest home-price increase by EOY?",
            cityOutcomes,
            closesAt,
            liquidityPerMarket
        );

        string[] memory austinOutcomes = new string[](2);
        austinOutcomes[0] = "Yes";
        austinOutcomes[1] = "No";
        austin = factory.createGenesisMarket(
            "Will Austin home prices finish 2026 positive year over year?", austinOutcomes, closesAt, liquidityPerMarket
        );
    }

    function _logDeployment(address deployer, uint64 closesAt) private view {
        console2.log("BID_TESTNET_DEPLOYER=%s", deployer);
        console2.log("NEXT_PUBLIC_BID_COLLATERAL_ADDRESS=%s", address(collateral));
        console2.log("NEXT_PUBLIC_BID_CONTRACT_ADDRESS=%s", address(bidToken));
        console2.log("NEXT_PUBLIC_BID_MARKET_FACTORY=%s", address(factory));
        console2.log("NEXT_PUBLIC_BID_FLYWHEEL_TREASURY=%s", address(flywheelTreasury));
        console2.log("NEXT_PUBLIC_BID_REWARDS_VAULT=%s", address(rewardsVault));
        console2.log("NEXT_PUBLIC_BID_LIQUIDITY_VAULT=%s", address(liquidityVault));
        console2.log("NEXT_PUBLIC_BID_MARKET_MIA_TPA=%s", miamiTampa);
        console2.log("NEXT_PUBLIC_BID_MARKET_CITY_FIELD=%s", cityField);
        console2.log("NEXT_PUBLIC_BID_MARKET_AUSTIN=%s", austin);
        console2.log("BID_TESTNET_CLOSE_TIME=%s", closesAt);
    }
}
