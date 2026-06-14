/**
 * GhostShard SDK — Core Type Definitions
 *
 * Wallet-agnostic: all external interaction goes through the Signer interface.
 * No assumption about which wallet library or provider is used.
 *
 * UTXO model: Shards are one-time-use EOAs consumed atomically.
 */
import { Client, Hex, PrivateKeyAccount } from "viem";
import { ERC5564_ANNOUNCE_ADDRESS } from "./abi";
import { Chain } from "viem";

/** Minimal wallet interface. Only needs getAddress + signTypedData for key derivation. */
export interface GhostIdentitySigner {
  address: Hex;
  signTypedData: (args: {
    domain: any;
    types: any;
    primaryType: string;
    message: any;
  }) => Promise<Hex>;
}

export interface GhostTransactionSigner {
  address: Hex;
  signMessage: (args: { message: { raw: Hex } | string }) => Promise<Hex>;
}

/** Derived keypair set. All fields are raw Uint8Arrays. */
export interface KeySet {
  spendingPrivateKey: Uint8Array;
  spendingPublicKey: Uint8Array;
  viewingPrivateKey: Uint8Array;
  viewingPublicKey: Uint8Array;
  dbEncryptionKey: Uint8Array;
}

/** Result of generating a stealth address for a recipient. */
export interface StealthAddressResult {
  stealthAddress: Hex;
  ephemeralPubKey: Hex;
  sharedSecret: Hex;
}

export type MeshExecutionResult = { 
  relayer: Hex; 
  paymaster: Hex; 
  totalGasUsed: bigint; 
  totalGasCost: bigint; 
  innerCallGasUsed: bigint; 
  innerCallGasCost: bigint; 
  success: boolean; 
  revertReason: string; 
};

/** An ERC-5564 announce() transaction ready for submission. */
export interface AnnounceTransaction {
  to: Hex;
  data: Hex;
}

/** Asset types a shard can hold. */
export type AssetType = 'NATIVE' | 'ERC20' | 'ERC721';

/** Discriminated union of asset balances. */
export interface NativeBalance {
  type: 'NATIVE';
  balance: bigint;
}

export interface ERC20Balance {
  type: 'ERC20';
  tokenAddress: Hex;
  balance: bigint;
}

export interface ERC721Balance {
  type: 'ERC721';
  tokenAddress: Hex;
  balance: bigint;
  tokenIds: bigint[];
}

export type AssetBalance = NativeBalance | ERC20Balance | ERC721Balance;

/** Flat NFT reference used by listNFTs(). */
export interface NFT {
  shardAddress: Hex;
  tokenAddress: Hex;
  tokenId: bigint;
}

/**
 * A single UTXO-style shard (stealth address EOA).
 *
 * Lifecycle: added → pending (tx submitted) → spent (nonce > 0 on-chain).
 * Spent detection via isShardSpent on GhostRouter (see syncSpentShards).
 */
export interface Shard {
  address: Hex;
  ephemeralPubKey: Hex;
  spent: boolean;
  pending: boolean;
  assets: AssetBalance[];
}

/** Describes what the caller wants to send (public recipient). */
export interface TransferRequest {
  type: AssetType;
  to: Hex;
  amount?: bigint;
  tokenAddress?: Hex;
  tokenId?: bigint;
}

/** Describes what the caller wants to send (stealth recipient). */
export interface PrivateTransferRequest {
  type: AssetType;
  metaAddress: string;
  amount?: bigint;
  tokenAddress?: Hex;
  tokenId?: bigint;
}

/** EIP-7702 authorization signature. Nonce is always 0 (UTXO model). */
export interface Authorization {
  targetAddress: Hex;
  chainId: number;
  r: Hex;
  s: Hex;
  yParity: number;
  nonce: number;
}

export interface TransferCommand {
  shard: Hex;
  assetType: number;
  token: Hex;
  to: Hex;
  value: bigint;
  signature: Hex;
  authorization: Authorization;
}

/** Complete output of buildTransaction/prepareTransfer. */
export interface PreparedTransfer {
  authorizations: Authorization[];
  changeShards: (Omit<Shard, 'pending' | 'spent' | 'assets'> & { amount: bigint })[];
  shardAddresses: Hex[];
  changeAmount: bigint;
  announcements: Announcement[];
  commands: TransferCommand[];
}

export interface PreparedRouterTransaction extends PreparedTransfer {
  to: Hex;
  data: Hex;
  callerShardAddress: Hex;
  callerShardPrivateKey: Hex;
}

export interface PrivateDepositRequest {
  metaAddress: string;          // The target "st:eth:0x..." recipient meta-address
  amount: bigint;               // Value amount (or tokenId for ERC721)
  type: 'NATIVE' | 'ERC20' | 'ERC721';
  tokenAddress?: Hex;           // Required for ERC20/ERC721
  senderAddress: Hex;            // The sender's public address (for token transfers)
  tokenId?: bigint;             // Required for ERC721
}

export interface BatchCall {
  to: Hex;
  data: Hex;
  value: bigint;
}

export interface PreparedPrivateDeposit {
  calls: BatchCall[];
  stealthAddresses: Hex[];
}

export interface GasLimits {
  verificationGasLimit: number;
  callGasLimit: number;
  preVerificationGas: number;
  maxFeePerGas: bigint;
}

export interface PaymasterQuoteRequest {
  commands: TransferCommand[];
  announcements: Announcement[];
  /** User signature over the full bundle (commands + announcements + limits), proving the shard owner authorized this bundle. The paymaster recovers the user address from this and checks it against its allowedUsers allowlist. */
  userSignature: Hex;
}

export interface PaymasterQuoteResponse {
  commands: TransferCommand[];
  announcements: Announcement[];
  limits: GasLimits;
  paymaster: Hex;
  validUntil: string;
  paymasterSignature: Hex;
}

export interface RelayRequest {
  commands: TransferCommand[];
  announcements: Announcement[];
  paymaster: Hex;
  validUntil: string;
  paymasterSignature: Hex;
  limits: GasLimits;
}

export interface RelayResponse {
  transactionHash: Hex;
}

/** Internal result from coin selection. */
export interface CoinSelectionResult {
  shards: Shard[];
  contributions: bigint[];
  totalSelected: bigint;
  changeAmount: bigint;
}

/** A parsed ERC-5564 announcement log. */
export interface AnnouncementLog {
  ephemeralPubKey: Hex;
  metadata?: Hex;
}

export interface Announcement {
  schemeId: bigint;
  stealthAddress: Hex;
  ephemeralPubKey: Hex;
  metadata: Hex;
}

/** Asset metadata for announcement packing. */
export interface AssetMetadata {
  type: AssetType;
  tokenAddress?: Hex;
  amount?: bigint;
  tokenId?: bigint;
}

/** On-chain nonce data for a single address. */
export interface NonceCheck {
  address: Hex;
  nonce: number;
}

/** SDK configuration. */
export interface GhostConfig {
  chain: Chain;
  rpcUrl: string;
  startBlock: bigint;
  storage?: ShardStorage;
  paymasterUrl?: string;
  relayerUrl?: string;
  maxFeePerGasCeiling?: bigint;
}

/** Persisted state envelope. */
export interface PersistedState {
  shards: Shard[];
  lastSyncedBlock: bigint | null;
}

/** Persistence interface for shard + sync state. */
export interface ShardStorage {
  load(encryptionKey: Uint8Array): Promise<PersistedState>;
  save(state: PersistedState, encryptionKey: Uint8Array): Promise<void>;
}

/** Event types emitted by GhostClient. */
export interface GhostEventMap {
  'shard:discovered': { shard: Shard };
  'shard:spent': { address: Hex };
  'shard:pending': { shard: Shard };
  'sync:complete': { discovered: number };
  'sync:error': { error: unknown };
}

export type GhostEventName = keyof GhostEventMap;

export type GhostEventHandler<E extends GhostEventName> =
  (payload: GhostEventMap[E]) => void;

export const DEFAULT_CONFIG: Partial<GhostConfig> = {
  startBlock: 0n,
};