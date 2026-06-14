/**
 * GhostShard SDK — JSON-RPC Client + Batched Fetch Helpers
 *
 * Refactored to use Viem's native PublicClient for rock-solid stability,
 * automatic retries, and native JSON-RPC batching.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import type { AnnouncementLog, NonceCheck, PaymasterQuoteRequest, PaymasterQuoteResponse, RelayRequest, RelayResponse } from './types.js';
import { parseLog } from './parse.js';
import { bytesToHex, Hex, Log, createPublicClient, http, PublicClient } from 'viem';

// We keep the retry logic specifically for the custom Relayer/Paymaster endpoints
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export class JsonRpcClient {
  private client: PublicClient;
  private paymasterUrl: string | undefined;
  private relayerUrl: string | undefined;
  private maxRetries: number;

  constructor(url: string, relayerUrl?: string, paymasterUrl?: string, maxRetries: number = 3) {
    this.paymasterUrl = paymasterUrl;
    this.relayerUrl = relayerUrl;
    this.maxRetries = maxRetries;

    // Initialize Viem's public client. 
    // Setting `batch: true` tells Viem to automatically group concurrent 
    // requests into a single HTTP POST, acting exactly like your old batch logic!
    this.client = createPublicClient({
      transport: http(url, {
        retryCount: maxRetries,
        batch: true,
      }),
    });
  }

  async getLogs(
    address: Hex,
    fromBlock: bigint,
    toBlock: bigint | 'latest',
    topics: string[][],
  ): Promise<Array<Log>> {
    // Viem automatically formats the bigints and parses the raw hex logs for you
    return this.client.getLogs({
      address,
      fromBlock,
      toBlock: toBlock === 'latest' ? undefined : toBlock,
    }) as unknown as Promise<Array<Log>>;
  }

  async getTransactionCount(address: Hex): Promise<number> {
    return this.client.getTransactionCount({
      address,
      blockTag: 'latest'
    });
  }

  async getBalance(address: Hex): Promise<bigint> {
    return this.client.getBalance({
      address,
      blockTag: 'latest'
    });
  }

  async ethCall(to: Hex, data: Hex): Promise<Hex> {
    const res = await this.client.call({
      to,
      data,
      blockTag: 'latest'
    });
    return res.data || '0x';
  }

  async waitForTransactionReceipt(hash: Hex) {
    return await this.client.waitForTransactionReceipt({ hash });
  }

  /**
   * JSON-RPC batch request.
   * Viem handles the actual HTTP batching under the hood. 
   * Individual failures return undefined to match original behavior.
   */
  async batchCall<T>(
    requests: Array<{ method: string; params: unknown[] }>,
  ): Promise<T[]> {
    if (requests.length === 0) return [];

    return Promise.all(
      requests.map(async (r) => {
        try {
          return await this.client.request({
            method: r.method as any,
            params: r.params as any,
          }) as T;
        } catch (error) {
          return undefined as unknown as T;
        }
      })
    );
  }

  /** Batch eth_getTransactionCount for multiple addresses. */
  async getTransactionCountBatch(
    addresses: Hex[],
  ): Promise<number[]> {
    const results = await this.batchCall<string>(
      addresses.map((a) => ({
        method: 'eth_getTransactionCount',
        params: [a, 'finalized'],
      })),
    );
    return results.map((r) => (r ? parseInt(r, 16) : 0));
  }

  // Relayer and Paymaster remain on standard fetch since they are custom REST APIs, 
  // not standard Ethereum RPC calls.
  async callRelayer(request: RelayRequest): Promise<RelayResponse> {
    if (!this.relayerUrl) {
      throw new Error('Relayer URL not configured');
    }
    const res = await fetch(this.relayerUrl as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ),
    });

    
    const json = await res.json() as any;
    if (!res.ok) throw new Error(`Relay Request failed with status ${res.status}: ${json.error?.message ?? json.error} ${JSON.stringify(json.error)}`);
    
    return json as RelayResponse;
  }

  async callPaymaster(request: PaymasterQuoteRequest): Promise<PaymasterQuoteResponse> {
    if (!this.paymasterUrl) {
      throw new Error('Paymaster URL not configured');
    }
    const res = await fetch(this.paymasterUrl as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ),
    });

    if (!res.ok) throw new Error(`Paymaster Request failed: ${res.status}, ${res.body}`);

    const json = await res.json() as any;
    if (json.error) throw json.error;

    return json;
  }
}

function announcementTopics(): Hex[] {
  const sigs = [
    'Announcement(uint256,address,address,bytes,bytes)',
  ];
  return sigs.map((sig) => {
    const hash = keccak_256(new TextEncoder().encode(sig));
    return bytesToHex(hash);
  });
}

const BATCH_CHUNK_SIZE = 300;

/**
 * Fetch ERC-5564 announcement logs from an RPC endpoint.
 */
export async function fetchAnnouncements(
  rpcOrUrl: JsonRpcClient | string,
  registryAddress: Hex,
  fromBlock: bigint,
  toBlock: bigint | 'latest' = 'latest',
): Promise<AnnouncementLog[]> {
  const rpc = typeof rpcOrUrl === 'string' ? new JsonRpcClient(rpcOrUrl) : rpcOrUrl;
  const topics = announcementTopics();
  const allLogs: Array<Log> = [];

  for (const topic of topics) {
    try {
      const logs = await rpc.getLogs(
        registryAddress,
        fromBlock,
        toBlock,
        [[topic]],
      );
      allLogs.push(...logs);
    } catch {
      // Skip topic signatures that don't match this registry
    }
  }

  const result: AnnouncementLog[] = [];
  for (const log of allLogs) {
    const parsed = parseLog(log);
    if (parsed) result.push(parsed);
  }

  return result;
}

/**
 * Fetch transaction counts for a list of addresses via batched JSON-RPC.
 * Chunked at 300 per batch, dispatched concurrently.
 */
export async function fetchNonces(
  rpcOrUrl: JsonRpcClient | string,
  addresses: Hex[],
): Promise<NonceCheck[]> {
  if (addresses.length === 0) return [];

  const chunks = Array.from(
    { length: Math.ceil(addresses.length / BATCH_CHUNK_SIZE) },
    (_, i) => addresses.slice(i * BATCH_CHUNK_SIZE, (i + 1) * BATCH_CHUNK_SIZE),
  );

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const rpc = typeof rpcOrUrl === 'string' ? new JsonRpcClient(rpcOrUrl) : rpcOrUrl;
        const counts = await rpc.getTransactionCountBatch(chunk);
        return chunk.map((address, i) => ({
          address,
          nonce: counts[i] ?? 0,
        }));
      } catch {
        return chunk.map((address) => ({ address, nonce: 0 }));
      }
    }),
  );

  return chunkResults.flat();
}