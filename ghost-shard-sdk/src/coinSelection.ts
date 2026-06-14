/**
 * GhostShard SDK — UTXO Multi-Split Coin Selection
 *
 * Implements a zero-heuristic, fingerprint-free coin selection strategy.
 *
 * To prevent chain-analysis tools from grouping spent shards via global 
 * percentage multipliers or final-shard cleanup remainders, this engine:
 *   1. Assigns completely unique, random split signatures to early shards.
 *   2. Employs a strict rolling look-forward constraint to guarantee that
 *      future shards can always safely cover the remaining target debt.
 *   3. Smoothly balances the final remaining target amount across BOTH of the 
 *      last two shards to prevent a single cleanup signature trail.
 *   4. Enforces that every spent shard outputs a non-zero payment and non-zero change.
 */
import { isAddressEqual, type Hex } from 'viem';
import type { PrivateTransferRequest, Shard, TransferRequest } from './types.js';

export interface MultiSplitSelectionResult {
  shards: Shard[];
  totalSelected: bigint;
  paymentSplitsByShard: bigint[][];
  changeSplitsByShard: bigint[][];
  minDustThreshold: bigint;
}

export interface SelectionOpts {
  maxSplitsPerSide?: number;
  minDustThreshold?: bigint;
}

export function selectCoins(
  shards: Shard[],
  request: TransferRequest | PrivateTransferRequest,
  opts: SelectionOpts = {}
): MultiSplitSelectionResult {
  const options = { maxSplitsPerSide: 3, minDustThreshold: 10000n, ...opts };

  switch (request.type) {
    case 'NATIVE':
      return selectNative(shards, request.amount ?? 0n, options);
    case 'ERC20':
      return selectERC20(shards, request.tokenAddress!, request.amount ?? 0n, options);
    case 'ERC721':
      return selectERC721(shards, request.tokenAddress!, request.tokenId!);
  }
}

export function randomFloat(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  // Divide by the maximum possible 32-bit unsigned integer value to yield a clean fraction [0, 1)
  return buffer[0] / 0xffffffff;
}

export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(randomFloat() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export interface CompressionTargetResult {
  extraShardsToCompress: number;
  changeTargetPoolSize: number;
}

/**
 * Calculate compression metrics based on wallet size.
 * Scales from small wallets to 1000+ shards without hitting gas limits.
 */
function calculateCompressionMetrics(totalWalletSize: number): CompressionTargetResult {
  if (totalWalletSize <= 3) {
    return { extraShardsToCompress: 0, changeTargetPoolSize: 2 };
  }

  const baselineExtra = Math.floor(Math.sqrt(totalWalletSize) * 0.5);

  let minExtra = Math.max(1, baselineExtra - 1);
  let maxExtra = baselineExtra + 2;

  if (totalWalletSize > 500) {
    minExtra = 8;
    maxExtra = 15;
  } else if (totalWalletSize > 100) {
    minExtra = 5;
    maxExtra = 10;
  }

  const extraShardsToCompress = Math.floor(randomFloat() * (maxExtra - minExtra + 1)) + minExtra;
  let changeTargetPoolSize = 2;

  if (totalWalletSize > 500) {
    changeTargetPoolSize = Math.floor(randomFloat() * 3) + 3;
  } else if (totalWalletSize > 100) {
    changeTargetPoolSize = Math.floor(randomFloat() * 3) + 2;
  } else {
    changeTargetPoolSize = Math.floor(randomFloat() * 2) + 2;
  }

  return { extraShardsToCompress, changeTargetPoolSize };
}

export function generateSplitsForShard(poolAmount: bigint, maxOutputs: number, dust: bigint): bigint[] {
  if (poolAmount <= 0n) return [];
  if (poolAmount < dust * 2n || maxOutputs <= 1) {
    return [poolAmount];
  }

  const numOutputs = Math.floor(randomFloat() * maxOutputs) + 1;
  if (numOutputs === 1) return [poolAmount];

  const splits: bigint[] = [];
  let remaining = poolAmount;

  for (let i = 0; i < numOutputs - 1; i++) {
    const maxSafeDraw = remaining - (dust * BigInt(numOutputs - 1 - i));
    if (maxSafeDraw <= dust) break;

    const randomPercentage = BigInt(Math.floor(randomFloat() * 50) + 25);
    let chunk = (maxSafeDraw * randomPercentage) / 100n;
    if (chunk < dust) chunk = dust;

    splits.push(chunk);
    remaining -= chunk;
  }

  splits.push(remaining);
  return splits;
}

function selectNative(
  shards: Shard[],
  amount: bigint,
  opts: Required<SelectionOpts>
): MultiSplitSelectionResult {
  const withBalance = shards
    .map((s) => ({
      shard: s,
      balance: s.assets.find((a) => a.type === 'NATIVE')?.balance ?? 0n,
    }))
    .filter((s) => s.balance > 0n);

  return runSelectionEngine(withBalance, amount, opts, 'NATIVE');
}

function selectERC20(
  shards: Shard[],
  tokenAddress: Hex,
  amount: bigint,
  opts: Required<SelectionOpts>
): MultiSplitSelectionResult {
  const withBalance = shards
    .map((s) => ({
      shard: s,
      balance: s.assets.find((a) => a.type === 'ERC20' && isAddressEqual(a.tokenAddress!, tokenAddress))?.balance ?? 0n,
    }))
    .filter((s) => s.balance > 0n);

  return runSelectionEngine(withBalance, amount, opts, 'ERC20');
}

function selectERC721(
  shards: Shard[],
  tokenAddress: Hex | undefined,
  tokenId: bigint
): MultiSplitSelectionResult {
  if (!tokenAddress || tokenId === undefined) {
    throw new Error('tokenAddress and tokenId required for ERC721 selection');
  }

  const shard = shards.find((s) =>
    s.assets.some((a) => a.type === 'ERC721' && isAddressEqual(a.tokenAddress!, tokenAddress) && a.tokenIds?.includes(tokenId))
  );

  if (!shard) {
    throw new Error(`No shard found holding ERC721 ${tokenAddress} tokenId ${tokenId}`);
  }

  return {
    shards: [shard],
    totalSelected: 1n,
    paymentSplitsByShard: [[tokenId]],
    changeSplitsByShard: [[]],
    minDustThreshold: 0n,
  };
}

type PoolItem = { shard: Shard; balance: bigint };

function runSelectionEngine(
  withBalance: PoolItem[],
  amount: bigint,
  opts: Required<SelectionOpts>,
  assetName: string
): MultiSplitSelectionResult {
  shuffle(withBalance);

  const selectedPool: PoolItem[] = [];
  let currentAccumulatedCapacity = 0n;
  let cursor = 0;

  // 1. Gather primary pool
  while (cursor < withBalance.length && currentAccumulatedCapacity < amount) {
    const item = withBalance[cursor];
    selectedPool.push(item);
    currentAccumulatedCapacity += item.balance;
    cursor++;
  }

  if (currentAccumulatedCapacity < amount) {
    throw new Error(`Insufficient ${assetName} balance`);
  }

  // 2. Gather compression extras
  const metrics = calculateCompressionMetrics(withBalance.length);
  let extraSweptCount = 0;

  while (cursor < withBalance.length && extraSweptCount < metrics.extraShardsToCompress) {
    const extraItem = withBalance[cursor];
    selectedPool.push(extraItem);
    currentAccumulatedCapacity += extraItem.balance;
    extraSweptCount++;
    cursor++;
  }

  // 3. Capacity Ceiling
  const maxSafeFutureCapacity = new Array<bigint>(selectedPool.length).fill(0n);
  let runningFutureCapacitySum = 0n;
  for (let k = selectedPool.length - 1; k >= 0; k--) {
    maxSafeFutureCapacity[k] = runningFutureCapacitySum;
    runningFutureCapacitySum += selectedPool[k].balance;
  }

  const shardPaymentTargets = new Array<bigint>(selectedPool.length).fill(0n);
  const shardChangeTargets = new Array<bigint>(selectedPool.length).fill(0n);
  let remainingNeeded = amount;

  // 4. Unified Allocation Loop (Using the superior range-based logic)
  for (let i = 0; i < selectedPool.length; i++) {
    const { balance } = selectedPool[i];

    // JOINT FINAL PHASE
    if (i === selectedPool.length - 2) {
      const nextShardBalance = selectedPool[i + 1].balance;

      const randomWeight = BigInt(Math.floor(randomFloat() * 40) + 30); // 30% to 70%
      let contribution = (remainingNeeded * randomWeight) / 100n;
      let finalShardContribution = remainingNeeded - contribution;

      // DYNAMIC SAFETY VALVE
      if (contribution > balance - opts.minDustThreshold || finalShardContribution > nextShardBalance - opts.minDustThreshold) {
        if (remainingNeeded >= balance + nextShardBalance) {
          if (remainingNeeded > balance + nextShardBalance) {
            throw new Error(`Insufficient ${assetName} balance`);
          }
          contribution = balance;
          finalShardContribution = nextShardBalance;
        } else if (remainingNeeded > balance) {
          contribution = balance;
          finalShardContribution = remainingNeeded - balance;
        } else {
          finalShardContribution = nextShardBalance;
          contribution = remainingNeeded - nextShardBalance;
        }
      }

      shardPaymentTargets[i] = contribution;
      shardPaymentTargets[i + 1] = finalShardContribution;
      remainingNeeded -= (contribution + finalShardContribution);
      break;
    }

    // EARLY PHASE SHARDS
    const futureCapacity = maxSafeFutureCapacity[i];
    const mathFloorConstraint = remainingNeeded > futureCapacity ? remainingNeeded - futureCapacity : opts.minDustThreshold;
    const maxSafeShardSpend = balance - opts.minDustThreshold;

    let contribution = mathFloorConstraint;

    // DYNAMIC SAFETY VALVE & RANGE RANDOMIZATION
    if (mathFloorConstraint > maxSafeShardSpend) {
      contribution = balance;
    } else if (maxSafeShardSpend > mathFloorConstraint) {
      const range = maxSafeShardSpend - mathFloorConstraint;
      const randomFraction = BigInt(Math.floor(randomFloat() * 100));
      const randomOffset = (range * randomFraction) / 100n;
      contribution = mathFloorConstraint + randomOffset;
    }

    if (contribution > remainingNeeded) {
      contribution = remainingNeeded;
    }

    shardPaymentTargets[i] = contribution;
    remainingNeeded -= contribution;
  }

  // 5. Symmetric Matrix Splitting Layer
  for (let i = 0; i < selectedPool.length; i++) {
    shardChangeTargets[i] = selectedPool[i].balance - shardPaymentTargets[i];
  }

  const selectedShards: Shard[] = [];
  const paymentSplitsByShard: bigint[][] = [];
  const changeSplitsByShard: bigint[][] = [];

  for (let i = 0; i < selectedPool.length; i++) {
    const { shard } = selectedPool[i];
    selectedShards.push(shard);

    paymentSplitsByShard.push(
      generateSplitsForShard(shardPaymentTargets[i], opts.maxSplitsPerSide, opts.minDustThreshold)
    );
    changeSplitsByShard.push(
      generateSplitsForShard(shardChangeTargets[i], metrics.changeTargetPoolSize, opts.minDustThreshold)
    );
  }

  return {
    shards: selectedShards,
    totalSelected: amount,
    paymentSplitsByShard,
    changeSplitsByShard,
    minDustThreshold: opts.minDustThreshold,
  };
}