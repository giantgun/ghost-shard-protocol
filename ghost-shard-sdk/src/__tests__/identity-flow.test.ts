/**
 * End-to-end deterministic identity flow test.
 *
 * Locks in that the entire identity layer is self-consistent with a single set
 * of known inputs — no randomness, no RPC, just pure crypto math.
 *
 * Flow:
 *   deriveKeys → encodeMetaAddress → generateStealthAddress → packMetadata
 *   → parseAssetMetadata → deriveShardPrivateKey → signAuthorization
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveKeys, computeSharedSecret, deriveShardPrivateKey, computeStealthAddress } from '../keys.js';
import { encodeMetaAddress, decodeMetaAddress } from '../metaAddress.js';
import { generateStealthAddress } from '../stealth.js';
import { packMetadata } from '../announce.js';
import { parseAssetMetadata } from '../discovery.js';
import { signAuthorization } from '../transaction.js';
import { stubRandomBytes, SEED_BYTES } from './helpers.js';
import { SHARD_IMPLEMENTATION } from '../abi.js';
import { bytesToHex } from 'viem';
import { secp256k1 } from '@noble/curves/secp256k1';

// Stub randomBytes for deterministic ephemeral key generation
vi.mock('@noble/hashes/utils', () => ({
  randomBytes: () => stubRandomBytes(),
}));

describe('identity pipeline (deterministic)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('full pipeline is self-consistent', async () => {
    // -----------------------------------------------------------------------
    // 1. Derive keys from known seed
    // -----------------------------------------------------------------------
    const keys = deriveKeys(SEED_BYTES);
    expect(keys.spendingPrivateKey.length).toBe(32);
    expect(keys.spendingPublicKey.length).toBe(33);
    expect(keys.viewingPrivateKey.length).toBe(32);
    expect(keys.viewingPublicKey.length).toBe(33);

    // -----------------------------------------------------------------------
    // 2. Encode meta-address
    // -----------------------------------------------------------------------
    const metaAddress = encodeMetaAddress(keys);
    expect(metaAddress).toMatch(/^st:eth:0x01[a-f0-9]{132}$/i);

    // -----------------------------------------------------------------------
    // 3. Decode meta-address back
    // -----------------------------------------------------------------------
    const decoded = decodeMetaAddress(metaAddress);
    expect(bytesToHex(decoded.spendingPublicKey)).toBe(bytesToHex(keys.spendingPublicKey));
    expect(bytesToHex(decoded.viewingPublicKey)).toBe(bytesToHex(keys.viewingPublicKey));

    // -----------------------------------------------------------------------
    // 4. Generate stealth address (stubbed randomBytes for determinism)
    // -----------------------------------------------------------------------
    const stealth = generateStealthAddress(metaAddress);
    expect(stealth.stealthAddress).toMatch(/^0x[a-f0-9]{40}$/i);
    expect(stealth.ephemeralPubKey).toMatch(/^0x[a-f0-9]{66}$/i);
    expect(stealth.sharedSecret).toMatch(/^0x[a-f0-9]{64}$/i);

    // -----------------------------------------------------------------------
    // 5. Cross-check: receiver computes same shared secret via viewingPriv
    // -----------------------------------------------------------------------
    const ephPubKeyBytes = hexToBytes(stealth.ephemeralPubKey);
    const sharedSecretBytes = computeSharedSecret(keys.viewingPrivateKey, ephPubKeyBytes);
    expect(bytesToHex(sharedSecretBytes)).toBe(stealth.sharedSecret);

    const computedStealthAddr = computeStealthAddress(keys.spendingPublicKey, sharedSecretBytes);
    expect(computedStealthAddr).toBe(stealth.stealthAddress);

    // -----------------------------------------------------------------------
    // 6. Pack metadata with known asset info
    // -----------------------------------------------------------------------
    const assetInfo = { type: 'NATIVE' as const, amount: 1000000n };
    const packed = await packMetadata(sharedSecretBytes, assetInfo);
    expect(packed.length).toBe(54);

    // viewTag matches sharedSecret[0]
    expect(packed[0]).toBe(sharedSecretBytes[0]);

    // assetType = 0 (NATIVE)
    expect(packed[1]).toBe(0);

    // -----------------------------------------------------------------------
    // 7. Parse asset metadata back
    // -----------------------------------------------------------------------
    const parsed = await parseAssetMetadata(bytesToHex(packed), sharedSecretBytes);
    expect(parsed).not.toBeNull();
    expect(parsed!.assets).toHaveLength(1);
    expect(parsed!.assets[0].type).toBe('NATIVE');
    expect((parsed!.assets[0] as any).balance).toBe(1000000n);

    // -----------------------------------------------------------------------
    // 8. Derive shard private key
    // -----------------------------------------------------------------------
    const shardPrivKey = deriveShardPrivateKey(keys.spendingPrivateKey, sharedSecretBytes);
    expect(shardPrivKey.length).toBe(32);
    expect(bytesToHex(shardPrivKey)).not.toBe(bytesToHex(keys.spendingPrivateKey));

    // Shard key is valid secp256k1 scalar (< n)
    const n = secp256k1.Point.CURVE().n;
    const scalar = BigInt(`0x${bytesToHex(shardPrivKey).slice(2)}`);
    expect(scalar).toBeGreaterThan(0n);
    expect(scalar).toBeLessThan(n);

    // -----------------------------------------------------------------------
    // 9. signAuthorization with the shard key produces valid signature
    // -----------------------------------------------------------------------
    const auth = signAuthorization(shardPrivKey, SHARD_IMPLEMENTATION, 1, 0);
    expect(auth.chainId).toBe(1);
    expect(auth.targetAddress).toBe(SHARD_IMPLEMENTATION);
    expect(auth.nonce).toBe(0);
    const r = BigInt(auth.r);
    const s = BigInt(auth.s);
    expect(r).toBeGreaterThan(0n);
    expect(r).toBeLessThan(n);
    expect(s).toBeGreaterThan(0n);
    expect(s).toBeLessThan(n);

    // -----------------------------------------------------------------------
    // 10. Verify the shard key is reproducible across independent derivation
    // -----------------------------------------------------------------------
    const shardPrivKey2 = deriveShardPrivateKey(keys.spendingPrivateKey, sharedSecretBytes);
    expect(bytesToHex(shardPrivKey2)).toBe(bytesToHex(shardPrivKey));

    // And via deriveShardPrivateKeyFromAnnouncement
    const { deriveShardPrivateKeyFromAnnouncement } = await import('../transaction.js');
    const fromAnnouncement = deriveShardPrivateKeyFromAnnouncement(
      keys.spendingPrivateKey,
      keys.viewingPrivateKey,
      stealth.ephemeralPubKey,
    );
    expect(bytesToHex(fromAnnouncement)).toBe(bytesToHex(shardPrivKey));
  });
});

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}