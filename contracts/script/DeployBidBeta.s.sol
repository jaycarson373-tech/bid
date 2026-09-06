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
    address public deployedMarket;
    address public deployedTreasury;
    address public deployedLiquidityVault;
    address public deployedBuybackReserve;
    address public deployedProtocolReserve;
    address public deployedCreatorRewardsReserve;

    function run() external {
        (address deployer, uint256 deployerKey) = _configure();
        IERC20Metadata collateral = IERC20Metadata(vm.envAddress("BID_COLLATERAL_TOKEN"));
        require(address(collateral) == 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168, "wrong USDG");
        require(collateral.decimals() == 6, "wrong collateral decimals");
        require(collateral.balanceOf(deployer) >= 25e6, "deployer needs 25 USDG");
        uint256 deploymentBlock = block.number;

        _deployReserves(deployer, deployerKey);
        (BidFlywheelTreasury treasury, BidLiquidityVault vault,) = new DeployBidTreasury().run();
        BidMarketFactory factory = new DeployBidMarkets().run();
        deployedMarket = _createMarket(factory, vault, collateral, deployer, deployerKey);
        deployedTreasury = address(treasury);
        deployedLiquidityVault = address(vault);

        console2.log("BID_MARKET_FACTORY=%s", address(factory));
        console2.log("BID_FLYWHEEL_TREASURY=%s", address(treasury));
        console2.log("BID_LIQUIDITY_VAULT=%s", address(vault));
        console2.log("NEXT_PUBLIC_BID_BUYBACK_VAULT=%s", deployedBuybackReserve);
        console2.log("NEXT_PUBLIC_BID_PROTOCOL_TREASURY=%s", deployedProtocolReserve);
        console2.log("NEXT_PUBLIC_BID_CREATOR_REWARDS_VAULT=%s", deployedCreatorRewardsReserve);
        console2.log("KEEPER_MARKETS=%s", deployedMarket);
        console2.log("NEXT_PUBLIC_BID_MARKET_CITY_FIELD=%s", deployedMarket);
        console2.log("NEXT_PUBLIC_BID_MARKET_MIA_TPA and NEXT_PUBLIC_BID_MARKET_AUSTIN must stay empty.");
        console2.log("NEXT_PUBLIC_BID_DEPLOYMENT_BLOCK=%s", deploymentBlock);
        console2.log("Pons creatorFeeRecipient (public contract address)=%s", address(treasury));
        console2.log("Simulation addresses are NOT deployed until broadcast receipts succeed.");
    }

    function _configure() private returns (address deployer, uint256 deployerKey) {
        vm.setEnv("BID_EXPECTED_CHAIN_ID", "4663");
        vm.setEnv("BID_GENESIS_MARKET_COUNT", "1");
        vm.setEnv("BID_INITIAL_LIQUIDITY", "25000000");
        vm.setEnv("BID_MAX_TRADE_AMOUNT", "5000000");
        vm.setEnv("BID_MARKET_CLOSE_TIME", "1804291199");
        _defaultAddress("BID_COLLATERAL_TOKEN", 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168);
        _defaultAddress("PONS_FACTORY", 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
        _defaultAddress("PONS_FEE_ESCROW", 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e);
        _defaultAddress("PONS_FEE_HOOK", 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044);
        require(block.chainid == 4663, "mainnet required");
        deployerKey = vm.envOr("LP_DEPLOYER_PRIVATE_KEY", uint256(0));
        address configuredDeployer = vm.envOr("BID_DEPLOYER", address(0));
        deployer = deployerKey == 0 ? configuredDeployer : vm.addr(deployerKey);
        require(deployer != address(0), "LP deployer missing");
        if (configuredDeployer != address(0)) require(configuredDeployer == deployer, "LP deployer mismatch");
        vm.setEnv("BID_DEPLOYER", vm.toString(deployer));
        _defaultAddress("BID_TREASURY_OWNER", deployer);
        _defaultAddress("BID_REWARDS_OWNER", deployer);
        _defaultAddress("BID_LIQUIDITY_OPERATOR", deployer);
        _defaultAddress("BID_LIQUIDITY_VAULT_OWNER", deployer);
        _defaultAddress("BID_RESOLUTION_ORACLE", deployer);
        require(vm.getNonce(deployer) == 0, "LP deployer must be a fresh wallet");
        require(vm.envUint("BID_GENESIS_MARKET_COUNT") == 1, "beta creates exactly one market");
        require(vm.envUint("BID_INITIAL_LIQUIDITY") == 25e6, "beta seed must be 25 USDG");
        require(vm.envUint("BID_MAX_TRADE_AMOUNT") == 5e6, "beta order cap must be 5 USDG");
        uint256 closeTime = vm.envUint("BID_MARKET_CLOSE_TIME");
        require(closeTime > block.timestamp && closeTime <= type(uint64).max, "invalid close time");
    }

    function _deployReserves(address deployer, uint256 deployerKey) private {
        _startBroadcast(deployer, deployerKey);
        BidReserveVault buybackReserve = new BidReserveVault(deployer);
        BidReserveVault protocolReserve = new BidReserveVault(deployer);
        BidReserveVault creatorRewardsReserve = new BidReserveVault(deployer);
        vm.stopBroadcast();
        deployedBuybackReserve = address(buybackReserve);
        deployedProtocolReserve = address(protocolReserve);
        deployedCreatorRewardsReserve = address(creatorRewardsReserve);
        vm.setEnv("BID_BUYBACK_VAULT", vm.toString(address(buybackReserve)));
        vm.setEnv("BID_PROTOCOL_TREASURY", vm.toString(address(protocolReserve)));
        vm.setEnv("BID_CREATOR_REWARDS_VAULT", vm.toString(address(creatorRewardsReserve)));
    }

    function _createMarket(
        BidMarketFactory factory,
        BidLiquidityVault vault,
        IERC20Metadata collateral,
        address deployer,
        uint256 deployerKey
    ) private returns (address market) {
        address vaultOwner = vm.envAddress("BID_LIQUIDITY_VAULT_OWNER");
        uint256 closeTime = vm.envUint("BID_MARKET_CLOSE_TIME");
        require(vaultOwner != address(0), "zero vault owner");
        string[] memory outcomes = new string[](5);
        outcomes[0] = "Miami";
        outcomes[1] = "Tampa";
        outcomes[2] = "New York";
        outcomes[3] = "Dallas";
        outcomes[4] = "Phoenix";
        _startBroadcast(deployer, deployerKey);
        collateral.approve(address(factory), 25e6);
        market = factory.createProtocolGenesisMarket(
            "Which city posts the highest home-price growth from September 2026 to March 2027? Rules SHA-256: 9e4e62ce9a6fd5330a5716ae0c101df4437a3ad00582de88cd72ffb914a3c406",
            outcomes, uint64(closeTime), 25e6, address(vault)
        );
        vault.setMarketApproval(market, true);
        vault.transferOwnership(vaultOwner);
        vm.stopBroadcast();
    }

    function _defaultAddress(string memory key, address fallbackAddress) private {
        if (vm.envOr(key, address(0)) == address(0)) vm.setEnv(key, vm.toString(fallbackAddress));
    }

    function _startBroadcast(address deployer, uint256 deployerKey) private {
        if (deployerKey == 0) vm.startBroadcast(deployer);
        else vm.startBroadcast(deployerKey);
    }
}
