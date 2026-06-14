// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC5564Announcer {
    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes memory ephemeralPubKey,
        bytes memory metadata
    ) external;
}

interface IGhostShard {
    function transferNative(address payable to, uint256 amount) external;

    function transferERC20(address token, address to, uint256 amount) external;

    function transferERC721(
        address token,
        address to,
        uint256 tokenId
    ) external;
}

contract GhostRouter is ReentrancyGuard {
    using ECDSA for bytes32;

    address public constant ERC5564_ANNOUNCER =
        0x55649E01B5Df198D18D95b5cc5051630cfD45564;
    uint256 public constant POST_EXECUTION_OVERHEAD = 20000;

    enum AssetType {
        Native,
        ERC20,
        ERC721
    }

    struct Announcement {
        uint256 schemeId;
        address stealthAddress;
        bytes ephemeralPubKey;
        bytes metadata;
    }

    struct Authorization {
        address targetAddress;
        uint32 chainId;
        uint32 nonce;
        uint8 yParity;
        bytes32 r;
        bytes32 s;
    }

    struct TransferCommand {
        address shard;
        AssetType assetType;
        address token;
        address to;
        uint256 value;
        bytes signature;
        Authorization authorization; // EIP-7702 authorization struct for dynamic code integrity guard
    }

    struct GasLimits {
        uint32 verificationGasLimit;
        uint32 callGasLimit;
        uint32 preVerificationGas;
        uint256 maxFeePerGas;
    }

    // --- CONFIGURATIONS ---
    mapping(address => uint256) public paymasterDeposits;
    mapping(address => bool) public isShardSpent;

    // --- EVENTS ---
    event GasDeposited(address indexed paymaster, uint256 amount);
    event GasWithdrawn(address indexed paymaster, uint256 amount, address to);
    event MeshExecuted(
        address indexed relayer,
        address indexed paymaster,
        uint256 totalGasUsed,
        uint256 totalGasCost,
        uint256 innerCallGasUsed,
        uint256 innerCallGasCost,
        bool success,
        bytes revertReason
    );

    // --- CUSTOM ERRORS ---
    error CannotAnnounceSpentShard(address stealthAddress);
    error ShardAlreadySpent(address shard);
    error InvalidSignature(address shard);
    error MeshExecutionFailed(address shard);
    error PaymasterExpired();
    error InvalidPaymasterSignature();
    error InsufficientPaymasterDeposit();
    error GasPriceTooHigh();
    error TargetCodeMismatch(address shard);

    function depositGas() external payable nonReentrant {
        paymasterDeposits[msg.sender] += msg.value;
        emit GasDeposited(msg.sender, msg.value);
    }

    function withdrawGas(uint256 amount, address payable to) external nonReentrant {
        if (paymasterDeposits[msg.sender] < amount)
            revert InsufficientPaymasterDeposit();
        paymasterDeposits[msg.sender] -= amount;
        emit GasWithdrawn(msg.sender, amount, to);
        (bool success, ) = to.call{value: amount}("");
        require(success, "Withdrawal transfer failed");
    }

    /**
     * @notice Pectra Native Entrypoint executing privacy mesh transaction arrays with dynamic code validation.
     */
    function executeMesh(
        TransferCommand[] calldata commands,
        Announcement[] calldata announcements,
        address paymaster,
        uint256 validUntil,
        bytes calldata paymasterSignature,
        GasLimits calldata limits
    )
        external
        payable
        nonReentrant
        returns (
            uint256 totalGasUsed,
            uint256 totalGasCost,
            uint256 innerCallGasUsed,
            uint256 innerCallGasCost,
            bool success,
            bytes memory revertReason
        )
    {
        uint256 startGas = gasleft();

        if (tx.gasprice > limits.maxFeePerGas) {
            revert GasPriceTooHigh();
        }

        // --- STEP 1: PRE-SCAN MATRIX FOR CODE INTEGRITY ---
        uint256 commandsLen = commands.length;

        for (uint256 i = 0; i < commandsLen; i++) {
            address currentShard = commands[i].shard;

            // Read hardware EIP-7702 runtime pointer bytecode (0xef0100 || target_address)
            bytes memory codePointer = new bytes(23);
            assembly {
                extcodecopy(currentShard, add(codePointer, 0x20), 0, 23)
            }

            address activeImplementation;
            assembly {
                let rawWord := mload(add(codePointer, 0x20))
                let implementationShifted := shr(72, rawWord)
                activeImplementation := and(
                    implementationShifted,
                    0xffffffffffffffffffffffffffffffffffffffff
                )
            }

            if (
                activeImplementation != commands[i].authorization.targetAddress
            ) {
                revert TargetCodeMismatch(currentShard);
            }
        }

        // Compute execution parameters matching the actual hardware array profile
        uint256 maxGasExpected = limits.verificationGasLimit +
            limits.callGasLimit +
            limits.preVerificationGas;
        uint256 requiredPrefund = maxGasExpected * tx.gasprice;

        // --- STEP 2: SECURE UPFRONT BALANCE DEBIT ---
        if (paymaster != address(0)) {
            if (paymasterDeposits[paymaster] < requiredPrefund) {
                revert InsufficientPaymasterDeposit();
            }
            unchecked {
                paymasterDeposits[paymaster] -= requiredPrefund;
            }
        }

        // --- STEP 3: CRYPTOGRAPHIC PAYMASTER SIGNATURE VALIDATION ---
        if (paymaster != address(0)) {
            if (block.timestamp > validUntil) {
                revert PaymasterExpired();
            }

            bytes32 paymasterHash = keccak256(
                abi.encode(
                    block.chainid,
                    address(this),
                    keccak256(abi.encode(commands)),
                    keccak256(abi.encode(announcements)),
                    validUntil,
                    keccak256(abi.encode(limits))
                )
            );

            bytes32 ethSignedPaymasterHash = MessageHashUtils
                .toEthSignedMessageHash(paymasterHash);
            if (
                ethSignedPaymasterHash.recover(paymasterSignature) != paymaster
            ) {
                revert InvalidPaymasterSignature();
            }
        }

        // --- STEP 4: SANDBOXED RUNTIME USER INNER EXECUTION CELL ---
        {
            bytes memory innerCallData = abi.encodeCall(
                this.innerExecuteMesh,
                (commands, announcements)
            );

            // TRACK EXACT INNER GAS BOUNDARIES
            uint256 gasBeforeInner = gasleft();
            (success, revertReason) = address(this).call{
                gas: limits.callGasLimit
            }(innerCallData);
            innerCallGasUsed = gasBeforeInner - gasleft();
            innerCallGasCost = innerCallGasUsed * tx.gasprice;
        }

        // --- STEP 5: FINAL RECONCILIATION & COMPENSATION ---
        unchecked {
            totalGasUsed =
                startGas -
                gasleft() +
                POST_EXECUTION_OVERHEAD +
                limits.preVerificationGas;

            totalGasCost = totalGasUsed * tx.gasprice;

            if (totalGasCost > requiredPrefund) {
                totalGasCost = requiredPrefund;
            }

            if (success) {
                revertReason = "";
            }

            emit MeshExecuted(
                msg.sender,
                paymaster,
                totalGasUsed,
                totalGasCost,
                innerCallGasUsed,
                innerCallGasCost,
                success,
                revertReason
            );

            if (paymaster != address(0)) {
                paymasterDeposits[paymaster] += (requiredPrefund -
                    totalGasCost);

                bool callSuccess;
                (callSuccess, ) = msg.sender.call{value: totalGasCost}("");
                require(callSuccess, "Bundler fee payment failed");
            }

            return (
                totalGasUsed,
                totalGasCost,
                innerCallGasUsed,
                innerCallGasCost,
                success,
                revertReason
            );
        }
    }

    /**
     * @notice Sandboxed target execution routine processing isolated inner user intents.
     */
    function innerExecuteMesh(
        TransferCommand[] calldata commands,
        Announcement[] calldata announcements
    ) external {
        require(msg.sender == address(this), "Sandbox access denied");

        uint256 announceLength = announcements.length;
        if (announceLength > 0) {
            for (uint256 j = 0; j < announceLength; j++) {
                Announcement calldata ann = announcements[j];

                if (isShardSpent[ann.stealthAddress]) {
                    revert CannotAnnounceSpentShard(ann.stealthAddress);
                }

                IERC5564Announcer(ERC5564_ANNOUNCER).announce(
                    ann.schemeId,
                    ann.stealthAddress,
                    ann.ephemeralPubKey,
                    ann.metadata
                );
            }
        }

        uint256 length = commands.length;
        uint256 cachedChainId = block.chainid;
        address cachedThis = address(this);

        for (uint256 i = 0; i < length; i++) {
            TransferCommand calldata cmd = commands[i];

            // 1. O(1) Global Shard Lock Management via Transient Storage
            // We use the shard address as the transient slot to track if we've locked it this tx.
            address currentShard = cmd.shard;
            bool alreadySeenInBatch;
            assembly {
                alreadySeenInBatch := tload(currentShard)
            }

            if (!alreadySeenInBatch) {
                if (isShardSpent[currentShard])
                    revert ShardAlreadySpent(currentShard);
                isShardSpent[currentShard] = true; // Permanently lock in global state
                assembly {
                    tstore(currentShard, 1) // Mark as seen in transient state for the rest of this batch
                }
            }

            bytes32 internalHash = keccak256(
                abi.encode(
                    cachedChainId,
                    cachedThis,
                    cmd.shard,
                    cmd.assetType,
                    cmd.token,
                    cmd.to,
                    cmd.value,
                    announcements
                )
            );

            if (
                MessageHashUtils.toEthSignedMessageHash(internalHash).recover(
                    cmd.signature
                ) != cmd.shard
            ) {
                revert InvalidSignature(cmd.shard);
            }

            AssetType aType = cmd.assetType;
            if (aType == AssetType.Native) {
                IGhostShard(cmd.shard).transferNative(
                    payable(cmd.to),
                    cmd.value
                );
            } else if (aType == AssetType.ERC20) {
                IGhostShard(cmd.shard).transferERC20(
                    cmd.token,
                    cmd.to,
                    cmd.value
                );
            } else if (aType == AssetType.ERC721) {
                IGhostShard(cmd.shard).transferERC721(
                    cmd.token,
                    cmd.to,
                    cmd.value
                );
            } else {
                revert MeshExecutionFailed(cmd.shard);
            }
        }
    }
}