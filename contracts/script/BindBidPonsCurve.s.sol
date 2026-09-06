// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BidFeePolicy} from "../src/BidFeePolicy.sol";
import {BidFlywheelTreasury} from "../src/BidFlywheelTreasury.sol";
import {BidMarketFactory} from "../src/BidMarketFactory.sol";

interface IPonsV2LaunchRegistry {
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
}

contract BindBidPonsCurve is Script {
    function run() external {
        uint256 expectedChainId = vm.envUint("BID_EXPECTED_CHAIN_ID");
        address deployer = vm.envAddress("BID_DEPLOYER");
        address finalTreasuryOwner = vm.envAddress("BID_TREASURY_OWNER");
        address finalFactoryOwner = vm.envAddress("BID_FACTORY_OWNER");
        address token = vm.envAddress("BID_TOKEN_ADDRESS");
        address curve = vm.envAddress("PONS_CURVE_ADDRESS");
        address pairToken = vm.envAddress("PONS_QUOTE_ASSET");
        BidFlywheelTreasury treasury = BidFlywheelTreasury(payable(vm.envAddress("BID_FLYWHEEL_TREASURY")));
        BidMarketFactory marketFactory = BidMarketFactory(vm.envAddress("BID_MARKET_FACTORY"));
        IPonsV2LaunchRegistry factory = IPonsV2LaunchRegistry(vm.envAddress("PONS_FACTORY"));

        require(block.chainid == expectedChainId && expectedChainId == 4663, "unexpected chain");
        require(
            deployer != address(0) && finalTreasuryOwner != address(0) && finalFactoryOwner != address(0), "zero owner"
        );
        require(treasury.owner() == deployer, "deployer is not temporary treasury owner");
        require(marketFactory.owner() == deployer, "deployer is not temporary factory owner");
        require(address(marketFactory.bidToken()) == address(0), "BID token already bound");
        require(address(treasury.ponsFactory()) == address(factory), "treasury Pons factory mismatch");
        require(token.code.length > 0 && curve.code.length > 0, "token or curve has no code");

        IPonsV2LaunchRegistry.LaunchedToken memory launch = factory.getLaunchedToken(token);
        require(launch.exists && launch.token == token, "unverified Pons launch");
        require(launch.curve == curve, "Pons curve mismatch");
        require(launch.creatorFeeRecipient == address(treasury), "Pons recipient mismatch");
        require(launch.pairToken == pairToken, "Pons pair mismatch");
        require(launch.creatorTaxBps == BidFeePolicy.CREATOR_FEE_BPS, "Pons creator tax is not 1.5%");
        require(!launch.buybackEnabled, "Pons buyback must be disabled");

        vm.startBroadcast(deployer);
        treasury.setPonsCurve(curve);
        marketFactory.bindBidToken(IERC20(token));
        treasury.transferOwnership(finalTreasuryOwner);
        marketFactory.transferOwnership(finalFactoryOwner);
        vm.stopBroadcast();

        require(address(treasury.ponsCurve()) == curve, "curve binding failed");
        require(address(marketFactory.bidToken()) == token, "BID token binding failed");
        require(treasury.owner() == finalTreasuryOwner, "treasury ownership handoff failed");
        require(marketFactory.owner() == finalFactoryOwner, "factory ownership handoff failed");
        console2.log("Bound BID token=%s", token);
        console2.log("Bound Pons curve=%s", curve);
        console2.log("Transferred treasury ownership=%s", finalTreasuryOwner);
        console2.log("Transferred factory ownership=%s", finalFactoryOwner);
    }
}
