// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {DeployBidTreasury} from "./DeployBidTreasury.s.sol";
import {DeployBidMarkets} from "./DeployBidMarkets.s.sol";
import {BidFlywheelTreasury} from "../src/BidFlywheelTreasury.sol";
import {BidLiquidityVault} from "../src/BidLiquidityVault.sol";
import {BidMarketFactory} from "../src/BidMarketFactory.sol";
import {BidReserveVault} from "../src/BidReserveVault.sol";

/// @dev Composes the existing deployment steps; no token launch or CA binding.
contract DeployBidBeta is Script {
    function run() external returns (address, address, address) {
        require(block.chainid == 4663 && vm.envUint("BID_EXPECTED_CHAIN_ID") == 4663, "mainnet required");
        require(vm.envUint("BID_GENESIS_MARKET_COUNT") == 1, "beta creates exactly one market");
        require(vm.envUint("BID_INITIAL_LIQUIDITY") == 25e6, "beta seed must be 25 USDG");
        require(vm.envUint("BID_MAX_TRADE_AMOUNT") == 1e6, "beta order cap must be 1 USDG");
        uint256 closeTime = vm.envUint("BID_MARKET_CLOSE_TIME");
        require(closeTime > block.timestamp && closeTime <= type(uint64).max, "invalid close time");
        IERC20Metadata collateral = IERC20Metadata(vm.envAddress("BID_COLLATERAL_TOKEN"));
        require(address(collateral) == 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168, "wrong USDG");
        require(collateral.decimals() == 6, "wrong collateral decimals");
        require(collateral.balanceOf(vm.envAddress("BID_DEPLOYER")) >= 25e6, "deployer needs 25 USDG");
        uint256 deploymentBlock = block.number;
        address deployer = vm.envAddress("BID_DEPLOYER");

        vm.startBroadcast(deployer);
        BidReserveVault buybackReserve = new BidReserveVault(deployer);
        BidReserveVault protocolReserve = new BidReserveVault(deployer);
        BidReserveVault creatorRewardsReserve = new BidReserveVault(deployer);
        vm.stopBroadcast();
        vm.setEnv("BID_BUYBACK_VAULT", vm.toString(address(buybackReserve)));
        vm.setEnv("BID_PROTOCOL_TREASURY", vm.toString(address(protocolReserve)));
        vm.setEnv("BID_CREATOR_REWARDS_VAULT", vm.toString(address(creatorRewardsReserve)));

        (BidFlywheelTreasury treasury, BidLiquidityVault vault,) = new DeployBidTreasury().run();
        BidMarketFactory factory = new DeployBidMarkets().run();
        address vaultOwner = vm.envAddress("BID_LIQUIDITY_VAULT_OWNER");
        require(vaultOwner != address(0), "zero vault owner");
        string[] memory outcomes = new string[](5);
        outcomes[0] = "Miami";
        outcomes[1] = "Tampa";
        outcomes[2] = "New York";
        outcomes[3] = "Dallas";
        outcomes[4] = "Phoenix";
        vm.startBroadcast(deployer);
        collateral.approve(address(factory), 25e6);
        address market = factory.createProtocolGenesisMarket(
            "Which city posts the highest home-price growth from September 2026 to March 2027? Rules SHA-256: 9e4e62ce9a6fd5330a5716ae0c101df4437a3ad00582de88cd72ffb914a3c406",
            outcomes, uint64(closeTime), 25e6, address(vault)
        );
        vault.setMarketApproval(market, true);
        vault.transferOwnership(vaultOwner);
        vm.stopBroadcast();

        console2.log("BID_MARKET_FACTORY=%s", address(factory));
        console2.log("BID_FLYWHEEL_TREASURY=%s", address(treasury));
        console2.log("BID_LIQUIDITY_VAULT=%s", address(vault));
        console2.log("NEXT_PUBLIC_BID_BUYBACK_VAULT=%s", address(buybackReserve));
        console2.log("NEXT_PUBLIC_BID_PROTOCOL_TREASURY=%s", address(protocolReserve));
        console2.log("NEXT_PUBLIC_BID_CREATOR_REWARDS_VAULT=%s", address(creatorRewardsReserve));
        console2.log("KEEPER_MARKETS=%s", market);
        console2.log("NEXT_PUBLIC_BID_MARKET_CITY_FIELD=%s", market);
        console2.log("NEXT_PUBLIC_BID_MARKET_MIA_TPA and NEXT_PUBLIC_BID_MARKET_AUSTIN must stay empty.");
        console2.log("NEXT_PUBLIC_BID_DEPLOYMENT_BLOCK=%s", deploymentBlock);
        console2.log("Pons creatorFeeRecipient (public contract address)=%s", address(treasury));
        console2.log("Simulation addresses are NOT deployed until broadcast receipts succeed.");
        return (market, address(treasury), address(vault));
    }
}
