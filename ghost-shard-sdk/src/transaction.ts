/**
 * GhostShard SDK — Transaction Preparation
 *
 * Builds EIP-7702 authorization signatures, EIP-191 transfer commands,
 * and announcement data for spending shards via the GhostRouter.
 *
 * Per-shard flow:
 *   1. Derive shard private key: (spendingPriv + sharedSecret) mod n
 *   2. Sign EIP-7702 authorization (delegation to SHARD_IMPLEMENTATION)
 *   3. Sign EIP-191 transfer commands for the GhostRouter
 *   4. Build announcements for change shards
 *
 * Nonce is always 0 (UTXO model — each shard is used once).
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import type {
  KeySet, Authorization, PreparedTransfer,
  TransferRequest, Shard,
  PrivateTransferRequest,
  Announcement,
  TransferCommand,
  BatchCall,
  PreparedPrivateDeposit,
  PrivateDepositRequest,
  MeshExecutionResult,
} from './types.js';
import { deriveShardPrivateKey, computeSharedSecret } from './keys.js';
import {
  numberToHex,
  TransactionReceipt,
  type Hex
} from 'viem';
import { bytesToHex, decodeErrorResult, encodeAbiParameters, encodeFunctionData, hashAuthorization, hexToBytes, keccak256, parseEventLogs, toHex } from 'viem/utils';
import { ERC20_ABI, ERC5564_ANNOUNCE_ABI, ERC5564_ANNOUNCE_ADDRESS, ERC721_ABI, GHOST_ROUTER_ABI, GHOST_ROUTER_ADDRESS, SHARD_ABI, SHARD_IMPLEMENTATION } from './abi.js';
import { generateStealthAddress, getNewDepositAddress } from './stealth.js';
import { generateSplitsForShard as partitionDepositPool, randomFloat, shuffle } from './coinSelection.js';
import { packMetadata } from './announce.js';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Sign EIP-7702 authorization delegating shard EOA to the ERC-4337 implementation.
 * hash = keccak256(0x05 || rlp([chainId, implementation, nonce]))
 * Nonce is always 0 (UTXO model).
 */
export function signAuthorization(
  shardPrivateKey: Uint8Array,
  implementationAddress: Hex,
  chainId: number,
  nonce: number = 0,
): Authorization {
  const hash = hashAuthorization({
    chainId,
    contractAddress: implementationAddress,
    nonce
  });

  const sig = secp256k1.sign(hexToBytes(hash), shardPrivateKey);
  const normalizedYParity = (sig.recovery ?? 0) & 1;

  return {
    chainId,
    targetAddress: implementationAddress,
    r: numberToHex(sig.r, { size: 32 }),
    s: numberToHex(sig.s, { size: 32 }),
    yParity: normalizedYParity,
    nonce,
  };
}

/**
 * Sign an EIP-191 transfer command for the GhostRouter.
 * Encodes (chainId, router, shard, assetType, token, to, value) → keccak256 → EIP-191 sign.
 */
export async function signTransferCommand(
  shardPrivateKey: Hex,
  routerAddress: Hex,
  shardAddress: Hex,
  assetType: number,
  token: Hex,
  to: Hex,
  value: bigint,
  chainId: number,
  announcements: Announcement[],
): Promise<Hex> {
  const encoded = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint8' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint256' },
      {
        type: 'tuple[]',
        name: 'announcements',
        components: [
          { name: 'schemeId', type: 'uint256' },
          { name: 'stealthAddress', type: 'address' },
          { name: 'ephemeralPubKey', type: 'bytes' },
          { name: 'metadata', type: 'bytes' }
        ]
      },
    ],
    [BigInt(chainId), routerAddress, shardAddress, assetType, token, to, value, announcements]
  );

  const internalHash = keccak256(encoded);
  const account = privateKeyToAccount(shardPrivateKey);

  const signature = await account.signMessage({
    message: { raw: internalHash }
  });

  return signature;
}

/**
 * Derive shard private key from an announcement log.
 * shardPriv = (spendingPriv + sharedSecret) mod n
 */
export function deriveShardPrivateKeyFromAnnouncement(
  spendingPrivateKey: Uint8Array,
  viewingPrivateKey: Uint8Array,
  ephemeralPubKey: Hex,
): Uint8Array {
  const sharedSecret = computeSharedSecret(viewingPrivateKey, hexToBytes(ephemeralPubKey));
  return deriveShardPrivateKey(spendingPrivateKey, sharedSecret);
}

/**
 * Public mode — prepare transaction for a known recipient address.
 * Uses randomized payment/change splits with a self-owned change pool.
 */
export async function prepareTransfer(
  shards: Shard[],
  request: TransferRequest,
  paymentMatrix: bigint[][],
  changeMatrix: bigint[][],
  keys: KeySet,
  chainId: number,
): Promise<PreparedTransfer> {
  const authorizations: Authorization[] = [];
  const commands: TransferCommand[] = [];
  const announcements: Announcement[] = [];
  const privateKeyMap = new Map<Hex, Hex>()
  const changeShards: PreparedTransfer['changeShards'] = [];

  const minChangePool = 1;
  const maxChangePool = 4;
  const changePoolSize = Math.floor(randomFloat() * (maxChangePool - minChangePool + 1)) + minChangePool;

  const freshChangePool: Array<{ stealthAddress: Hex; ephemeralPubKey: Hex; privateKey: Uint8Array }> = [];
  for (let c = 0; c < changePoolSize; c++) {
    const freshAddr = getNewDepositAddress(keys);
    const derivedChangeKey = deriveShardPrivateKeyFromAnnouncement(
      keys.spendingPrivateKey,
      keys.viewingPrivateKey,
      freshAddr.ephemeralPubKey
    );

    privateKeyMap.set(freshAddr.stealthAddress, toHex(derivedChangeKey, { size: 32 }))

    freshChangePool.push({
      stealthAddress: freshAddr.stealthAddress,
      ephemeralPubKey: freshAddr.ephemeralPubKey,
      privateKey: derivedChangeKey,
    });
  }

  const assetTypeInt = request.type === 'NATIVE' ? 0 : request.type === 'ERC20' ? 1 : 2;
  const tokenTarget = request.tokenAddress ?? '0x0000000000000000000000000000000000000000';

  for (let i = 0; i < shards.length; i++) {
    const shard = shards[i];
    const shardKey = deriveShardPrivateKeyFromAnnouncement(
      keys.spendingPrivateKey,
      keys.viewingPrivateKey,
      shard.ephemeralPubKey,
    );

    privateKeyMap.set(shard.address, toHex(shardKey, { size: 32 }))

    authorizations.push(
      signAuthorization(shardKey, SHARD_IMPLEMENTATION, chainId, 0),
    );

    const localizedShardCommands: typeof commands = [];

    for (const amt of paymentMatrix[i]) {
      if (amt <= 0n) continue;

      localizedShardCommands.push({
        shard: shard.address,
        assetType: assetTypeInt,
        token: tokenTarget,
        to: request.to,
        value: amt,
        signature: '0x',
        authorization: signAuthorization(shardKey, SHARD_IMPLEMENTATION, chainId, 0)
      });
    }

    for (const amt of changeMatrix[i]) {
      if (amt <= 0n) continue;

      const poolIndex = Math.floor(randomFloat() * freshChangePool.length);
      const targetChange = freshChangePool[poolIndex];
      const targetAddress = targetChange.stealthAddress;

      localizedShardCommands.push({
        shard: shard.address,
        assetType: assetTypeInt,
        token: tokenTarget,
        to: targetAddress,
        value: amt,
        signature: '0x',
        authorization: signAuthorization(shardKey, SHARD_IMPLEMENTATION, chainId, 0)
      });

      changeShards.push({
        address: targetAddress,
        ephemeralPubKey: targetChange.ephemeralPubKey,
        amount: amt,
      });

      const alreadyTracked = announcements.some((ann) => ann.stealthAddress === targetAddress);
      if (!alreadyTracked) {
        authorizations.push(
          signAuthorization(targetChange.privateKey, SHARD_IMPLEMENTATION, chainId, 0)
        );

        const sharedSecret = computeSharedSecret(keys.viewingPrivateKey, hexToBytes(targetChange.ephemeralPubKey));
        const metaBytes = await packMetadata(sharedSecret, {
          type: request.type,
          tokenAddress: tokenTarget,
          amount: request.type === 'ERC721' ? 0n : amt,
          tokenId: request.type === 'ERC721' ? amt : 0n,
        });

        announcements.push({
          schemeId: 1n,
          stealthAddress: targetAddress,
          ephemeralPubKey: targetChange.ephemeralPubKey,
          metadata: bytesToHex(metaBytes)
        });
      }
    }

    // Shuffle commands to break sequence trail mappings
    shuffle(localizedShardCommands);


    commands.push(...localizedShardCommands);
  }

  // --- Refactored Fusion Logic (ERC721 Safe) ---

  const fusedCommandsMap = new Map<string, TransferCommand>();
  const finalCommands: TransferCommand[] = [];

  for (const cmd of commands) {
    // assetType 2 is ERC721. We cannot sum Token IDs.
    // Push them directly to the final array to prevent fusion.
    if (cmd.assetType === 2) {
      finalCommands.push(cmd);
      continue;
    }

    // For NATIVE (0) and ERC20 (1), fuse by shard, assetType, token, and recipient
    const key = `${cmd.shard.toLowerCase()}-${cmd.assetType}-${cmd.token.toLowerCase()}-${cmd.to.toLowerCase()}`;
    const existing = fusedCommandsMap.get(key);

    if (existing) {
      // Safe to sum BigInt amounts for fungible tokens
      existing.value += cmd.value;
    } else {
      // Clone to avoid mutating the original objects
      fusedCommandsMap.set(key, { ...cmd });
    }
  }

  // Combine the un-fused ERC721s with the fused fungible commands
  finalCommands.push(...fusedCommandsMap.values());

  // Sign the final, safely aggregated commands
  const cmdsWithSig = finalCommands.map(async (cmd) => {
    const signature = await signTransferCommand(
      privateKeyMap.get(cmd.shard)!,
      GHOST_ROUTER_ADDRESS,
      cmd.shard,
      cmd.assetType,
      cmd.token,
      cmd.to,
      cmd.value,
      chainId,
      announcements
    );

    return { ...cmd, signature };
  });

  return {
    authorizations,
    commands: (await Promise.all(cmdsWithSig)),
    announcements,
    changeShards,
    shardAddresses: shards.map((s) => s.address),
    changeAmount: changeShards.reduce((sum, val) => sum + val.amount, 0n),
  };
}

/**
 * Privacy mode — prepare transaction for a stealth recipient (meta-address).
 * Uses randomized recipient stealth address pool + change pool to prevent linkability.
 */
export async function preparePrivateTransfer(
  shards: Shard[],
  request: PrivateTransferRequest,
  paymentMatrix: bigint[][],
  changeMatrix: bigint[][],
  keys: KeySet,
  chainId: number,
): Promise<PreparedTransfer> {
  const authorizations: Authorization[] = [];
  const commands: TransferCommand[] = [];
  const announcements: Announcement[] = [];
  const privateKeyMap = new Map<Hex, Hex>()

  const changeShards: PreparedTransfer['changeShards'] = [];

  const minRecipientPool = 2;
  const maxRecipientPool = 5;
  const recipientPoolSize = Math.floor(randomFloat() * (maxRecipientPool - minRecipientPool + 1)) + minRecipientPool;

  const recipientPool: Array<{ stealthAddress: Hex; ephemeralPubKey: Hex, sharedSecret: Hex }> = [];
  for (let r = 0; r < recipientPoolSize; r++) {
    const stealth = generateStealthAddress(request.metaAddress);
    recipientPool.push({
      stealthAddress: stealth.stealthAddress as Hex,
      ephemeralPubKey: stealth.ephemeralPubKey as Hex,
      sharedSecret: stealth.sharedSecret as Hex,
    });
  }

  const minChangePool = 1;
  const maxChangePool = 4;
  const changePoolSize = Math.floor(randomFloat() * (maxChangePool - minChangePool + 1)) + minChangePool;

  const freshChangePool: Array<{ stealthAddress: Hex; ephemeralPubKey: Hex; privateKey: Uint8Array }> = [];
  for (let c = 0; c < changePoolSize; c++) {
    const freshAddr = getNewDepositAddress(keys);
    const derivedChangeKey = deriveShardPrivateKeyFromAnnouncement(
      keys.spendingPrivateKey,
      keys.viewingPrivateKey,
      freshAddr.ephemeralPubKey
    );

    privateKeyMap.set(freshAddr.stealthAddress, toHex(derivedChangeKey, { size: 32 }))

    freshChangePool.push({
      stealthAddress: freshAddr.stealthAddress,
      ephemeralPubKey: freshAddr.ephemeralPubKey,
      privateKey: derivedChangeKey,
    });
  }

  const assetTypeInt = request.type === 'NATIVE' ? 0 : request.type === 'ERC20' ? 1 : 2;
  const tokenTarget = request.tokenAddress ?? '0x0000000000000000000000000000000000000000';

  for (let i = 0; i < shards.length; i++) {
    const shard = shards[i];
    const shardKey = deriveShardPrivateKeyFromAnnouncement(
      keys.spendingPrivateKey,
      keys.viewingPrivateKey,
      shard.ephemeralPubKey,
    );

    privateKeyMap.set(shard.address, toHex(shardKey, { size: 32 }))

    authorizations.push(
      signAuthorization(shardKey, SHARD_IMPLEMENTATION, chainId, 0),
    );

    const localizedShardCommands: typeof commands = [];

    for (const amt of paymentMatrix[i]) {
      if (amt <= 0n && assetTypeInt != 2) continue;

      const poolIndex = Math.floor(randomFloat() * recipientPool.length);
      const targetRecipient = recipientPool[poolIndex];
      const toAddress = targetRecipient.stealthAddress;

      localizedShardCommands.push({
        shard: shard.address,
        assetType: assetTypeInt,
        token: tokenTarget,
        to: toAddress,
        value: amt,
        signature: '0x',
        authorization: signAuthorization(shardKey, SHARD_IMPLEMENTATION, chainId, 0)
      });

      const alreadyTracked = announcements.some((ann) => ann.stealthAddress === toAddress);
      if (!alreadyTracked) {
        const sharedSecret = hexToBytes(targetRecipient.sharedSecret);;
        const metaBytes = await packMetadata(sharedSecret, {
          type: request.type,
          tokenAddress: tokenTarget,
          amount: request.type === 'ERC721' ? 0n : amt,
          tokenId: request.type === 'ERC721' ? amt : 0n,
        });

        announcements.push({
          schemeId: 1n,
          stealthAddress: toAddress,
          ephemeralPubKey: targetRecipient.ephemeralPubKey,
          metadata: bytesToHex(metaBytes),
        });
      }
    }

    for (const amt of changeMatrix[i]) {
      if (amt <= 0n) continue;

      const poolIndex = Math.floor(randomFloat() * freshChangePool.length);
      const targetChange = freshChangePool[poolIndex];
      const targetAddress = targetChange.stealthAddress;

      localizedShardCommands.push({
        shard: shard.address,
        assetType: assetTypeInt,
        token: tokenTarget,
        to: targetAddress,
        value: amt,
        signature: '0x',
        authorization: signAuthorization(shardKey, SHARD_IMPLEMENTATION, chainId, 0)
      });

      changeShards.push({
        address: targetAddress,
        ephemeralPubKey: targetChange.ephemeralPubKey,
        amount: amt,
      });

      const alreadyTracked = announcements.some((ann) => ann.stealthAddress === targetAddress);
      if (!alreadyTracked) {
        authorizations.push(
          signAuthorization(targetChange.privateKey, SHARD_IMPLEMENTATION, chainId, 0)
        );

        const sharedSecret = computeSharedSecret(keys.viewingPrivateKey, hexToBytes(targetChange.ephemeralPubKey));
        const metaBytes = await packMetadata(sharedSecret, {
          type: request.type,
          tokenAddress: tokenTarget,
          amount: request.type === 'ERC721' ? 0n : amt,
          tokenId: request.type === 'ERC721' ? amt : 0n,
        });

        announcements.push({
          schemeId: 1n,
          stealthAddress: targetAddress,
          ephemeralPubKey: targetChange.ephemeralPubKey,
          metadata: bytesToHex(metaBytes),
        });
      }
    }

    shuffle(localizedShardCommands);

    commands.push(...localizedShardCommands);
  }

  // --- Refactored Fusion Logic (ERC721 Safe) ---

  const fusedCommandsMap = new Map<string, TransferCommand>();
  const finalCommands: TransferCommand[] = [];

  for (const cmd of commands) {
    // assetType 2 is ERC721. We cannot sum Token IDs.
    // Push them directly to the final array to prevent fusion.
    if (cmd.assetType === 2) {
      finalCommands.push(cmd);
      continue;
    }

    // For NATIVE (0) and ERC20 (1), fuse by shard, assetType, token, and recipient
    const key = `${cmd.shard.toLowerCase()}-${cmd.assetType}-${cmd.token.toLowerCase()}-${cmd.to.toLowerCase()}`;
    const existing = fusedCommandsMap.get(key);

    if (existing) {
      // Safe to sum BigInt amounts for fungible tokens
      existing.value += cmd.value;
    } else {
      // Clone to avoid mutating the original objects
      fusedCommandsMap.set(key, { ...cmd });
    }
  }

  // Combine the un-fused ERC721s with the fused fungible commands
  finalCommands.push(...fusedCommandsMap.values());

  // Sign the final, safely aggregated commands
  const cmdsWithSig = finalCommands.map(async (cmd) => {
    const signature = await signTransferCommand(
      privateKeyMap.get(cmd.shard)!,
      GHOST_ROUTER_ADDRESS,
      cmd.shard,
      cmd.assetType,
      cmd.token,
      cmd.to,
      cmd.value,
      chainId,
      announcements
    );

    return { ...cmd, signature };
  });

  // --- End Refactoring ---

  return {
    authorizations,
    commands: (await Promise.all(cmdsWithSig)),
    announcements,
    changeShards,
    shardAddresses: shards.map((s) => s.address),
    changeAmount: changeShards.reduce((sum, val) => sum + val.amount, 0n),
  };
}

export async function preparePrivateDeposit(
  request: PrivateDepositRequest,
): Promise<PreparedPrivateDeposit> {
  const calls: BatchCall[] = [];
  const targetStealthAddresses: Hex[] = [];

  const assetTypeInt = request.type === 'NATIVE' ? 0 : request.type === 'ERC20' ? 1 : 2;
  const tokenTarget = request.tokenAddress ?? '0x0000000000000000000000000000000000000000';

  if (assetTypeInt === 2) {
    // --- ERC-721 BATCH DISPATCH ---
    if (!request.tokenAddress) throw new Error('Token contract address coordinate required for ERC721');

    const stealth = generateStealthAddress(request.metaAddress);
    const toAddress = stealth.stealthAddress as Hex;
    targetStealthAddresses.push(toAddress);


    const metaBytes = await packMetadata(hexToBytes(stealth.sharedSecret), {
      type: 'ERC721' as any,
      tokenAddress: tokenTarget,
      amount: 0n,
      tokenId: request.tokenId ?? 0n,
    });

    // 1. Core transferFrom call data configuration
    const transferCalldata = encodeFunctionData({
      abi: ERC721_ABI,
      functionName: 'transferFrom',
      args: [request.senderAddress, toAddress, request.tokenId ?? 0n]
    });
    calls.push({ to: request.tokenAddress, data: transferCalldata, value: 0n });

    // 2. Immediate direct announcer visibility registration call
    const announceCalldata = encodeFunctionData({
      abi: ERC5564_ANNOUNCE_ABI,
      functionName: 'announce',
      args: [1n, toAddress, stealth.ephemeralPubKey as Hex, bytesToHex(metaBytes)]
    });
    calls.push({ to: ERC5564_ANNOUNCE_ADDRESS, data: announceCalldata, value: 0n });

  } else {
    // --- NATIVE / ERC-20 MULTI-SPLIT BATCH DISPATCH ---
    const minRecipientPool = 2;
    const maxRecipientPool = 5;
    const recipientPoolSize = Math.floor(randomFloat() * (maxRecipientPool - minRecipientPool + 1)) + minRecipientPool;

    const recipientPool: Array<ReturnType<typeof generateStealthAddress>> = [];
    for (let r = 0; r < recipientPoolSize; r++) {
      const stealth = generateStealthAddress(request.metaAddress);

      recipientPool.push({
        ...stealth
      });
    }

    const minDustThreshold = request.type === 'NATIVE' ? 10000n : 1n;
    const paymentSplits = partitionDepositPool(request.amount, recipientPoolSize, minDustThreshold);

    const transferCalls: BatchCall[] = [];
    const announceCalls: BatchCall[] = [];

    for (let i = 0; i < paymentSplits.length; i++) {
      const amt = paymentSplits[i];
      if (amt <= 0n) continue;

      const poolIndex = i % recipientPool.length;
      const targetRecipient = recipientPool[poolIndex];
      const toAddress = targetRecipient.stealthAddress;

      targetStealthAddresses.push(toAddress);

      if (request.type === 'NATIVE') {
        transferCalls.push({ to: toAddress, data: '0x', value: amt });
      } else {
        if (!request.tokenAddress) throw new Error('Token contract address coordinate required for ERC20');
        const transferCalldata = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [toAddress, amt]
        });
        transferCalls.push({ to: request.tokenAddress, data: transferCalldata, value: 0n });
      }

      const sharedSecret = hexToBytes(targetRecipient.sharedSecret);
      const metaBytes = await packMetadata(sharedSecret, {
        type: request.type as any,
        tokenAddress: tokenTarget,
        amount: amt,
        tokenId: 0n
      });

      const announceCalldata = encodeFunctionData({
        abi: ERC5564_ANNOUNCE_ABI,
        functionName: 'announce',
        args: [1n, toAddress, targetRecipient.ephemeralPubKey, bytesToHex(metaBytes)]
      });
      announceCalls.push({ to: ERC5564_ANNOUNCE_ADDRESS, data: announceCalldata, value: 0n });
    }

    // Shuffle both execution channels independently to mask sequence trail linkages
    shuffle(transferCalls);
    shuffle(announceCalls);

    // Interleave the operations array so the batch sequences symmetrically: [Transfer, Announce, Transfer, Announce]
    for (let i = 0; i < transferCalls.length; i++) {
      calls.push(transferCalls[i]);
      if (announceCalls[i]) {
        calls.push(announceCalls[i]);
      }
    }
  }

  return {
    calls,
    stealthAddresses: targetStealthAddresses
  };
}

/**
 * Parses a transaction receipt to determine if the inner GhostRouter sandbox succeeded.
 */
export function checkInnerExecutionStatus(
  receipt: TransactionReceipt
): MeshExecutionResult {
  // 1. Extract specifically the MeshExecuted event
  const logs = parseEventLogs({
    abi: GHOST_ROUTER_ABI,
    eventName: 'MeshExecuted',
    logs: receipt.logs,
  });

  if (logs.length === 0) {
    throw new Error('MeshExecuted event missing. Transaction hijacked or completely reverted.');
  }

  // 2. Extract arguments from the parsed log
  const { relayer, paymaster, totalGasUsed, totalGasCost, innerCallGasUsed, innerCallGasCost, success, revertReason } = logs[0].args;

  // 3. Evaluate sandbox runtime status
  let decodedString = '0x';
  if (!success) {
    let parsedErrorName: string | undefined = undefined;
    let parsedErrorArgs: any[] | undefined = undefined;

    try {
      // Decode the custom error using your contract's ABI
      const decodedError = decodeErrorResult({
        abi: [GHOST_ROUTER_ABI, SHARD_ABI],
        data: revertReason as Hex,
      });

      parsedErrorName = decodedError.errorName;
      parsedErrorArgs = decodedError.args as any[];

      // Format it cleanly, e.g., "ShardAlreadySpent(0x123...abc)"
      decodedString = `${parsedErrorName}${parsedErrorArgs ? `(${parsedErrorArgs.join(', ')})` : '()'
        }`;
    } catch (e) {
      // Fallback: If it's not in the ABI or is a standard string revert
      decodedString = revertReason;
      ;
    }
  }

  return { relayer, paymaster, totalGasUsed, totalGasCost, innerCallGasUsed, innerCallGasCost, success, revertReason: decodedString }
}