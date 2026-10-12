// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockUSDT
 * @notice Simplified ERC-20 token simulating Tether USD (USDT) with 6 decimals and a public mint function for local dev / tests.
 */
contract MockUSDT {
    string public name = "Tether USD";
    string public symbol = "USDT";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();

    constructor() {
        // Mint initial dev supply of 10,000,000 USDT to deployer
        _mint(msg.sender, 10_000_000 * 10 ** 6);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        if (balanceOf[msg.sender] < amount) {
            revert InsufficientBalance();
        }

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) {
            revert ZeroAddress();
        }
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        if (balanceOf[from] < amount) {
            revert InsufficientBalance();
        }
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < amount) {
            revert InsufficientAllowance();
        }

        if (currentAllowance != type(uint256).max) {
            allowance[from][msg.sender] = currentAllowance - amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    /**
     * @notice Public mint function for dev testing.
     * @param to Recipient address.
     * @param amount Amount in 6 decimals.
     */
    function mint(address to, uint256 amount) external {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        _mint(to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
