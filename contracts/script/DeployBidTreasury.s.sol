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
    function run()
        external
        returns (
            BidFlywheelTreasury treasury,
            BidLiquidityVault liquidityVault,
            BidRewardsDistributor rewardsDistributor
        )
    {
        uint256 expectedChainId = vm.envUint("BID_EXPECTED_CHAIN_ID");
        address deployer = vm.envAddress("BID_DEPLOYER");
        address treasuryOwner = vm.envAddress("BID_TREASURY_OWNER");
        address rewardsOwner = vm.envAddress("BID_REWARDS_OWNER");
        address liquidityOperator = vm.envAddress("BID_LIQUIDITY_OPERATOR");
        address reserveVault = vm.envAddress("BID_RESERVE_VAULT");
        IERC20 collateral = IERC20(vm.envAddress("BID_COLLATERAL_TOKEN"));
        IPonsInfrastructure ponsFactory = IPonsInfrastructure(vm.envAddress("PONS_FACTORY"));
        address feeEscrow = vm.envAddress("PONS_FEE_ESCROW");
        address feeHook = vm.envAddress("PONS_FEE_HOOK");

        require(block.chainid == expectedChainId, "unexpected chain");
        require(deployer != address(0) && treasuryOwner != address(0) && rewardsOwner != address(0), "zero owner");
        require(liquidityOperator != address(0), "zero operator");
        require(reserveVault != address(0), "zero vault");
        require(address(collateral).code.length > 0, "collateral has no code");
        require(address(ponsFactory).code.length > 0, "Pons factory has no code");
        require(feeEscrow.code.length > 0, "Pons escrow has no code");
        require(feeHook.code.length > 0, "Pons hook has no code");
        require(ponsFactory.feeEscrow() == feeEscrow, "Pons escrow mismatch");
        require(ponsFactory.memeHook() == feeHook, "Pons hook mismatch");
        require(ponsFactory.approvedPairTokens(address(collateral)), "collateral is not an approved Pons pair");

        vm.startBroadcast(deployer);
        rewardsDistributor = new BidRewardsDistributor(rewardsOwner);
        liquidityVault = new BidLiquidityVault(collateral, liquidityOperator, deployer);
        treasury = new BidFlywheelTreasury(
            address(rewardsDistributor),
            address(liquidityVault),
            reserveVault,
            address(ponsFactory),
            feeEscrow,
            feeHook,
            deployer
        );
        vm.stopBroadcast();

        console2.log("NEXT_PUBLIC_BID_FLYWHEEL_TREASURY=%s", address(treasury));
        console2.log("NEXT_PUBLIC_BID_REWARDS_VAULT=%s", address(rewardsDistributor));
        console2.log("NEXT_PUBLIC_BID_LIQUIDITY_VAULT=%s", address(liquidityVault));
        console2.log("Set the Pons creator fee recipient to treasury=%s", address(treasury));
        console2.log("Final treasury owner after curve binding=%s", treasuryOwner);
    }
}
