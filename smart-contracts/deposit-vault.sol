// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DepositVault
 * @notice Central depository for native ETH and ERC-20 token deposits attributed by userId.
 *         Allows platform hot wallet (owner) to sweep accumulated funds.
 */
contract DepositVault {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Deposited(
        bytes16 indexed userId,
        address indexed token,
        uint256 amount,
        address sender
    );
    event NativeSweep(address indexed recipient, uint256 amount);
    event TokenSweep(address indexed token, address indexed recipient, uint256 amount);

    error Unauthorized();
    error ZeroRecipientAddress();
    error ZeroTokenAddress();
    error ZeroDepositAmount();
    error TransferFailed();
    error DirectNativeDepositDisabled();

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function _checkOwner() internal view {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @notice Deposit native ETH on behalf of a platform user.
     * @param userId Platform user identifier represented as UUIDv7 bytes16.
     */
    function depositNative(bytes16 userId) external payable {
        if (msg.value == 0) {
            revert ZeroDepositAmount();
        }

        emit Deposited(userId, address(0), msg.value, msg.sender);
    }

    /**
     * @notice Deposit ERC-20 token on behalf of a platform user.
     * @param userId Platform user identifier represented as UUIDv7 bytes16.
     * @param token ERC-20 token contract address.
     * @param amount Amount in token atomic units.
     */
    function depositToken(bytes16 userId, address token, uint256 amount) external {
        if (token == address(0)) {
            revert ZeroTokenAddress();
        }
        if (amount == 0) {
            revert ZeroDepositAmount();
        }

        // Call transferFrom(sender, address(this), amount)
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount)
        );

        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }

        emit Deposited(userId, token, amount, msg.sender);
    }

    /**
     * @notice Sweep accumulated native ETH to a destination address (typically hot wallet).
     * @param to Destination address.
     * @param amount Amount in wei to transfer.
     */
    function sweepNative(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) {
            revert ZeroRecipientAddress();
        }

        (bool success, ) = to.call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }

        emit NativeSweep(to, amount);
    }

    /**
     * @notice Sweep accumulated ERC-20 token to a destination address.
     * @param token ERC-20 token contract address.
     * @param to Destination address.
     * @param amount Amount in token units.
     */
    function sweepToken(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            revert ZeroTokenAddress();
        }
        if (to == address(0)) {
            revert ZeroRecipientAddress();
        }

        // Call transfer(to, amount)
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, amount)
        );

        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }

        emit TokenSweep(token, to, amount);
    }

    /**
     * @notice Transfer ownership of the vault.
     * @param newOwner Address of new owner.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert ZeroRecipientAddress();
        }
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @notice Fallback function to reject direct untracked ETH transfers.
     */
    receive() external payable {
        revert DirectNativeDepositDisabled();
    }
}
