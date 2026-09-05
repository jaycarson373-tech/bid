// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {BidRewardsDistributor} from "../src/BidRewardsDistributor.sol";

contract RewardMockToken is ERC20 {
    constructor() ERC20("USDG", "USDG") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract BidRewardsDistributorTest is Test {
    RewardMockToken internal token;
    BidRewardsDistributor internal distributor;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        token = new RewardMockToken();
        distributor = new BidRewardsDistributor(address(this));
    }

    function testFundedEpochClaimsExactlyOnce() public {
        uint256 epochId = 1;
        bytes32 aliceLeaf = _leaf(epochId, address(token), alice, 70 ether);
        bytes32 bobLeaf = _leaf(epochId, address(token), bob, 30 ether);
        bytes32 root = _hashPair(aliceLeaf, bobLeaf);
        token.mint(address(distributor), 100 ether);
        distributor.publishEpoch(epochId, address(token), root, 100 ether);

        bytes32[] memory aliceProof = new bytes32[](1);
        aliceProof[0] = bobLeaf;
        vm.prank(makeAddr("relayer"));
        distributor.claim(epochId, alice, 70 ether, aliceProof);

        assertEq(token.balanceOf(alice), 70 ether);
        assertEq(distributor.totalOutstanding(address(token)), 30 ether);
        vm.expectRevert(BidRewardsDistributor.AlreadyClaimed.selector);
        distributor.claim(epochId, alice, 70 ether, aliceProof);

        bytes32[] memory bobProof = new bytes32[](1);
        bobProof[0] = aliceLeaf;
        distributor.claim(epochId, bob, 30 ether, bobProof);
        assertEq(token.balanceOf(bob), 30 ether);
        assertEq(distributor.totalOutstanding(address(token)), 0);
    }

    function testEpochCannotBePublishedTwiceOrOvercommitted() public {
        token.mint(address(distributor), 100 ether);
        distributor.publishEpoch(1, address(token), bytes32(uint256(1)), 100 ether);

        vm.expectRevert(BidRewardsDistributor.EpochAlreadyPublished.selector);
        distributor.publishEpoch(1, address(token), bytes32(uint256(2)), 1 ether);
        vm.expectRevert(BidRewardsDistributor.InsufficientUncommittedBalance.selector);
        distributor.publishEpoch(2, address(token), bytes32(uint256(2)), 1 ether);
    }

    function testInvalidProofDoesNotMarkClaimed() public {
        token.mint(address(distributor), 10 ether);
        distributor.publishEpoch(1, address(token), _leaf(1, address(token), alice, 10 ether), 10 ether);

        bytes32[] memory proof = new bytes32[](0);
        vm.expectRevert(BidRewardsDistributor.InvalidClaim.selector);
        distributor.claim(1, bob, 10 ether, proof);
        assertFalse(distributor.claimed(1, bob));
        assertEq(distributor.totalOutstanding(address(token)), 10 ether);
    }

    function testNativeRewardsAndExcessRecovery() public {
        vm.deal(address(distributor), 2 ether);
        distributor.publishEpoch(1, address(0), _leaf(1, address(0), alice, 1 ether), 1 ether);
        assertEq(distributor.uncommittedBalance(address(0)), 1 ether);

        distributor.recoverExcess(address(0), bob, 1 ether);
        bytes32[] memory proof = new bytes32[](0);
        distributor.claim(1, alice, 1 ether, proof);
        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 1 ether);
    }

    function _leaf(uint256 epochId, address asset, address account, uint256 amount) private pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(epochId, asset, account, amount))));
    }

    function _hashPair(bytes32 left, bytes32 right) private pure returns (bytes32) {
        return left < right ? keccak256(bytes.concat(left, right)) : keccak256(bytes.concat(right, left));
    }
}
