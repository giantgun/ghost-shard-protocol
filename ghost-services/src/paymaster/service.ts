import {
  keccak256,
  encodeAbiParameters,
  encodeFunctionData,
  hashMessage,
  type Address,
  type Hex,
  type StateOverride,
  recoverAddress,
  toHex,
  decodeFunctionResult,
  decodeErrorResult,
  RpcStateOverride,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config.js';
import { ROUTER_ABI, SHARD_ABI } from '../common/abi.js';
import { publicClient } from '../common/viemClient.js';
import { AppError } from '../common/errors.js';
import type {
  TransferCommand,
  Announcement,
  GasLimits,
  PaymasterQuoteResponse,
  Authorization,
} from '../types.js';
import {
  estimateGasWithDoubleSimulation,
  extractAuthorizationList,
  DUMMY_RELAYER,
  VALIDITY_SECONDS,
} from '../common/gasEngine.js';

const paymasterAccount = config.paymasterPrivateKey
  ? privateKeyToAccount(config.paymasterPrivateKey)
  : null;

export interface SignQuoteParams {
  commands: TransferCommand[];
  announcements: Announcement[];
  limits: GasLimits;
  /** User signature over the full bundle, proving the shard owner authorized this bundle. */
  userSignature: Hex;
  validUntil: bigint;
}

/**
 * Build the paymaster hash matching the contract's executeMesh step 3 (GhostRouter.sol:177-187).
 *
 * Solidity:
 *   keccak256(abi.encode(
 *     block.chainid,
 *     address(this),
 *     msg.sender,
 *     keccak256(abi.encode(commands)),
 *     keccak256(abi.encode(announcements)),
 *     validUntil,
 *     abi.encode(limits)
 *   ))
 *
 * msg.sender is the relayer address — the paymaster doesn't know it at quote time,
 * so we use a placeholder. The relayer will provide the actual msg.sender when
 * submitting; the contract recovers the paymaster from the signature regardless.
 */
export function buildPaymasterHash(
  chainId: bigint,
  routerAddress: Address,
  commands: TransferCommand[],
  announcements: Announcement[],
  validUntil: bigint,
  limits: GasLimits,
): Hex {

  // 1. Hash the entire commands array (Matches: keccak256(abi.encode(commands)))
  const commandsHash = keccak256(
    encodeAbiParameters(
      [{
        type: 'tuple[]',
        name: 'commands',
        components: [
          { name: 'shard', type: 'address' },
          { name: 'assetType', type: 'uint8' },
          { name: 'token', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'signature', type: 'bytes' },
          {
            name: 'authorization',
            type: 'tuple',
            components: [
              { name: 'targetAddress', type: 'address' },
              { name: 'chainId', type: 'uint32' }, // FIX: Strictly match Solidity uint32
              { name: 'nonce', type: 'uint32' },   // FIX: Strictly match Solidity uint32
              { name: 'yParity', type: 'uint8' },
              { name: 'r', type: 'bytes32' },
              { name: 's', type: 'bytes32' }
            ]
          }
        ]
      }] as const,
      [
        commands.map(c => ({
          shard: c.shard,
          assetType: Number(c.assetType), // FIX: Force Number casting to prevent JSON string coercion
          token: c.token,
          to: c.to,
          value: BigInt(c.value),
          signature: c.signature,
          authorization: {
            targetAddress: c.authorization.targetAddress,
            chainId: Number(c.authorization.chainId),
            nonce: Number(c.authorization.nonce),
            yParity: Number(c.authorization.yParity), // FIX: Force Number casting
            r: c.authorization.r,
            s: c.authorization.s,
          }
        }))
      ]
    )
  );

  // 2. Hash the entire announcements array (Matches: keccak256(abi.encode(announcements)))
  const announcementsHash = keccak256(
    encodeAbiParameters(
      [{
        type: 'tuple[]',
        name: 'announcements',
        components: [
          { name: 'schemeId', type: 'uint256' },
          { name: 'stealthAddress', type: 'address' },
          { name: 'ephemeralPubKey', type: 'bytes' },
          { name: 'metadata', type: 'bytes' }
        ]
      }] as const,
      [
        announcements.map(a => ({
          schemeId: BigInt(a.schemeId),
          stealthAddress: a.stealthAddress,
          ephemeralPubKey: a.ephemeralPubKey,
          metadata: a.metadata,
        }))
      ]
    )
  );

  const limitsHash = keccak256(
    encodeAbiParameters(
      [{
        type: 'tuple',
        name: 'limits',
        components: [
          { name: 'verificationGasLimit', type: 'uint32' },
          { name: 'callGasLimit', type: 'uint32' },
          { name: 'preVerificationGas', type: 'uint32' },
          { name: 'maxFeePerGas', type: 'uint256' }
        ]
      }] as const,
      [{
        verificationGasLimit: Number(limits.verificationGasLimit),
        callGasLimit: Number(limits.callGasLimit),
        preVerificationGas: Number(limits.preVerificationGas),
        maxFeePerGas: BigInt(limits.maxFeePerGas)
      }]
    )
  );

  // 4. Outer encoding wrapper matching the global payload layout
  // Refactored to explicit types to ensure strict BigInt/Hex casting
  const paramsEncoded = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'address' },
      { type: 'bytes32' },
      { type: 'bytes32' },
      { type: 'uint256' },
      { type: 'bytes32' }
    ] as const,
    [
      BigInt(chainId),
      routerAddress,
      commandsHash,
      announcementsHash,
      BigInt(validUntil),
      limitsHash
    ]
  );
  return keccak256(paramsEncoded);
}

/**
 * Build the user's bundle hash — the hash the user signs to authorize this bundle.
 * Covers commands + announcements + limits so the user explicitly commits to the
 * full set of inputs the paymaster will sponsor.
 *
 * Hash = keccak256(abi.encode(commands, announcements, limits))
 * with EIP-191 prefix applied by the user before signing.
 */
function buildUserBundleHash(
  commands: TransferCommand[],
  announcements: Announcement[],
): Hex {
  const commandsEncoded = encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        name: 'commands',
        components: [
          { name: 'shard', type: 'address' },
          { name: 'assetType', type: 'uint8' },
          { name: 'token', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'signature', type: 'bytes' },
          {
            name: 'authorization',
            type: 'tuple',
            components: [
              { name: 'targetAddress', type: 'address' },
              { name: 'chainId', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'yParity', type: 'uint8' },
              { name: 'r', type: 'bytes32' },
              { name: 's', type: 'bytes32' },
            ],
          },
        ],
      },
    ] as const,
    [
      commands.map((c) => ({
        shard: c.shard,
        assetType: Number(c.assetType),
        token: c.token,
        to: c.to,
        value: BigInt(c.value),
        signature: c.signature,
        authorization: {
          targetAddress: c.authorization.targetAddress,
          chainId: BigInt(c.authorization.chainId),
          nonce: BigInt(c.authorization.nonce),
          yParity: Number(c.authorization.yParity),
          r: c.authorization.r,
          s: c.authorization.s,
        },
      })),
    ],
  );

  const announcementsEncoded = encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        name: 'announcements',
        components: [
          { name: 'schemeId', type: 'uint256' },
          { name: 'stealthAddress', type: 'address' },
          { name: 'ephemeralPubKey', type: 'bytes' },
          { name: 'metadata', type: 'bytes' },
        ],
      },
    ] as const,
    [
      announcements.map((a) => ({
        schemeId: BigInt(a.schemeId),
        stealthAddress: a.stealthAddress,
        ephemeralPubKey: a.ephemeralPubKey,
        metadata: a.metadata,
      })),
    ],
  );

  const bundleEncoded = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes' }] as const,
    [commandsEncoded, announcementsEncoded],
  );

  const bundleHash = keccak256(bundleEncoded);
  return hashMessage({ raw: bundleHash });
}

/**
 * Build state override for simulation:
 * 1. Give a dummy relayer address enough ETH so the paymaster's gas checks don't revert.
 * 2. Mock EIP-7702 delegations by overriding the authorizing EOA's code with the delegation designator.
 */
function buildSimulationStateOverride(commands: TransferCommand[]): StateOverride {
  const dummyRelayer = DUMMY_RELAYER;

  const overrides: StateOverride = [
    {
      address: dummyRelayer,
      balance: 100_000_000_000_000_000_000n, // 100 ETH
    },
  ];

  const seenAuthorities = new Set<string>();

  for (const cmd of commands) {
    const authorityLower = cmd.shard.toLowerCase();
    if (seenAuthorities.has(authorityLower)) continue;
    seenAuthorities.add(authorityLower);

    const delegationBytecode = `0xef0100${cmd.authorization.targetAddress.slice(2).toLowerCase()}` as Hex;

    overrides.push({
      address: cmd.shard,
      code: delegationBytecode,
    });
  }

  return overrides;
}

/**
 * Sign a paymaster sponsorship quote.
 *
 * Flow:
 * 1. Verify user signature → recover user address → check against allowedUsers allowlist
 * 2. Build + sign paymaster hash
 * 3. Simulate via eth_call with balance override for a dummy relayer and mocked EIP-7702 code
 * 4. Return signed quote only if simulation succeeds
 */
export async function signQuote(
  params: SignQuoteParams,
): Promise<PaymasterQuoteResponse> {
  if (!paymasterAccount) {
    throw new AppError('Paymaster private key not configured', 500);
  }

  const chainId = BigInt(config.chain.id);
  const dummyRelayer = DUMMY_RELAYER;
  const validUntilBigInt = BigInt(params.validUntil);

  // --- Step 2: build + sign paymaster hash ---
  const paymasterHash = buildPaymasterHash(
    chainId,
    config.routerAddress,
    params.commands,
    params.announcements,
    validUntilBigInt,
    {
      verificationGasLimit: Number(params.limits.verificationGasLimit),
      callGasLimit: Number(params.limits.callGasLimit),
      preVerificationGas: Number(params.limits.preVerificationGas),
      maxFeePerGas: BigInt(params.limits.maxFeePerGas.toString()),
    },
  );

  const paymasterSignature = await paymasterAccount.signMessage({
    message: { raw: paymasterHash },
  });

  // --- Step 3: compile calldata ---
  const calldata = encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: 'executeMesh',
    args: [
      params.commands,
      params.announcements,
      paymasterAccount.address,
      validUntilBigInt,
      paymasterSignature,
      {
        verificationGasLimit: Number(params.limits.verificationGasLimit),
        callGasLimit: Number(params.limits.callGasLimit),
        preVerificationGas: Number(params.limits.preVerificationGas),
        maxFeePerGas: BigInt(params.limits.maxFeePerGas.toString()),
      },
    ],
  });

  // --- Step 3.5: Build identical state overrides ---
  const stateOverrideArray = buildSimulationStateOverride(params.commands);
  const stateOverride: RpcStateOverride = {};

  for (const override of stateOverrideArray) {
    stateOverride[override.address.toLowerCase() as Hex] = {
      ...(override.balance !== undefined && { balance: toHex(override.balance) }),
      ...(override.code !== undefined && { code: override.code }),
    };
  }

  const authorizationList = extractAuthorizationList(params.commands);

  let simulationResult: Hex;
  try {
    const response = await publicClient.call({
      type: 'eip7702',
      authorizationList,
      to: config.routerAddress,
      data: calldata,
      account: dummyRelayer,
      stateOverride: [
        {
          address: dummyRelayer,
          balance: 100_000_000_000_000_000_000n,
        },
      ],
    });

    simulationResult = (response as any).data ?? response;
  } catch (outerSimError: any) {
    const msg =
      outerSimError instanceof Error
        ? outerSimError.message
        : 'Outer simulation execution failed';
    simulationResult =
      outerSimError.data ??
      outerSimError.cause?.data ??
      outerSimError.walk?.()?.data;
    console.error(msg, simulationResult);
  }

  // --- Step 4: Decode and strictly parse address-based custom errors ---
  try {
    const decoded = decodeFunctionResult({
      abi: [...ROUTER_ABI, ...SHARD_ABI],
      functionName: 'executeMesh',
      data: simulationResult,
    }) as [bigint, bigint, bigint, bigint, boolean, string];

    const success = decoded[4];
    const revertReason = decoded[5] as Hex;

    if (!success) {
      let readableReason = 'Unknown Sandbox Revert';

      if (revertReason && revertReason !== '0x') {
        try {
          const decodedError = decodeErrorResult({
            abi: [...ROUTER_ABI, ...SHARD_ABI],
            data: revertReason,
          });

          const errorName = decodedError;
          const targetAddress = decodedError.args
            ? (decodedError.args as unknown as string)
            : null;

          readableReason = errorName
            ? `${JSON.stringify(errorName)} for address [${targetAddress}]`
            : errorName;
        } catch {
          readableReason = `Raw transaction failure hex: ${revertReason}`;
        }
      }

      throw new AppError(
        `Sandbox execution cell failed: ${readableReason}`,
        400,
      );
    }
  } catch (decodeError: unknown) {
    if (decodeError instanceof AppError) throw decodeError;
    throw new AppError(
      'Failed to parse or decode inner sandbox execution return metrics.' +
        decodeError,
      500,
    );
  }

  return {
    commands: params.commands,
    announcements: params.announcements,
    limits: params.limits,
    paymaster: paymasterAccount.address,
    validUntil: params.validUntil.toString(),
    paymasterSignature,
  };
}

interface EstimatedGasOutput {
  limits: {
    verificationGasLimit: number;
    callGasLimit: number;
    preVerificationGas: number;
    maxFeePerGas: bigint;
  };
  validUntil: bigint;
}

/**
 * Estimate gas limits using the Double Simulation engine.
 *
 * This function completely replaces the old off-chain heuristic math
 * (loop counters, precompile gas tables, hardcoded constants) with the
 * native node-level Double Simulation architecture from gasEngine.ts.
 *
 * Flow:
 * 1. Query network basefee
 * 2. Generate a valid paymaster signature for the simulation
 * 3. Delegate to estimateGasWithDoubleSimulation which runs eth_call
 *    and eth_estimateGas in parallel with identical state overrides
 * 4. Return the precisely calculated limits
 */
export async function estimateGasLimitsWithOverride(
  commands: TransferCommand[],
  announcements: Announcement[],
): Promise<EstimatedGasOutput> {
  if (!paymasterAccount) {
    throw new AppError('Paymaster private key not configured', 500);
  }

  // 1. Query network basefee properties
  const feeHistory = await publicClient.getFeeHistory({
    blockCount: 1,
    rewardPercentiles: [],
  });
  const baseFeePerGas = BigInt(feeHistory.baseFeePerGas[0]);
  const maxPriorityFeePerGas = 1500000000n; // 1.5 gwei inclusion cushion
  const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas;

  const chainId = BigInt(config.chain.id);
  const validUntil = BigInt(
    Math.floor(Date.now() / 1000) + VALIDITY_SECONDS,
  );

  // 2. Generate a valid paymaster signature for the simulation
  const simulationLimits: GasLimits = {
    verificationGasLimit: 1500000,
    callGasLimit: 15000000,
    preVerificationGas: 0, //Should be zero in other to calculate exact contract gas
    maxFeePerGas,
  };

  const paymasterHash = buildPaymasterHash(
    chainId,
    config.routerAddress,
    commands,
    announcements,
    validUntil,
    {
      verificationGasLimit: Number(simulationLimits.verificationGasLimit),
      callGasLimit: Number(simulationLimits.callGasLimit),
      preVerificationGas: Number(simulationLimits.preVerificationGas),
      maxFeePerGas: simulationLimits.maxFeePerGas,
    },
  );

  const paymasterSignature = await paymasterAccount.signMessage({
    message: { raw: paymasterHash },
  });

  // 3. Run the Double Simulation — this is the core replacement for all
  //    off-chain heuristic gas math
  const simResult = await estimateGasWithDoubleSimulation({
    commands,
    announcements,
    paymasterAddress: paymasterAccount.address,
    paymasterSignature,
    validUntil,
    maxFeePerGas,
    simulationLimits,
  });

  const limits = {
    verificationGasLimit: simResult.limits.verificationGasLimit,
    callGasLimit: simResult.limits.callGasLimit,
    preVerificationGas: simResult.limits.preVerificationGas,
    maxFeePerGas,
  };

  return { limits, validUntil };
}

export async function ensureUserAllowed(
  commands: TransferCommand[],
  announcements: Announcement[],
  userSignature: Hex,
): Promise<void> {
  // --- Step 1: verify user signature against allowlist ---
  const userBundleHash = buildUserBundleHash(commands, announcements);
  const recoveredUser = await recoverAddress({
    hash: userBundleHash,
    signature: userSignature,
  });

  const allowed = config.allowedUsers;

  if (allowed.length > 0 && !allowed.includes(recoveredUser.toLowerCase())) {
    throw new AppError(
      `User ${recoveredUser} is not in the paymaster allowlist`,
      403,
    );
  }
}
