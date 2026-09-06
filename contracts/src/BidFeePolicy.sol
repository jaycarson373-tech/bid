// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library BidFeePolicy {
    bytes32 internal constant VERSION = keccak256("BID_FEE_POLICY_V1");
    uint16 internal constant CREATOR_FEE_BPS = 150;

    uint256 internal constant LP_REWARDS_BPS = 4_500;
    uint256 internal constant MARKET_LIQUIDITY_BPS = 3_000;
    uint256 internal constant BUYBACK_BURN_BPS = 1_000;
    uint256 internal constant TREASURY_BPS = 1_000;
    uint256 internal constant CREATOR_REWARDS_BPS = 500;
    uint256 internal constant BPS = 10_000;

    function validate() internal pure {
        assert(LP_REWARDS_BPS + MARKET_LIQUIDITY_BPS + BUYBACK_BURN_BPS + TREASURY_BPS + CREATOR_REWARDS_BPS == BPS);
    }
}
