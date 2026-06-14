import { createPublicClient, createWalletClient, http } from 'viem';
import { config } from '../config.js';

/**
 * Shared public client for all read operations (eth_call, eth_estimateGas,
 * getFeeHistory, readContract, etc.). Both the paymaster quoting engine and
 * the relayer relay engine import this single instance to reduce memory
 * footprint and avoid duplicate RPC polling.
 */
export const publicClient = createPublicClient({
  chain: config.chain,
  transport: http(config.readRpcUrl),
});

/**
 * Shared wallet client for transaction submission via private RPC.
 * Used by the relayer path to broadcast type 4 (EIP-7702) transactions.
 */
export const walletClient = createWalletClient({
  chain: config.chain,
  transport: http(config.privateRpcUrl),
});
