// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract BidRewardsDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Epoch {
        address asset;
        bytes32 merkleRoot;
        uint256 totalAllocation;
        uint256 totalClaimed;
    }

    error AlreadyClaimed();
    error EpochAlreadyPublished();
    error EpochNotPublished();
    error InsufficientUncommittedBalance();
    error InvalidClaim();
    error InvalidEpoch();
    error InvalidRecipient();
    error NativeTransferFailed();

    mapping(uint256 epochId => Epoch epoch) public epochs;
    mapping(uint256 epochId => mapping(address account => bool hasClaimed)) public claimed;
    mapping(address asset => uint256 amount) public totalOutstanding;

    event EpochPublished(uint256 indexed epochId, address indexed asset, bytes32 merkleRoot, uint256 totalAllocation);
    event RewardsClaimed(uint256 indexed epochId, address indexed asset, address indexed account, uint256 amount);
    event ExcessRecovered(address indexed asset, address indexed recipient, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    function publishEpoch(uint256 epochId, address asset, bytes32 merkleRoot, uint256 totalAllocation)
        external
        onlyOwner
    {
        if (epochId == 0 || merkleRoot == bytes32(0) || totalAllocation == 0) revert InvalidEpoch();
        if (epochs[epochId].merkleRoot != bytes32(0)) revert EpochAlreadyPublished();
        if (totalAllocation > uncommittedBalance(asset)) revert InsufficientUncommittedBalance();

        epochs[epochId] =
            Epoch({asset: asset, merkleRoot: merkleRoot, totalAllocation: totalAllocation, totalClaimed: 0});
        totalOutstanding[asset] += totalAllocation;
        emit EpochPublished(epochId, asset, merkleRoot, totalAllocation);
    }

    function claim(uint256 epochId, address account, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        Epoch storage epoch = epochs[epochId];
        if (epoch.merkleRoot == bytes32(0)) revert EpochNotPublished();
        if (account == address(0) || amount == 0) revert InvalidClaim();
        if (claimed[epochId][account]) revert AlreadyClaimed();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(epochId, epoch.asset, account, amount))));
        if (!MerkleProof.verifyCalldata(proof, epoch.merkleRoot, leaf)) revert InvalidClaim();

        claimed[epochId][account] = true;
        epoch.totalClaimed += amount;
        totalOutstanding[epoch.asset] -= amount;
        _transfer(epoch.asset, account, amount);
        emit RewardsClaimed(epochId, epoch.asset, account, amount);
    }

    function uncommittedBalance(address asset) public view returns (uint256) {
        uint256 balance = _balance(asset);
        uint256 outstanding = totalOutstanding[asset];
        return balance > outstanding ? balance - outstanding : 0;
    }

    function recoverExcess(address asset, address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount > uncommittedBalance(asset)) revert InsufficientUncommittedBalance();
        _transfer(asset, recipient, amount);
        emit ExcessRecovered(asset, recipient, amount);
    }

    function _balance(address asset) private view returns (uint256) {
        return asset == address(0) ? address(this).balance : IERC20(asset).balanceOf(address(this));
    }

    function _transfer(address asset, address recipient, uint256 amount) private {
        if (asset == address(0)) {
            (bool sent,) = recipient.call{value: amount}("");
            if (!sent) revert NativeTransferFailed();
        } else {
            IERC20(asset).safeTransfer(recipient, amount);
        }
    }
}
