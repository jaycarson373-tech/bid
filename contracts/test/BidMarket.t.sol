// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {BidMarket} from "../src/BidMarket.sol";
import {BidMarketFactory} from "../src/BidMarketFactory.sol";
import {BidFlywheelTreasury} from "../src/BidFlywheelTreasury.sol";
import {BidFeePolicy} from "../src/BidFeePolicy.sol";
import {BidLiquidityVault} from "../src/BidLiquidityVault.sol";

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

contract MockPonsFeeEscrow {
    mapping(address => uint256) public nativeBalance;
    mapping(address => mapping(address => uint256)) public tokenBalance;

    function creditNative(address recipient) external payable {
        nativeBalance[recipient] += msg.value;
    }

    function creditToken(address recipient, MockToken token, uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        tokenBalance[recipient][address(token)] += amount;
    }

    function claim() external returns (uint256 amount) {
        amount = nativeBalance[msg.sender];
        nativeBalance[msg.sender] = 0;
        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent);
    }

    function claimToken(address token) external returns (uint256 amount) {
        amount = tokenBalance[msg.sender][token];
        tokenBalance[msg.sender][token] = 0;
        MockToken(token).transfer(msg.sender, amount);
    }
}

contract MockPonsBadEscrow {
    function claim() external pure returns (uint256 amount) {
        return 1;
    }

    function claimToken(address) external pure returns (uint256 amount) {
        return 1;
    }
}

contract MockPonsFeeHook {
    address public lastCaller;
    bytes32 public lastPoolId;

    function sweepPoolFees(bytes32 poolId, uint256, uint256) external {
        lastCaller = msg.sender;
        lastPoolId = poolId;
    }
}

contract MockPonsCurve {
    address public lastCaller;
    uint256 public lastMinimumOut;

    function sweepFees(uint256 minBuybackTokensOut) external {
        lastCaller = msg.sender;
        lastMinimumOut = minBuybackTokensOut;
    }
}

contract MockPonsCreatorControls {
    address public lastCaller;
    address public lastToken;
    address public lastRecipient;

    function transferCreatorFeeRecipient(address token, address newRecipient) external {
        lastCaller = msg.sender;
        lastToken = token;
        lastRecipient = newRecipient;
    }
}

contract RejectNative {
    receive() external payable {
        revert("reject native");
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
        factory = new BidMarketFactory(usdg, address(this), address(this), 50_000e6);
        factory.bindBidToken(bid);
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

    function testProtocolGenesisLiquiditySharesCanBeMintedToVault() public {
        address protocolVault = makeAddr("protocolVault");
        string[] memory outcomes = new string[](2);
        outcomes[0] = "Yes";
        outcomes[1] = "No";

        BidMarket protocolMarket = BidMarket(
            factory.createProtocolGenesisMarket(
                "Will protocol LP be vault-owned?", outcomes, closesAt, 25_000e6, protocolVault
            )
        );

        assertEq(protocolMarket.balanceOf(protocolVault), 25_000e6);
        assertEq(protocolMarket.balanceOf(address(this)), 0);
        assertEq(protocolMarket.marketCreator(), address(this));
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

    function testBetaTradeCapRejectsOversizedOrders() public {
        vm.expectRevert(BidMarket.TradeAmountExceeded.selector);
        vm.prank(trader);
        market.buy(50_000e6 + 1, 0, 0);

        vm.expectRevert(BidMarket.TradeAmountExceeded.selector);
        vm.prank(trader);
        market.placeBuyLimit(50_000e6 + 1, 0, 1);
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

    function testGenesisMarketCanLaunchBeforeBidTokenIsBound() public {
        BidMarketFactory prelaunchFactory = new BidMarketFactory(usdg, address(this), address(this), 50_000e6);
        usdg.approve(address(prelaunchFactory), 1_000e6);
        string[] memory outcomes = new string[](2);
        outcomes[0] = "Yes";
        outcomes[1] = "No";

        address created = prelaunchFactory.createGenesisMarket(
            "Can this market launch before the BID token?", outcomes, closesAt, 1_000e6
        );

        assertTrue(prelaunchFactory.isBidMarket(created));
        assertEq(address(prelaunchFactory.bidToken()), address(0));
    }

    function testBidTokenBindingIsOwnerOnlyAndOneTime() public {
        BidMarketFactory prelaunchFactory = new BidMarketFactory(usdg, address(this), address(this), 50_000e6);

        vm.expectRevert();
        vm.prank(trader);
        prelaunchFactory.bindBidToken(bid);

        prelaunchFactory.bindBidToken(bid);
        assertEq(address(prelaunchFactory.bidToken()), address(bid));

        vm.expectRevert(BidMarketFactory.BidTokenAlreadyBound.selector);
        prelaunchFactory.bindBidToken(bid);
    }

    function testCommunityCreationCannotEnableBeforeBidTokenBinding() public {
        BidMarketFactory prelaunchFactory = new BidMarketFactory(usdg, address(this), address(this), 50_000e6);
        vm.expectRevert(BidMarketFactory.BidTokenNotBound.selector);
        prelaunchFactory.setCommunityCreationConfig(true, 1, 1, 100);
    }
}

contract BidFlywheelTreasuryTest is Test {
    MockToken internal token;
    MockPonsFeeEscrow internal feeEscrow;
    MockPonsFeeHook internal feeHook;
    MockPonsCurve internal curve;
    MockPonsCreatorControls internal ponsFactory;
    BidFlywheelTreasury internal treasury;
    address internal rewardsVault = makeAddr("rewardsVault");
    address internal liquidityVault = makeAddr("liquidityVault");
    address internal buybackVault = makeAddr("buybackVault");
    address internal reserveVault = makeAddr("reserveVault");
    address internal creatorRewardsVault = makeAddr("creatorRewardsVault");

    function setUp() public {
        token = new MockToken("Fee Token", "FEE", 18);
        feeEscrow = new MockPonsFeeEscrow();
        feeHook = new MockPonsFeeHook();
        curve = new MockPonsCurve();
        ponsFactory = new MockPonsCreatorControls();
        treasury = new BidFlywheelTreasury(
            rewardsVault,
            liquidityVault,
            buybackVault,
            reserveVault,
            creatorRewardsVault,
            address(ponsFactory),
            address(feeEscrow),
            address(feeHook),
            address(this)
        );
        treasury.setPonsCurve(address(curve));
    }

    function testSplitsOneHundredUnitsFortyFiveThirtyTenTenFive() public {
        token.mint(address(treasury), 100e18);
        treasury.distributeToken(token);

        assertEq(token.balanceOf(rewardsVault), 45e18);
        assertEq(token.balanceOf(liquidityVault), 30e18);
        assertEq(token.balanceOf(buybackVault), 10e18);
        assertEq(token.balanceOf(reserveVault), 10e18);
        assertEq(token.balanceOf(creatorRewardsVault), 5e18);
    }

    function testOddErc20AmountRemainderGoesToTreasury() public {
        token.mint(address(treasury), 101);
        treasury.distributeToken(token);

        assertEq(token.balanceOf(rewardsVault), 45);
        assertEq(token.balanceOf(liquidityVault), 30);
        assertEq(token.balanceOf(buybackVault), 10);
        assertEq(token.balanceOf(reserveVault), 11);
        assertEq(token.balanceOf(creatorRewardsVault), 5);
    }

    function testOneSmallestUnitRemainderGoesToTreasury() public {
        token.mint(address(treasury), 1);
        treasury.distributeToken(token);

        assertEq(token.balanceOf(rewardsVault), 0);
        assertEq(token.balanceOf(liquidityVault), 0);
        assertEq(token.balanceOf(buybackVault), 0);
        assertEq(token.balanceOf(reserveVault), 1);
        assertEq(token.balanceOf(creatorRewardsVault), 0);
    }

    function testVeryLargeAllocationPreservesEveryUnit() public view {
        uint256 gross = type(uint128).max;
        (uint256 lp, uint256 liquidity, uint256 buyback, uint256 protocol, uint256 creator) =
            treasury.previewAllocation(gross);

        assertEq(lp + liquidity + buyback + protocol + creator, gross);
        assertGe(protocol, gross * BidFeePolicy.TREASURY_BPS / BidFeePolicy.BPS);
    }

    function testAllocationPolicyIsVersionedAndSumsToOneHundredPercent() public view {
        assertEq(treasury.ALLOCATION_VERSION(), keccak256("BID_FEE_POLICY_V1"));
        assertEq(
            treasury.LP_REWARDS_BPS() + treasury.MARKET_LIQUIDITY_BPS() + treasury.BUYBACK_BURN_BPS()
                + treasury.TREASURY_BPS() + treasury.CREATOR_REWARDS_BPS(),
            treasury.BPS()
        );
    }

    function testSplitsNativeProceedsFortyFiveThirtyTenTenFive() public {
        vm.deal(address(treasury), 3 ether);
        treasury.distributeNative();

        assertEq(rewardsVault.balance, 1.35 ether);
        assertEq(liquidityVault.balance, 0.9 ether);
        assertEq(buybackVault.balance, 0.3 ether);
        assertEq(reserveVault.balance, 0.3 ether);
        assertEq(creatorRewardsVault.balance, 0.15 ether);
    }

    function testClaimsPonsTokenThenDistributesExactlyOnce() public {
        token.mint(address(this), 11e18);
        token.approve(address(feeEscrow), 11e18);
        feeEscrow.creditToken(address(treasury), token, 11e18);

        assertEq(treasury.claimPonsToken(address(token)), 11e18);
        assertEq(treasury.claimPonsToken(address(token)), 0);
        treasury.distributeToken(token);

        assertEq(token.balanceOf(rewardsVault), 4.95e18);
        assertEq(token.balanceOf(liquidityVault), 3.3e18);
        assertEq(token.balanceOf(buybackVault), 1.1e18);
        assertEq(token.balanceOf(reserveVault), 1.1e18);
        assertEq(token.balanceOf(creatorRewardsVault), 0.55e18);
        vm.expectRevert(BidFlywheelTreasury.NothingToDistribute.selector);
        treasury.distributeToken(token);
    }

    function testAtomicPonsClaimCannotAllocateTwiceAfterRestart() public {
        token.mint(address(this), 11e18);
        token.approve(address(feeEscrow), 11e18);
        feeEscrow.creditToken(address(treasury), token, 11e18);

        assertEq(treasury.claimAndDistributePonsToken(token), 11e18);
        uint256 rewardsAfterFirstRun = token.balanceOf(rewardsVault);
        vm.expectRevert(BidFlywheelTreasury.NothingToDistribute.selector);
        treasury.claimAndDistributePonsToken(token);

        assertEq(token.balanceOf(rewardsVault), rewardsAfterFirstRun);
        assertEq(token.balanceOf(address(treasury)), 0);
    }

    function testDownstreamFailureRollsBackEntireAllocation() public {
        RejectNative rejectNative = new RejectNative();
        treasury.setDestinations(rewardsVault, liquidityVault, address(rejectNative), reserveVault, creatorRewardsVault);
        vm.deal(address(treasury), 10 ether);

        vm.expectRevert(BidFlywheelTreasury.NativeTransferFailed.selector);
        treasury.distributeNative();

        assertEq(address(treasury).balance, 10 ether);
        assertEq(rewardsVault.balance, 0);
        assertEq(liquidityVault.balance, 0);
        assertEq(reserveVault.balance, 0);
        assertEq(creatorRewardsVault.balance, 0);
    }

    function testClaimReceiptMismatchRevertsBeforeAllocation() public {
        MockPonsBadEscrow badEscrow = new MockPonsBadEscrow();
        treasury.setPonsFeeEscrow(address(badEscrow));

        vm.expectRevert(BidFlywheelTreasury.ClaimAmountMismatch.selector);
        treasury.claimAndDistributePonsToken(token);
    }

    function testClaimsPonsNativeThenDistributesExactlyOnce() public {
        vm.deal(address(this), 2 ether);
        feeEscrow.creditNative{value: 2 ether}(address(treasury));

        assertEq(treasury.claimPonsNative(), 2 ether);
        assertEq(treasury.claimPonsNative(), 0);
        treasury.distributeNative();

        assertEq(rewardsVault.balance, 0.9 ether);
        assertEq(liquidityVault.balance, 0.6 ether);
        assertEq(buybackVault.balance, 0.2 ether);
        assertEq(reserveVault.balance, 0.2 ether);
        assertEq(creatorRewardsVault.balance, 0.1 ether);
    }

    function testPermissionlessPonsPoolSweepCallsHookAsTreasury() public {
        bytes32 poolId = keccak256("bid-pool");
        vm.prank(makeAddr("keeper"));
        treasury.sweepPonsPoolFees(poolId, 0, 0);

        assertEq(feeHook.lastCaller(), address(treasury));
        assertEq(feeHook.lastPoolId(), poolId);
    }

    function testPermissionlessPonsCurveSweepCallsCurveAsTreasury() public {
        vm.prank(makeAddr("keeper"));
        treasury.sweepPonsCurveFees(123);

        assertEq(curve.lastCaller(), address(treasury));
        assertEq(curve.lastMinimumOut(), 123);
    }

    function testOwnerCanMoveFuturePonsFeesToReplacementTreasury() public {
        address tokenAddress = makeAddr("bidToken");
        address replacement = makeAddr("replacementTreasury");
        treasury.transferPonsCreatorFeeRecipient(tokenAddress, replacement);

        assertEq(ponsFactory.lastCaller(), address(treasury));
        assertEq(ponsFactory.lastToken(), tokenAddress);
        assertEq(ponsFactory.lastRecipient(), replacement);
    }
}

contract BidLiquidityVaultTest is Test {
    MockToken internal usdg;
    MockToken internal bid;
    BidMarketFactory internal factory;
    BidMarket internal market;
    BidLiquidityVault internal vault;
    MockPonsFeeEscrow internal feeEscrow;
    BidFlywheelTreasury internal treasury;
    address internal rewardsVault = makeAddr("rewardsVault");
    address internal buybackVault = makeAddr("buybackVault");
    address internal reserveVault = makeAddr("reserveVault");
    address internal creatorRewardsVault = makeAddr("creatorRewardsVault");
    address internal outsider = makeAddr("outsider");

    function setUp() public {
        usdg = new MockToken("USDG", "USDG", 6);
        bid = new MockToken("BID", "BID", 18);
        factory = new BidMarketFactory(usdg, address(this), address(this), 50_000e6);
        factory.bindBidToken(bid);
        usdg.mint(address(this), 100_000e6);
        usdg.approve(address(factory), type(uint256).max);

        string[] memory outcomes = new string[](2);
        outcomes[0] = "Yes";
        outcomes[1] = "No";
        market = BidMarket(
            factory.createGenesisMarket("Will it happen?", outcomes, uint64(block.timestamp + 30 days), 10_000e6)
        );

        vault = new BidLiquidityVault(usdg, address(this), address(this));
        vault.setMarketApproval(address(market), true);
        usdg.mint(address(vault), 5_000e6);
        feeEscrow = new MockPonsFeeEscrow();
        treasury = new BidFlywheelTreasury(
            rewardsVault,
            address(vault),
            buybackVault,
            reserveVault,
            creatorRewardsVault,
            address(0),
            address(feeEscrow),
            address(0),
            address(this)
        );
    }

    function testOperatorDeploysProtocolOwnedLiquidity() public {
        (uint256 quote,) = market.quoteAddFunding(5_000e6);
        uint256 shares = vault.deployLiquidity(address(market), 5_000e6, quote);

        assertEq(shares, quote);
        assertEq(market.balanceOf(address(vault)), quote);
        assertEq(usdg.balanceOf(address(vault)), 0);
        assertEq(usdg.allowance(address(vault), address(market)), 0);
    }

    function testOnlyOperatorCanDeployLiquidity() public {
        vm.expectRevert(BidLiquidityVault.NotOperator.selector);
        vm.prank(outsider);
        vault.deployLiquidity(address(market), 1_000e6, 0);
    }

    function testUnapprovedMarketCannotReceiveLiquidity() public {
        vault.setMarketApproval(address(market), false);
        vm.expectRevert(BidLiquidityVault.MarketNotApproved.selector);
        vault.deployLiquidity(address(market), 1_000e6, 0);
    }

    function testPonsClaimDistributesAndDeploysProtocolOwnedLpEndToEnd() public {
        usdg.mint(address(this), 10_000e6);
        usdg.approve(address(feeEscrow), 10_000e6);
        feeEscrow.creditToken(address(treasury), usdg, 10_000e6);

        assertEq(treasury.claimPonsToken(address(usdg)), 10_000e6);
        treasury.distributeToken(usdg);
        assertEq(usdg.balanceOf(rewardsVault), 4_500e6);
        assertEq(usdg.balanceOf(address(vault)), 8_000e6);
        assertEq(usdg.balanceOf(buybackVault), 1_000e6);
        assertEq(usdg.balanceOf(reserveVault), 1_000e6);
        assertEq(usdg.balanceOf(creatorRewardsVault), 500e6);

        (uint256 quote,) = market.quoteAddFunding(2_000e6);
        uint256 shares = vault.deployLiquidity(address(market), 2_000e6, quote * 9_950 / 10_000);
        assertEq(market.balanceOf(address(vault)), shares);
        assertEq(usdg.balanceOf(address(vault)), 6_000e6);
    }
}
