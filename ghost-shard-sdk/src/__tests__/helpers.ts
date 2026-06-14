import type { Shard, KeySet, AssetBalance } from '../types.js';
import { Hex, bytesToHex } from 'viem';

/** Known 32-byte root seed for deterministic tests. */
export const SEED_BYTES = new Uint8Array(32).fill(0x42);

/** Deterministic randomBytes stub — always returns a known key. */
export function stubRandomBytes(): Uint8Array {
  return new Uint8Array([
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
    0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
    0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
  ]);
}

/** Create a KeySet with known bytes derived from SEED (for deterministic tests). */
export function makeKeySet(): KeySet {
  const keyBytes = (prefix: number) => {
    const b = new Uint8Array(32);
    b.set([prefix], 0);
    for (let i = 1; i < 32; i++) b[i] = SEED_BYTES[i] ^ prefix;
    return b;
  };

  // We'll use actual deriveKeys for real tests, but this gives us known key bytes
  return {
    spendingPrivateKey: keyBytes(0x01),
    spendingPublicKey: new Uint8Array(33).fill(0x02),
    viewingPrivateKey: keyBytes(0x03),
    viewingPublicKey: new Uint8Array(33).fill(0x03),
    dbEncryptionKey: keyBytes(0x03),
  };
}

/** Factory for creating Shard objects in tests. */
export function makeShard(overrides?: Partial<Shard>): Shard {
  return {
    address: ('0x' + '0'.repeat(39) + '1') as Hex,
    ephemeralPubKey: ('0x' + '0'.repeat(65) + '02') as Hex,
    spent: false,
    pending: false,
    assets: [],
    ...overrides,
  };
}

/** Factory for creating a Shard with a NATIVE balance. */
export function makeNativeShard(
  address?: Hex,
  balance: bigint = 1_000_000n,
): Shard {
  return {
    address: address ?? (`0x000000000000000000000000000000000000000${Math.floor(Math.random() * 10)}` as Hex),
    ephemeralPubKey: ('0x02' + '00'.repeat(32)) as Hex,
    spent: false,
    pending: false,
    assets: [{ type: 'NATIVE', balance }],
  };
}

/** Factory for creating a Shard with an ERC20 balance. */
export function makeERC20Shard(
  tokenAddress: Hex,
  balance: bigint = 500_000n,
  address?: Hex,
): Shard {
  return {
    address: address ?? (`0x000000000000000000000000000000000000000${Math.floor(Math.random() * 10)}` as Hex),
    ephemeralPubKey: ('0x02' + '00'.repeat(32)) as Hex,
    spent: false,
    pending: false,
    assets: [{ type: 'ERC20', tokenAddress, balance }],
  };
}

/** Factory for creating a Shard with an ERC721 balance. */
export function makeERC721Shard(
  tokenAddress: Hex,
  tokenIds: bigint[] = [1n, 2n],
  address?: Hex,
): Shard {
  return {
    address: address ?? (`0x000000000000000000000000000000000000000${Math.floor(Math.random() * 10)}` as Hex),
    ephemeralPubKey: ('0x02' + '00'.repeat(32)) as Hex,
    spent: false,
    pending: false,
    assets: [{ type: 'ERC721', tokenAddress, balance: BigInt(tokenIds.length), tokenIds }],
  };
}