import { type Address, type Hex } from 'viem';

export enum AssetType {
  Native = 0,
  ERC20 = 1,
  ERC721 = 2,
}

export interface Authorization {
  targetAddress: Address;
  chainId: number;
  nonce: number;
  yParity: number;
  r: Hex;
  s: Hex;
}

export interface TransferCommand {
  shard: Address;
  assetType: AssetType;
  token: Address;
  to: Address;
  value: bigint;
  signature: Hex;
  authorization: Authorization;
}

export interface Announcement {
  schemeId: bigint;
  stealthAddress: Address;
  ephemeralPubKey: Hex;
  metadata: Hex;
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
  paymaster: Address;
  validUntil: string;
  paymasterSignature: Hex;
}

export interface RelayerRelayRequest {
  commands: TransferCommand[];
  announcements: Announcement[];
  paymaster: Address;
  validUntil: string;
  paymasterSignature: Hex;
  limits: GasLimits;
}

export interface RelayerRelayResponse {
  transactionHash: Hex;
}

export interface InFlightLock {
  paymaster: string;
  allocatedCost: bigint;
  timestamp: number;
}
