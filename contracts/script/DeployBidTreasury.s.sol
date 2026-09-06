// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BidFlywheelTreasury} from "../src/BidFlywheelTreasury.sol";
import {BidLiquidityVault} from "../src/BidLiquidityVault.sol";
import {BidRewardsDistributor} from "../src/BidRewardsDistributor.sol";

interface IPonsInfrastructure {
    function feeEscrow() external view returns (address);
    function memeHook() external view returns (address);
    function approvedPairTokens(address pairToken) external view returns (bool);
}

contract DeployBidTreasury is Script {
    struct DeploymentConfig {
        address deployer;
        address treasuryOwner;
        address rewardsOwner;
        address liquidityOperator;
        address buybackVault;
        address protocolTreasury;
        address creatorRewardsVault;
        IERC20 collateral;
        IPonsInfrastructure ponsFactory;
        address feeEscrow;
        address feeHook;
    }

    function run()
        external
        returns (
            BidFlywheelTreasury treasury,
            BidLiquidityVault liquidityVault,
            BidRewardsDistributor rewardsDistributor
        )
    {
        uint256 expectedChainId = vm.envUint("BID_EXPECTED_CHAIN_ID");
        DeploymentConfig memory config = DeploymentConfig({
            deployer: vm.envAddress("BID_DEPLOYER"),
            treasuryOwner: vm.envAddress("BID_TREASURY_OWNER"),
            rewardsOwner: vm.envAddress("BID_REWARDS_OWNER"),
            liquidityOperator: vm.envAddress("BID_LIQUIDITY_OPERATOR"),
            buybackVault: vm.envAddress("BID_BUYBACK_VAULT"),
            protocolTreasury: vm.envAddress("BID_PROTOCOL_TREASURY"),
            creatorRewardsVault: vm.envAddress("BID_CREATOR_REWARDS_VAULT"),
            collateral: IERC20(vm.envAddress("BID_COLLATERAL_TOKEN")),
            ponsFactory: IPonsInfrastructure(vm.envAddress("PONS_FACTORY")),
            feeEscrow: vm.envAddress("PONS_FEE_ESCROW"),
            feeHook: vm.envAddress("PONS_FEE_HOOK")
        });

        require(block.chainid == expectedChainId, "unexpected chain");
        require(
            config.deployer != address(0) && config.treasuryOwner != address(0) && config.rewardsOwner != address(0),
            "zero owner"
        );
        require(config.liquidityOperator != address(0), "zero operator");
        require(
            config.buybackVault != address(0) && config.protocolTreasury != address(0)
                && config.creatorRewardsVault != address(0),
            "zero destination"
        );
        require(address(config.collateral).code.length > 0, "collateral has no code");
        require(address(config.ponsFactory).code.length > 0, "Pons factory has no code");
        require(config.feeEscrow.code.length > 0, "Pons escrow has no code");
        require(config.feeHook.code.length > 0, "Pons hook has no code");
        require(config.ponsFactory.feeEscrow() == config.feeEscrow, "Pons escrow mismatch");
        require(config.ponsFactory.memeHook() == config.feeHook, "Pons hook mismatch");
        require(
            config.ponsFactory.approvedPairTokens(address(config.collateral)), "collateral is not an approved Pons pair"
        );

        vm.startBroadcast(config.deployer);
        rewardsDistributor = new BidRewardsDistributor(config.rewardsOwner);
        liquidityVault = new BidLiquidityVault(config.collateral, config.liquidityOperator, config.deployer);
        treasury = new BidFlywheelTreasury(
            address(rewardsDistributor),
            address(liquidityVault),
            config.buybackVault,
            config.protocolTreasury,
            config.creatorRewardsVault,
            address(config.ponsFactory),
            config.feeEscrow,
            config.feeHook,
            config.deployer
        );
        vm.stopBroadcast();

        console2.log("NEXT_PUBLIC_BID_FLYWHEEL_TREASURY=%s", address(treasury));
        console2.log("NEXT_PUBLIC_BID_REWARDS_VAULT=%s", address(rewardsDistributor));
        console2.log("NEXT_PUBLIC_BID_LIQUIDITY_VAULT=%s", address(liquidityVault));
        console2.log("NEXT_PUBLIC_BID_BUYBACK_VAULT=%s", config.buybackVault);
        console2.log("NEXT_PUBLIC_BID_PROTOCOL_TREASURY=%s", config.protocolTreasury);
        console2.log("NEXT_PUBLIC_BID_CREATOR_REWARDS_VAULT=%s", config.creatorRewardsVault);
        console2.log("Set the Pons creator fee recipient to treasury=%s", address(treasury));
        console2.log("Final treasury owner after curve binding=%s", config.treasuryOwner);
    }
}
