// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BidMarketFactory} from "../src/BidMarketFactory.sol";

interface IPonsLaunchFactory {
    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory);
    function feeEscrow() external view returns (address);
    function memeHook() external view returns (address);
    function approvedPairTokens(address pairToken) external view returns (bool);
}

contract DeployBidMarkets is Script {
    function run() external returns (BidMarketFactory factory) {
        uint256 expectedChainId = vm.envUint("BID_EXPECTED_CHAIN_ID");
        address deployer = vm.envAddress("BID_DEPLOYER");
        address collateral = vm.envAddress("BID_COLLATERAL_TOKEN");
        address bidToken = vm.envAddress("BID_TOKEN_ADDRESS");
        address oracle = vm.envAddress("BID_RESOLUTION_ORACLE");
        address treasury = vm.envAddress("BID_FLYWHEEL_TREASURY");
        address expectedCurve = vm.envAddress("PONS_CURVE_ADDRESS");
        address expectedEscrow = vm.envAddress("PONS_FEE_ESCROW");
        address expectedHook = vm.envAddress("PONS_FEE_HOOK");
        IPonsLaunchFactory ponsFactory = IPonsLaunchFactory(vm.envAddress("PONS_FACTORY"));

        require(block.chainid == expectedChainId, "unexpected chain");
        require(deployer != address(0) && oracle != address(0), "zero address");
        require(collateral.code.length > 0, "collateral has no code");
        require(bidToken.code.length > 0, "BID token has no code");
        require(treasury.code.length > 0, "treasury has no code");
        require(address(ponsFactory).code.length > 0, "Pons factory has no code");
        require(expectedCurve.code.length > 0, "Pons curve has no code");
        require(ponsFactory.feeEscrow() == expectedEscrow, "Pons escrow mismatch");
        require(ponsFactory.memeHook() == expectedHook, "Pons hook mismatch");
        require(ponsFactory.approvedPairTokens(collateral), "collateral is not an approved Pons pair");

        IPonsLaunchFactory.LaunchedToken memory launch = ponsFactory.getLaunchedToken(bidToken);
        require(launch.exists && launch.token == bidToken, "unverified Pons launch");
        require(launch.curve == expectedCurve, "Pons curve mismatch");
        require(launch.creatorFeeRecipient == treasury, "Pons fee recipient mismatch");
        require(launch.pairToken == collateral, "Pons quote asset mismatch");
        require(launch.creatorTaxBps == 250, "Pons creator tax must be 2.5%");
        require(!launch.buybackEnabled, "Pons buyback must be disabled");

        vm.startBroadcast(deployer);
        factory = new BidMarketFactory(IERC20(collateral), IERC20(bidToken), oracle, deployer);
        vm.stopBroadcast();

        console2.log("NEXT_PUBLIC_BID_MARKET_FACTORY=%s", address(factory));
    }
}
