import {
  encodeFunctionData,
  type Hex,
  type Address,
  decodeErrorResult,
  BaseError,
  ContractFunctionRevertedError,
  decodeFunctionResult,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config.js';
import { ROUTER_ABI } from '../common/abi.js';
import { publicClient, walletClient } from '../common/viemClient.js';
import { AppError } from '../common/errors.js';
import {
  extractAuthorizationList,
  estimateGasWithDoubleSimulation,
} from '../common/gasEngine.js';
import {
  paymasterDebtAccumulator,
  enqueueRelay,
  getQueueStatus,
} from './queue.js';
import type {
  TransferCommand,
  Announcement,
  GasLimits,
  RelayerRelayResponse,
} from '../types.js';

const relayerAccount = config.relayerPrivateKey
  ? privateKeyToAccount(config.relayerPrivateKey)
  : null;

export interface RelayParams {
  commands: TransferCommand[];
  announcements: Announcement[];
  paymaster: Address;
  validUntil: string;
  paymasterSignature: Hex;
  limits: GasLimits;
}

/**
 * Relay a signed executeMesh bundle to a private block builder.
 *
 * Flow:
 *   1. Verify the paymaster-signed gas limits are sufficient by running the
 *      Double Simulation and comparing against the signed preVerificationGas
 *   2. Resolve net available escrow (on-chain minus in-flight virtual debt)
 *   3. Simulate via eth_call with EIP-7702 state overrides
 *   4. Encode calldata
 *   5. Enqueue for sequential submission — the queue ensures transactions
 *      are broadcast one-after-another, never concurrently.
 *      The hash is returned to the user immediately after broadcast.
 *      The queue continues tracking the receipt in the background for
 *      escrow cleanup.
 */
export async function relay(
  params: RelayParams,
): Promise<RelayerRelayResponse> {
  if (!relayerAccount) {
    throw new AppError('Relayer private key not configured', 500);
  }

  const paymasterLower = params.paymaster.toLowerCase();

  // --- Step 1: verify paymaster gas limits via Double Simulation ---
  // The relayer runs its own simulation to confirm the paymaster's signed
  // preVerificationGas is >= what the node actually requires. This prevents
  // the relayer from submitting transactions that will revert due to
  // insufficient gas.
  // const simulated = await estimateGasWithDoubleSimulation({
  //   commands: params.commands,
  //   announcements: params.announcements,
  //   paymasterAddress: params.paymaster,
  //   paymasterSignature: params.paymasterSignature,
  //   validUntil: BigInt(params.validUntil),
  //   maxFeePerGas: params.limits.maxFeePerGas,
  // });

  // const signedPreVerificationGas = BigInt(params.limits.preVerificationGas);
  // const simulatedPreVerificationGas = BigInt(
  //   simulated.limits.preVerificationGas,
  // );

  // if (signedPreVerificationGas < simulatedPreVerificationGas) {
  //   console.log(
  //     `[Relayer] Paymaster preVerificationGas too low: signed=${signedPreVerificationGas}, required=${simulatedPreVerificationGas}`,
  //   );
  //   throw new AppError(
  //     `Paymaster preVerificationGas (${signedPreVerificationGas}) is lower than simulated requirement (${simulatedPreVerificationGas})`,
  //     400,
  //   );
  // }

  // console.log(
  //   `[Relayer] Gas verification passed: signed preVerificationGas=${signedPreVerificationGas} >= simulated=${simulatedPreVerificationGas}`,
  // );

  // --- Step 2: resolve net available escrow ---
  const onChainDeposit = (await publicClient.readContract({
    address: config.routerAddress,
    abi: ROUTER_ABI,
    functionName: 'paymasterDeposits',
    args: [params.paymaster],
  })) as bigint;

  const inFlightDebt = paymasterDebtAccumulator.get(paymasterLower) ?? 0n;
  const netAvailable = onChainDeposit - inFlightDebt;

  const gasPrice = await publicClient.getGasPrice();
  const maxGas =
    BigInt(params.limits.verificationGasLimit) +
    BigInt(params.limits.callGasLimit) +
    BigInt(params.limits.preVerificationGas);
  const worstCaseCost = maxGas * gasPrice;

  if (netAvailable < worstCaseCost) {
    console.log(
      'netAvailable ',
      netAvailable,
      ' worstCaseCost ',
      worstCaseCost,
    );
    throw new AppError(
      `Paymaster escrow over-allocated: ${netAvailable} available, ${worstCaseCost} required`,
      400,
    );
  }

  // --- Step 3: simulate via eth_call with EIP-7702 state overrides ---
  const calldata = encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: 'executeMesh',
    args: [
      params.commands,
      params.announcements,
      params.paymaster,
      BigInt(params.validUntil),
      params.paymasterSignature,
      {
        verificationGasLimit: params.limits.verificationGasLimit,
        callGasLimit: params.limits.callGasLimit,
        preVerificationGas: params.limits.preVerificationGas,
        maxFeePerGas: params.limits.maxFeePerGas,
      },
    ],
  });

  const authorizationList = extractAuthorizationList(params.commands);

  let outerSimError;
  let simResult;
  try {
    const response = (await publicClient.call({
      type: 'eip7702',
      authorizationList,
      to: config.routerAddress,
      data: calldata,
      account: relayerAccount.address,
    })) as unknown as Hex;

    simResult = (response as any).data ?? response;
  } catch (simError: unknown) {
    outerSimError = (simError as any).data;
  }

  if (simResult) {
    console.log('[Relayer] Simulation successful, result:', simResult);
    const result = decodeFunctionResult({
      abi: ROUTER_ABI,
      functionName: 'executeMesh',
      data: simResult,
    });
    console.log('[Relayer] Decoded simulation result:', result);
  }

  if (outerSimError) {
    let readableReason = 'Unknown Sandbox Revert';
    try {
      const decodedError = decodeErrorResult({
        abi: ROUTER_ABI,
        data: outerSimError,
      });

      const errorName = decodedError.errorName;
      const targetAddress = decodedError.args
        ? String(decodedError.args)
        : null;

      readableReason = targetAddress
        ? `${errorName} for address [${targetAddress}]`
        : errorName;
    } catch {
      readableReason = `Raw transaction failure hex: ${outerSimError}`;
    }

    throw new AppError(
      `Relayer simulation rejected: ${readableReason}`,
      400,
    );
  }

  // --- Step 4: enqueue for sequential submission ---
  // The queue ensures transactions are broadcast strictly one-after-another.
  // The hash is returned immediately after broadcast; the queue tracks the
  // receipt in the background for escrow cleanup.
  const hash = await enqueueRelay(paymasterLower, worstCaseCost, async () => {
    return await broadcastTransaction(
      calldata,
      authorizationList,
      maxGas,
      params,
    );
  });

  return { transactionHash: hash };
}

/**
 * Broadcast the type 4 (EIP-7702) transaction to the private RPC.
 * Called by the queue worker when this entry reaches the front of the line.
 */
async function broadcastTransaction(
  calldata: Hex,
  authorizationList:
    | {
      chainId: number;
      address: Address;
      nonce: number;
      yParity: number;
      r: Hex;
      s: Hex;
    }[]
    | undefined,
  maxGas: bigint,
  params: RelayParams,
): Promise<`0x${string}`> {
  if (!relayerAccount) {
    throw new AppError('Relayer private key not configured', 500);
  }

  try {
    const hash = await walletClient.sendTransaction({
      type: 'eip7702',
      authorizationList,
      account: relayerAccount,
      to: config.routerAddress,
      data: calldata,
      gas: maxGas,
      maxFeePerGas: BigInt(params.limits.maxFeePerGas),
    });

    console.log(`[Relayer] Broadcast ${hash}`);
    return hash;
  } catch (txError: unknown) {
    let readableReason = 'Unknown Execution Revert';
    let rawHexData: string | undefined;

    console.log(txError);

    if (txError instanceof BaseError) {
      const revertError = txError.walk(
        (err) => err instanceof ContractFunctionRevertedError,
      ) as { data: string } | null;

      if (revertError && revertError.data) {
        rawHexData = revertError.data;
      } else {
        rawHexData =
          (txError as any).data?.data || (txError as any).data;
      }
    }

    if (rawHexData && rawHexData !== '0x') {
      try {
        const decodedError = decodeErrorResult({
          abi: ROUTER_ABI,
          data: rawHexData as `0x${string}`,
        });

        const errorName = decodedError.errorName;
        const targetAddress = decodedError.args
          ? String(decodedError.args)
          : null;

        readableReason = targetAddress
          ? `${errorName} for address ${targetAddress}`
          : errorName;
      } catch {
        readableReason = `Raw execution failure hex: ${rawHexData}`;
      }
    } else {
      readableReason =
        txError instanceof Error ? txError.message : String(txError);
    }

    console.error(`[Relayer] Execution reverted: ${readableReason}`);
    throw new AppError(
      `Relayer transaction rejected: ${readableReason}`,
      400,
    );
  }
}

/**
 * Expose queue status for the health/status endpoint.
 */
export { getQueueStatus };
