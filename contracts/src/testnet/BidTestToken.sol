// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract BidTestToken is ERC20, Ownable {
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    error FaucetDisabled();
    error FaucetAmountTooHigh();
    error FaucetCooldownActive();

    uint8 private immutable _tokenDecimals;
    uint256 public immutable maxFaucetAmount;
    bool public immutable faucetEnabled;
    mapping(address => uint256) public nextFaucetAt;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address initialOwner,
        uint256 initialSupply,
        bool faucetEnabled_
    ) ERC20(name_, symbol_) Ownable(initialOwner) {
        _tokenDecimals = decimals_;
        faucetEnabled = faucetEnabled_;
        maxFaucetAmount = 50_000 * 10 ** decimals_;
        _mint(initialOwner, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address recipient, uint256 amount) external onlyOwner {
        _mint(recipient, amount);
    }

    function faucet(uint256 amount) external {
        if (!faucetEnabled) revert FaucetDisabled();
        if (amount == 0 || amount > maxFaucetAmount) revert FaucetAmountTooHigh();
        if (block.timestamp < nextFaucetAt[msg.sender]) revert FaucetCooldownActive();

        nextFaucetAt[msg.sender] = block.timestamp + FAUCET_COOLDOWN;
        _mint(msg.sender, amount);
    }
}
