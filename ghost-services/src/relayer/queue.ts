import { type Hex } from 'viem';
import { publicClient } from '../common/viemClient.js';
import type { InFlightLock } from '../types.js';

/**
 * Transaction Queue — serializes all relay submissions one-after-another.
 *
 * Transactions are enqueued and broadcast strictly in FIFO order. The queue
 * resolves each entry with the transaction hash immediately after the
 * broadcast succeeds — the caller (HTTP handler) returns the hash to the user
 * without waiting for on-chain confirmation.
 *
 * Receipt tracking is fully decoupled from the broadcast pipeline. Each
 * confirmed/failed transaction spawns an independent background watcher that
 * polls for the receipt and releases the paymaster escrow lock. The next
 * queued entry is dequeued immediately after the current broadcast resolves —
 * it does NOT wait for the receipt.
 *
 * The queue maintains paymaster escrow accounting (in-flight debt accumulator)
 * so that the relayer never over-commits a paymaster's deposit across pending
 * transactions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueuedRelay {
  id: string;
  paymaster: string;
  allocatedCost: bigint;
  txHash: Hex | null;
  status: 'pending' | 'submitting' | 'submitted' | 'confirmed' | 'failed';
  queuedAt: number;
  submittedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Paymaster escrow accounting
// ---------------------------------------------------------------------------

export const activeInFlight = new Map<string, InFlightLock>();
export const paymasterDebtAccumulator = new Map<string, bigint>();

/** Recalculate a paymaster's total virtual debt across all in-flight txs. */
export function updatePaymasterDebt(paymaster: string): void {
  let debt = 0n;
  for (const lock of activeInFlight.values()) {
    if (lock.paymaster === paymaster) debt += lock.allocatedCost;
  }
  paymasterDebtAccumulator.set(paymaster, debt);
}

/** Register a new in-flight transaction lock. */
export function registerLock(txHash: string, paymaster: string, cost: bigint): void {
  activeInFlight.set(txHash.toLowerCase(), {
    paymaster: paymaster.toLowerCase(),
    allocatedCost: cost,
    timestamp: Date.now(),
  });
  updatePaymasterDebt(paymaster.toLowerCase());
}

/** Release a lock once the transaction confirms or times out. */
export function releaseLock(txHash: string, paymaster: string): void {
  activeInFlight.delete(txHash.toLowerCase());
  updatePaymasterDebt(paymaster.toLowerCase());
}

// ---------------------------------------------------------------------------
// Transaction Queue
// ---------------------------------------------------------------------------

type QueueEntry = {
  relay: QueuedRelay;
  execute: () => Promise<Hex>;
  resolve: (hash: Hex) => void;
  reject: (err: Error) => void;
};

const queue: QueueEntry[] = [];
let processing = false;

/** Currently processing entry (the one being broadcast right now). */
let currentEntry: QueueEntry | null = null;

/**
 * Get a snapshot of the current queue state for health checks.
 */
export function getQueueStatus(): {
  queueLength: number;
  processing: boolean;
  current: QueuedRelay | null;
  pending: QueuedRelay[];
} {
  return {
    queueLength: queue.length,
    processing,
    current: currentEntry?.relay ?? null,
    pending: queue.map((e) => e.relay),
  };
}

/**
 * Enqueue a relay transaction for sequential submission.
 *
 * Returns a promise that resolves with the transaction hash as soon as the
 * entry reaches the front of the queue and the broadcast succeeds. The caller
 * returns this hash to the user immediately.
 *
 * Receipt tracking happens in a fully decoupled background task — the next
 * entry is dequeued immediately after broadcast, not after confirmation.
 *
 * @param paymaster  - Paymaster address (for escrow accounting)
 * @param cost       - Worst-case gas cost (for escrow accounting)
 * @param execute    - Async function that performs the actual on-chain broadcast
 */
export function enqueueRelay(
  paymaster: string,
  cost: bigint,
  execute: () => Promise<Hex>,
): Promise<Hex> {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  const relay: QueuedRelay = {
    id,
    paymaster: paymaster.toLowerCase(),
    allocatedCost: cost,
    txHash: null,
    status: 'pending',
    queuedAt: Date.now(),
    submittedAt: null,
    completedAt: null,
    error: null,
  };

  return new Promise<Hex>((resolve, reject) => {
    queue.push({ relay, execute, resolve, reject });
    processQueue();
  });
}

/**
 * Process the queue — one entry at a time.
 *
 * Each entry is dequeued and broadcast. On success:
 *   1. Register the in-flight escrow lock
 *   2. Resolve immediately with the hash (user gets it back)
 *   3. Spawn a background receipt watcher (fire-and-forget)
 *   4. Immediately dequeue the next entry
 *
 * On failure:
 *   1. Mark as failed, reject the promise
 *   2. Immediately dequeue the next entry (no retry)
 *
 * Receipt tracking is fully decoupled — the while loop does NOT await it.
 */
async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const entry = queue.shift()!;
    currentEntry = entry;
    entry.relay.status = 'submitting';

    try {
      const hash = await entry.execute();

      // Record the hash and resolve immediately
      entry.relay.txHash = hash;
      entry.relay.status = 'submitted';
      entry.relay.submittedAt = Date.now();

      // Register the in-flight lock for escrow accounting
      registerLock(hash, entry.relay.paymaster, entry.relay.allocatedCost);

      // Resolve immediately — HTTP handler returns hash to user
      entry.resolve(hash);

      // Spawn background receipt watcher — fully decoupled from the queue.
      // The next iteration of this while loop runs immediately, not after
      // the receipt is confirmed.
      trackReceiptInBackground(hash, entry.relay);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.relay.status = 'failed';
      entry.relay.completedAt = Date.now();
      entry.relay.error = msg;

      // No txHash was produced, so no escrow lock was registered.
      // Reject immediately — the next entry will be dequeued on the
      // next loop iteration.
      entry.reject(err instanceof Error ? err : new Error(msg));
    }

    currentEntry = null;
  }

  processing = false;
}

/**
 * Background receipt tracker — fully decoupled from the broadcast queue.
 *
 * This runs as a fire-and-forget task. It polls for the receipt and releases
 * the paymaster escrow lock once confirmed or timed out. The queue does NOT
 * await this — it moves to the next entry immediately after broadcasting.
 */
function trackReceiptInBackground(hash: Hex, relay: QueuedRelay): void {
  const timeoutMs = 120_000;
  const start = Date.now();

  const poll = async () => {
    while (Date.now() - start < timeoutMs) {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash });
        if (receipt) {
          relay.status = 'confirmed';
          relay.completedAt = Date.now();
          console.log(
            `[Queue] Confirmed ${hash} in block ${receipt.blockNumber}`,
          );
          releaseLock(hash, relay.paymaster);
          return;
        }
      } catch {
        // Not yet mined — keep polling
      }
      await new Promise((r) => setTimeout(r, 4000));
    }

    // Timeout — release the lock anyway so escrow isn't permanently stuck
    console.warn(
      `[Queue] Timeout waiting for receipt of ${hash} after ${timeoutMs}ms — releasing lock`,
    );
    relay.status = 'confirmed';
    relay.completedAt = Date.now();
    releaseLock(hash, relay.paymaster);
  };

  // Fire-and-forget: run the poller independently, catch unhandled rejections
  poll().catch((err) => {
    console.error(`[Queue] Background tracker error for ${hash}:`, err);
    releaseLock(hash, relay.paymaster);
  });
}
