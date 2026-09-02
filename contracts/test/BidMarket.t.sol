// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {BidMarket} from "../src/BidMarket.sol";
import {BidMarketFactory} from "../src/BidMarketFactory.sol";
import {BidFlywheelTreasury} from "../src/BidFlywheelTreasury.sol";

contract MockToken is ERC20 {
    uint8 private immutable _tokenDecimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract BidMarketTest is Test {
    MockToken internal usdg;
    MockToken internal bid;
    BidMarketFactory internal factory;
    BidMarket internal market;

    address internal trader = makeAddr("trader");
    address internal keeper = makeAddr("keeper");
    uint64 internal closesAt;

    function setUp() public {
        usdg = new MockToken("USDG", "USDG", 6);
        bid = new MockToken("BID", "BID", 18);
        factory = new BidMarketFactory(usdg, bid, address(this), address(this));
        closesAt = uint64(block.timestamp + 30 days);

        usdg.mint(address(this), 1_000_000e6);
        usdg.approve(address(factory), type(uint256).max);

        string[] memory outcomes = new string[](2);
        outcomes[0] = "Miami";
        outcomes[1] = "Tampa";
        market = BidMarket(
            factory.createGenesisMarket("Which city posts the larger home-price gain?", outcomes, closesAt, 100_000e6)
        );

        usdg.mint(trader, 100_000e6);
        vm.prank(trader);
        usdg.approve(address(market), type(uint256).max);
    }

    function testInitialLiquidityProducesEvenPricesAndLpShares() public view {
        uint256[] memory prices = market.spotPricesBps();
        assertEq(prices[0], 5_000);
        assertEq(prices[1], 5_000);
        assertEq(market.balanceOf(address(this)), 100_000e6);
        assertEq(market.decimals(), usdg.decimals());
    }

    function testMarketBuyMovesPriceAndChargesZeroLaunchFee() public {
        (uint256 quoted, uint256 fee) = market.quoteBuy(10_000e6, 0);
        assertEq(fee, 0);
        assertGt(quoted, 10_000e6);

        vm.prank(trader);
        uint256 received = market.buy(10_000e6, 0, quoted);
        assertEq(received, quoted);
        assertEq(market.outcomeBalanceOf(trader, 0), quoted);

        uint256[] memory prices = market.spotPricesBps();
        assertGt(prices[0], 5_000);
        assertEq(prices[0] + prices[1], 10_000);
    }

    function testBuyAndSellRoundTripUsesPoolLiquidity() public {
        vm.startPrank(trader);
        uint256 bought = market.buy(10_000e6, 0, 0);
        (uint256 tokensRequired,) = market.quoteSell(4_000e6, 0);
        assertLt(tokensRequired, bought);
        market.sell(4_000e6, 0, tokensRequired);
        vm.stopPrank();

        assertEq(usdg.balanceOf(trader), 94_000e6);
        assertEq(market.outcomeBalanceOf(trader, 0), bought - tokensRequired);
    }

    function testLiquidityCanBeAddedAndRemoved() public {
        usdg.approve(address(market), type(uint256).max);
        uint256 shares = market.addFunding(25_000e6, 25_000e6);
        assertEq(shares, 25_000e6);

        uint256[] memory amounts = market.removeFunding(shares);
        assertEq(amounts[0], 25_000e6);
        assertEq(amounts[1], 25_000e6);
    }

    function testBalancedLiquidityCanBeWithdrawnDirectlyToCollateral() public {
        usdg.approve(address(market), type(uint256).max);
        uint256 shares = market.addFunding(25_000e6, 25_000e6);
        uint256 balanceBefore = usdg.balanceOf(address(this));

        (uint256 quotedCollateral, uint256[] memory quotedResiduals) = market.quoteRemoveFundingToCollateral(shares);
        assertEq(quotedCollateral, 25_000e6);
        assertEq(quotedResiduals[0], 0);
        assertEq(quotedResiduals[1], 0);

        (uint256 collateralOut, uint256[] memory residuals) = market.removeFundingToCollateral(shares, quotedCollateral);
        assertEq(collateralOut, 25_000e6);
        assertEq(residuals[0], 0);
        assertEq(residuals[1], 0);
        assertEq(usdg.balanceOf(address(this)), balanceBefore + collateralOut);
    }

    function testImbalancedLiquidityWithdrawalReturnsCollateralAndResidualPosition() public {
        vm.prank(trader);
        market.buy(20_000e6, 0, 0);

        uint256 shares = market.balanceOf(address(this)) / 10;
        (uint256 collateralOut, uint256[] memory residuals) = market.removeFundingToCollateral(shares, 0);

        assertGt(collateralOut, 0);
        assertEq(residuals[0], 0);
        assertGt(residuals[1], 0);
        assertEq(market.outcomeBalanceOf(address(this), 1), residuals[1]);
    }

    function testFuzzBuyPreservesPriceNormalizationAndMovesSelectedPrice(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1e6, 50_000e6);
        vm.prank(trader);
        uint256 received = market.buy(amount, 0, 0);

        uint256[] memory prices = market.spotPricesBps();
        uint256[] memory balances = market.poolBalances();
        assertGt(received, 0);
        assertLt(balances[0], balances[1]);
        assertGe(prices[0], 5_000);
        assertEq(prices[0] + prices[1], 10_000);
    }

    function testMarketableLimitBuyFillsImmediately() public {
        (uint256 quoted,) = market.quoteBuy(5_000e6, 1);
        vm.prank(trader);
        uint256 orderId = market.placeBuyLimit(5_000e6, 1, quoted);

        assertEq(market.outcomeBalanceOf(trader, 1), quoted);
        (,,,,, bool active) = market.limitOrders(orderId);
        assertFalse(active);
    }

    function testRestingLimitBuyFillsAfterPoolMovesThroughPrice() public {
        (uint256 quoted,) = market.quoteBuy(5_000e6, 1);
        uint256 limitTokens = quoted * 105 / 100;

        vm.startPrank(trader);
        uint256 orderId = market.placeBuyLimit(5_000e6, 1, limitTokens);
        market.buy(20_000e6, 0, 0);
        vm.stopPrank();

        (,,,,, bool activeBeforeFill) = market.limitOrders(orderId);
        assertTrue(activeBeforeFill);
        (uint256 movedQuote,) = market.quoteBuy(5_000e6, 1);
        assertGe(movedQuote, limitTokens);

        vm.prank(keeper);
        market.fillLimitOrder(orderId);

        assertGe(market.outcomeBalanceOf(trader, 1), limitTokens);
        (,,,,, bool activeAfterFill) = market.limitOrders(orderId);
        assertFalse(activeAfterFill);
    }

    function testCancellingRestingLimitBuyRefundsEscrow() public {
        uint256 balanceBefore = usdg.balanceOf(trader);
        vm.startPrank(trader);
        uint256 orderId = market.placeBuyLimit(5_000e6, 1, 50_000e6);
        assertEq(usdg.balanceOf(trader), balanceBefore - 5_000e6);
        market.cancelLimitOrder(orderId);
        vm.stopPrank();

        assertEq(usdg.balanceOf(trader), balanceBefore);
        (,,,,, bool active) = market.limitOrders(orderId);
        assertFalse(active);
    }

    function testMarketableLimitSellFillsImmediately() public {
        vm.startPrank(trader);
        market.buy(10_000e6, 0, 0);
        (uint256 tokensRequired,) = market.quoteSell(3_000e6, 0);
        uint256 balanceBefore = usdg.balanceOf(trader);
        uint256 orderId = market.placeSellLimit(3_000e6, 0, tokensRequired);
        vm.stopPrank();

        assertEq(usdg.balanceOf(trader), balanceBefore + 3_000e6);
        (,,,,, bool active) = market.limitOrders(orderId);
        assertFalse(active);
    }

    function testWinningOutcomeRedeemsForCollateral() public {
        vm.prank(trader);
        uint256 bought = market.buy(10_000e6, 0, 0);

        vm.warp(closesAt);
        uint256[] memory payouts = new uint256[](2);
        payouts[0] = 1e18;
        market.resolve(payouts);

        uint256 beforeBalance = usdg.balanceOf(trader);
        vm.prank(trader);
        uint256 redeemed = market.redeem();
        assertEq(redeemed, bought);
        assertEq(usdg.balanceOf(trader), beforeBalance + bought);
    }

    function testCommunityCreationStartsDisabledThenUsesGateBurnAndRoyalty() public {
        string[] memory outcomes = new string[](2);
        outcomes[0] = "Yes";
        outcomes[1] = "No";

        vm.expectRevert(BidMarketFactory.CommunityCreationDisabled.selector);
        vm.prank(trader);
        factory.createCommunityMarket("Will Austin finish positive?", outcomes, closesAt, 10_000e6);

        factory.setCommunityCreationConfig(true, 10_000e18, 100e18, 250);
        bid.mint(trader, 10_000e18);
        vm.startPrank(trader);
        bid.approve(address(factory), 100e18);
        usdg.approve(address(factory), 10_000e6);
        address created = factory.createCommunityMarket("Will Austin finish positive?", outcomes, closesAt, 10_000e6);
        vm.stopPrank();

        assertEq(bid.balanceOf(factory.BURN_ADDRESS()), 100e18);
        assertEq(BidMarket(created).creatorFeeBps(), 250);
        assertEq(BidMarket(created).marketCreator(), trader);

        usdg.mint(keeper, 1_000e6);
        vm.startPrank(keeper);
        usdg.approve(created, 1_000e6);
        BidMarket(created).buy(1_000e6, 0, 0);
        vm.stopPrank();

        uint256 creatorBalanceBefore = usdg.balanceOf(trader);
        vm.prank(trader);
        uint256 claimed = BidMarket(created).claimCreatorFees();
        assertEq(claimed, 25e6);
        assertEq(usdg.balanceOf(trader), creatorBalanceBefore + claimed);
    }
}

contract BidFlywheelTreasuryTest is Test {
    MockToken internal token;
    BidFlywheelTreasury internal treasury;
    address internal rewardsVault = makeAddr("rewardsVault");
    address internal liquidityVault = makeAddr("liquidityVault");

    function setUp() public {
        token = new MockToken("Fee Token", "FEE", 18);
        treasury = new BidFlywheelTreasury(rewardsVault, liquidityVault, address(this));
    }

    function testSplitsErc20ProceedsFiftyFifty() public {
        token.mint(address(treasury), 101e18);
        treasury.distributeToken(token);

        assertEq(token.balanceOf(rewardsVault), 50.5e18);
        assertEq(token.balanceOf(liquidityVault), 50.5e18);
    }

    function testSplitsNativeProceedsFiftyFifty() public {
        vm.deal(address(treasury), 3 ether);
        treasury.distributeNative();

        assertEq(rewardsVault.balance, 1.5 ether);
        assertEq(liquidityVault.balance, 1.5 ether);
    }
}
