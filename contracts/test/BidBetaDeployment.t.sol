// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployBidBeta} from "../script/DeployBidBeta.s.sol";
import {BidMarket} from "../src/BidMarket.sol";
import {BidLiquidityVault} from "../src/BidLiquidityVault.sol";
import {BidReserveVault} from "../src/BidReserveVault.sol";
import {MockToken, MockPonsFeeEscrow, MockPonsFeeHook} from "./BidMarket.t.sol";

contract BetaPonsFactoryMock {
    address public immutable feeEscrow;
    address public immutable memeHook;
    constructor(address escrow, address hook) { feeEscrow = escrow; memeHook = hook; }
    function approvedPairTokens(address) external pure returns (bool) { return true; }
}

contract BidBetaDeploymentTest is Test {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address deployer = makeAddr("beta-deployer");
    address owner = makeAddr("beta-owner");
    address operator = makeAddr("beta-operator");
    address trader = makeAddr("beta-trader");
    uint256 constant CLOSE = 1804291199;

    function setUp() public {
        vm.chainId(4663);
        vm.warp(1788652800);
        MockToken token = new MockToken("USDG", "USDG", 6);
        vm.etch(USDG, address(token).code);
        MockToken(USDG).mint(deployer, 25e6);
        MockPonsFeeEscrow escrow = new MockPonsFeeEscrow();
        MockPonsFeeHook hook = new MockPonsFeeHook();
        BetaPonsFactoryMock pons = new BetaPonsFactoryMock(address(escrow), address(hook));
        vm.setEnv("BID_EXPECTED_CHAIN_ID", "4663");
        vm.setEnv("BID_GENESIS_MARKET_COUNT", "1");
        vm.setEnv("BID_INITIAL_LIQUIDITY", "25000000");
        vm.setEnv("BID_MAX_TRADE_AMOUNT", "5000000");
        vm.setEnv("BID_MARKET_CLOSE_TIME", vm.toString(CLOSE));
        vm.setEnv("BID_DEPLOYER", vm.toString(deployer));
        vm.setEnv("BID_TREASURY_OWNER", vm.toString(owner));
        vm.setEnv("BID_REWARDS_OWNER", vm.toString(owner));
        vm.setEnv("BID_LIQUIDITY_VAULT_OWNER", vm.toString(owner));
        vm.setEnv("BID_LIQUIDITY_OPERATOR", vm.toString(operator));
        vm.setEnv("BID_RESOLUTION_ORACLE", vm.toString(owner));
        vm.setEnv("BID_BUYBACK_VAULT", vm.toString(makeAddr("buyback")));
        vm.setEnv("BID_PROTOCOL_TREASURY", vm.toString(makeAddr("treasury")));
        vm.setEnv("BID_CREATOR_REWARDS_VAULT", vm.toString(makeAddr("creator")));
        vm.setEnv("BID_COLLATERAL_TOKEN", vm.toString(USDG));
        vm.setEnv("PONS_FACTORY", vm.toString(address(pons)));
        vm.setEnv("PONS_FEE_ESCROW", vm.toString(address(escrow)));
        vm.setEnv("PONS_FEE_HOOK", vm.toString(address(hook)));
    }

    function testExactBetaDeploymentTradeCloseResolveRedeem() public {
        DeployBidBeta script = new DeployBidBeta();
        script.run();
        address marketAddress = script.deployedMarket();
        address vaultAddress = script.deployedLiquidityVault();
        BidMarket market = BidMarket(marketAddress);
        assertEq(market.balanceOf(vaultAddress), 25e6);
        assertEq(MockToken(USDG).balanceOf(deployer), 0);
        assertEq(market.closesAt(), CLOSE);
        assertEq(market.spotPricesBps().length, 5);
        for (uint256 i; i < 5; ++i) assertEq(market.spotPricesBps()[i], 2000);
        assertEq(BidLiquidityVault(payable(vaultAddress)).owner(), owner);
        assertEq(BidLiquidityVault(payable(vaultAddress)).operator(), operator);
        MockToken(USDG).mint(trader, 7e6);
        vm.startPrank(trader);
        MockToken(USDG).approve(marketAddress, 7e6);
        vm.expectRevert(BidMarket.TradeAmountExceeded.selector);
        market.buy(5e6 + 1, 0, 0);
        uint256 purchased = market.buy(1e6, 0, 0);
        assertGt(purchased, 1e6);
        uint256 requiredTokens;
        (requiredTokens,) = market.quoteSell(100_000, 0);
        market.sell(100_000, 0, requiredTokens);
        vm.stopPrank();
        vm.warp(CLOSE);
        vm.expectRevert(BidMarket.MarketNotOpen.selector);
        vm.prank(trader);
        market.buy(1e6, 0, 0);
        uint256[] memory payouts = new uint256[](5);
        payouts[0] = 1e18;
        vm.prank(owner);
        market.resolve(payouts);
        vm.prank(trader);
        assertEq(market.redeem(), purchased - requiredTokens);
        vm.expectRevert(BidMarket.ZeroAmount.selector);
        vm.prank(trader);
        market.redeem();
    }

    function testBetaRefusesWrongChain() public {
        vm.chainId(1);
        DeployBidBeta script = new DeployBidBeta();
        vm.expectRevert("mainnet required");
        script.run();
    }

    function testReserveVaultOnlyLetsOwnerWithdraw() public {
        BidReserveVault vault = new BidReserveVault(owner);
        MockToken(USDG).mint(address(vault), 10e6);
        vm.expectRevert();
        vault.withdrawToken(MockToken(USDG), trader, 1e6);
        vm.prank(owner);
        vault.withdrawToken(MockToken(USDG), trader, 1e6);
        assertEq(MockToken(USDG).balanceOf(trader), 1e6);
        assertEq(MockToken(USDG).balanceOf(address(vault)), 9e6);
    }
}
