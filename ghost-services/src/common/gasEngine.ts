import {
  encodeFunctionData,
  toHex,
  decodeFunctionResult,
  decodeErrorResult,
  type Address,
  type Hex,
  type RpcStateOverride,
  keccak256,
  encodeAbiParameters,
  StateOverride,
} from 'viem';
import { config } from '../config.js';
import { ROUTER_ABI, SHARD_ABI } from './abi.js';
import { publicClient } from './viemClient.js';
import { AppError } from './errors.js';
import type { TransferCommand, Announcement, GasLimits } from '../types.js';

/** Validity window (seconds) for paymaster signatures — used for the validUntil timestamp in simulations. */
export const VALIDITY_SECONDS = 300;

/**
 * Double Simulation Gas Engine
 *
 * Replaces all off-chain heuristic gas math with a native node-level
 * "Double Simulation" architecture. Runs eth_call and eth_estimateGas
 * in parallel against the exact same state overrides, then subtracts
 * the results to isolate each gas layer precisely.
 *
 * SIMULATION 1 — eth_call:  Isolates pure EVM execution metrics natively
 *   from the contract. The updated GhostRouter.sol executeMesh returns a
 *   tuple (totalGasUsed, innerCallGasUsed, …) that we decode to get the
 *   exact gas the contract itself consumed.
 *
 * SIMULATION 2 — eth_estimateGas: Captures L1 rollup fees, the EIP-7702
 *   authorization payload, and calldata compression in a single node-level
 *   estimate. This is the "total" gas the node sees including all L2
 *   transport costs.
 *
 * The subtraction between the two isolates:
 *   • Pre-verification gas  = L1 data fee + 7702 payload (total − contract)
 *   • Verification gas      = signature checks + extcodecopy (contract − inner)
 *   • Call gas              = sandbox execution (inner + cushion)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Dummy relayer address used for simulation — never needs real ETH */
export const DUMMY_RELAYER = '0x0000000000000000000000000000000003300001' as Address;

/** 25M gas ceiling passed to both simulations so the node never runs out */
const SIMULATION_GAS_CAP = 25_000_000n;

/** Fallback floor for pre-verification gas when subtraction underflows */
const PRE_VERIFICATION_FLOOR = 21_000n;

/** Safety buffer applied to the verification gas layer (15 %) */
const VERIFICATION_BUFFER_NUM = 115n;
const VERIFICATION_BUFFER_DEN = 100n;

/** Dynamic cushion applied to the inner call gas (30 %) */
const CALL_CUSHION_NUM = 130n;
const CALL_CUSHION_DEN = 100n;

/** Flat buffer for cold SSTORE operations under the EIP-150 63/64 rule */
const COLD_STORAGE_BUFFER = 40_000n;

// ---------------------------------------------------------------------------
// State override builder
// ---------------------------------------------------------------------------

/**
 * Build the RpcStateOverride map required by both simulations.
 *
 * 1. Gives the dummy relayer enough ETH so the paymaster's gas checks
 *    don't revert.
 * 2. Injects EIP-7702 delegation bytecode (0xef0100 || target) for each
 *    unique shard so the EVM treats them as smart-contract shards.
 * 3. Seeds the paymaster's deposit storage slot so the upfront
 *    requiredPrefund check passes.
 */
export function buildSimulationStateOverride(
  commands: TransferCommand[],
  paymasterAddress: Address,
): StateOverride {
  // Use a Map to accumulate overrides by address before converting to Viem's required Array
  const overrideMap = new Map<Address, NonNullable<StateOverride[number]>>();

  // Helper to retrieve or initialize an override object for a given address
  const getOverride = (address: string) => {
    const lowerAddress = address.toLowerCase() as Address;
    if (!overrideMap.has(lowerAddress)) {
      overrideMap.set(lowerAddress, { address: lowerAddress });
    }
    return overrideMap.get(lowerAddress)!;
  };

  // 1. Dummy relayer balance
  // Note: Viem accepts bigint directly for balances. No `toHex` needed here.
  getOverride(DUMMY_RELAYER).balance = 100_000_000_000_000_000_000n; // 100 ETH

  // 2. EIP-7702 delegation bytecodes
  const seenAuthorities = new Set<string>();
  for (const cmd of commands) {
    const authorityLower = cmd.shard.toLowerCase();
    if (seenAuthorities.has(authorityLower)) continue;
    seenAuthorities.add(authorityLower);

    const delegationBytecode =
      `0xef0100${cmd.authorization.targetAddress.slice(2).toLowerCase()}` as Hex;

    getOverride(authorityLower).code = delegationBytecode;
  }

  // 3. Paymaster deposit storage slot
  const PAYMASTER_DEPOSITS_SLOT = 0n;
  const storageSlotKey = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [paymasterAddress, PAYMASTER_DEPOSITS_SLOT],
    ),
  );

  const routerOverride = getOverride(config.routerAddress);

  // Note: Viem uses an array of { slot, value } for state/stateDiff mappings
  routerOverride.stateDiff = routerOverride.stateDiff ?? [];
  routerOverride.stateDiff.push({
    slot: storageSlotKey,
    value: toHex(1000n * 10n ** 18n, { size: 32 }), // 1000 ETH slot value
  });

  // Convert the map to the viem StateOverride array
  return Array.from(overrideMap.values());
}

// ---------------------------------------------------------------------------
// Authorization list extractor
// ---------------------------------------------------------------------------

/**
 * Extract the EIP-7702 authorization list from commands.
 * Deduplicates by shard address — only one authorization per shard is needed.
 */
export function extractAuthorizationList(
  commands: TransferCommand[],
): {
  chainId: number;
  address: Address;
  nonce: number;
  yParity: number;
  r: Hex;
  s: Hex;
}[] | undefined {
  if (commands.length === 0) return undefined;

  const seen = new Set<string>();
  const auths: {
    chainId: number;
    address: Address;
    nonce: number;
    yParity: number;
    r: Hex;
    s: Hex;
  }[] = [];

  for (const cmd of commands) {
    const shardLower = cmd.shard.toLowerCase();
    if (seen.has(shardLower)) continue;
    seen.add(shardLower);

    auths.push({
      chainId: cmd.authorization.chainId,
      address: cmd.authorization.targetAddress,
      nonce: cmd.authorization.nonce,
      yParity: cmd.authorization.yParity,
      r: cmd.authorization.r,
      s: cmd.authorization.s,
    });
  }

  return auths.length > 0 ? auths : undefined;
}

// ---------------------------------------------------------------------------
// Double Simulation — the core gas engine
// ---------------------------------------------------------------------------

export interface DoubleSimulationResult {
  limits: GasLimits;
  validUntil: bigint;
}

/**
 * Run the Double Simulation and return precise gas limits.
 *
 * This is the single entry point for all gas estimation in the merged
 * Ghost Services service. It completely replaces the old heuristic math
 * (loop counters, precompile gas tables, hardcoded constants) with
 * native node-level simulation results.
 */
export async function estimateGasWithDoubleSimulation(params: {
  commands: TransferCommand[];
  announcements: Announcement[];
  paymasterAddress: Address;
  paymasterSignature: Hex;
  validUntil: bigint;
  maxFeePerGas: bigint;
  simulationLimits: GasLimits;
}, isRelayer = false): Promise<DoubleSimulationResult> {
  const {
    commands,
    announcements,
    paymasterAddress,
    paymasterSignature,
    validUntil,
    maxFeePerGas,
    simulationLimits,
  } = params;

  // --- Build calldata + state overrides (shared by both simulations) ---
  const txData = encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: 'executeMesh',
    args: [
      commands,
      announcements,
      paymasterAddress,
      validUntil,
      paymasterSignature,
      {
      verificationGasLimit: Number(simulationLimits.verificationGasLimit),
      callGasLimit: Number(simulationLimits.callGasLimit),
      preVerificationGas: Number(simulationLimits.preVerificationGas),
      maxFeePerGas: simulationLimits.maxFeePerGas,
    },
    ],
  });

  const stateOverride = buildSimulationStateOverride(commands, paymasterAddress);
  const authorizationList = extractAuthorizationList(commands);

  // -----------------------------------------------------------------------
  // PARALLEL SIMULATION
  // -----------------------------------------------------------------------

  // SIMULATION 1: Native Call — isolates pure EVM execution metrics natively
  // from the contract. Returns an object where the hex return is in the `.data` property.
  const callPromise = publicClient.call({
    account: DUMMY_RELAYER,
    to: config.routerAddress,
    data: txData,
    gas: SIMULATION_GAS_CAP,
    stateOverride
  });

  // SIMULATION 2: Native estimateGas — captures L1 rollup fees, the 7702
  // payload, and calldata compression in a single node-level estimate.
  // Viem's estimateGas natively returns a BigInt.
  const estimatePromise = publicClient.estimateGas({
    type: 'eip7702',
    account: DUMMY_RELAYER,
    to: config.routerAddress,
    data: txData,
    gas: SIMULATION_GAS_CAP,
    authorizationList,
  });

  let callResponse: Awaited<ReturnType<typeof publicClient.call>>;
  let totalNodeEstimatedGas: bigint;

  try {
    [callResponse, totalNodeEstimatedGas] = await Promise.all([
      callPromise,
      estimatePromise,
    ]);
  } catch (simErr: unknown) {
    // One or both simulations reverted. Try to decode the revert reason
    // from viem's error payload so we can return a meaningful message.
    const rawData =
      (simErr as any)?.data ??
      (simErr as any)?.cause?.data ??
      (simErr as any)?.walk?.()?.data;

    if (rawData && typeof rawData === 'string' && rawData !== '0x') {
      try {
        const decoded = decodeErrorResult({ abi: [...ROUTER_ABI, ...SHARD_ABI], data: rawData as unknown as Hex });
        throw new AppError(
          `Double Simulation reverted: ${decoded.errorName}${decoded.args ? ` — ${String(decoded.args)}` : ''}`,
          400,
        );
      } catch {
        // decodeErrorResult itself threw — fall through to raw hex
        throw new AppError(
          `Double Simulation reverted with raw data: ${rawData}`,
          400,
        );
      }
    }

    // No decodable data — return the original error message
    const msg =
      simErr instanceof Error ? simErr.message : 'Double Simulation failed';
    throw new AppError(msg, 400);
  }

  // -----------------------------------------------------------------------
  // DECODE the eth_call result
  // -----------------------------------------------------------------------
  // Extract the returned hex data. Viem's `call` returns `{ data: Hex }`
  const dataToDecode =
    typeof callResponse === 'string' ? callResponse : callResponse.data;

  if (!dataToDecode) {
    throw new AppError('Double Simulation: eth_call returned empty data', 400);
  }

  // GhostRouter.sol executeMesh returns:
  //   (uint256 totalGasUsed, uint256 gasCost, uint256 innerCallGasUsed,
  //    uint256 postOverhead, bool success, bytes revertReason)
  const decodedSim = decodeFunctionResult({
    abi: ROUTER_ABI,
    functionName: 'executeMesh',
    data: dataToDecode,
  }) as [bigint, bigint, bigint, bigint, boolean, string];

  const [
    exactContractExecutionGas,
    ,
    exactInnerCallGas,
    ,
    success,
    revertReason,
  ] = decodedSim;

  if (!success) {
    throw new AppError(
      `Double Simulation: sandbox execution reverted — ${revertReason || 'unknown'}`,
      400,
    );
  }

  // -----------------------------------------------------------------------
  // GAS SUBTRACTION MATH (strict adherence required)
  // -----------------------------------------------------------------------

  // 1. PRE-VERIFICATION GAS (The L2 Transport Layer)
  //    Total Node Estimate minus Pure Contract Execution isolates the
  //    L1 data fee and the 7702 payload.
  const calculatedPreVerificationGas =
    totalNodeEstimatedGas > exactContractExecutionGas
      ? totalNodeEstimatedGas - exactContractExecutionGas
      : PRE_VERIFICATION_FLOOR;

  // 2. VERIFICATION GAS LIMIT (The Parsing Layer)
  //    Pure Contract Execution minus the Sandbox Execution isolates
  //    signature checks and 7702 extcodecopies.
  const pureVerificationGas = exactContractExecutionGas - exactInnerCallGas;
  const calculatedVerificationGasLimit =
    (pureVerificationGas * VERIFICATION_BUFFER_NUM) / VERIFICATION_BUFFER_DEN;

  // 3. CALL GAS LIMIT (The Sandbox Execution Layer)
  const dynamicCushion =
    (exactInnerCallGas * CALL_CUSHION_NUM) / CALL_CUSHION_DEN;
  const calculatedCallGasLimit = dynamicCushion + COLD_STORAGE_BUFFER;

  // -----------------------------------------------------------------------
  // Assemble the final limits
  // -----------------------------------------------------------------------
  const limits: GasLimits = {
    verificationGasLimit: Number(calculatedVerificationGasLimit),
    callGasLimit: Number(
      calculatedCallGasLimit > 0n ? calculatedCallGasLimit : 30000n,
    ),
    preVerificationGas: Number(calculatedPreVerificationGas),
    maxFeePerGas,
  };

  const validUntilBigInt = BigInt(Math.floor(Date.now() / 1000) + VALIDITY_SECONDS);

  return { limits, validUntil: validUntilBigInt };
}
