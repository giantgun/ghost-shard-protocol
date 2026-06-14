import { describe, it, expect } from 'vitest';
import { deriveKeys, computeSharedSecret, deriveShardPrivateKey, computeStealthAddress } from '../keys.js';
import { SEED_BYTES } from './helpers.js';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex } from 'viem';

describe('deriveKeys', () => {
  it('produces deterministic keys from the same seed', () => {
    const a = deriveKeys(SEED_BYTES);
    const b = deriveKeys(SEED_BYTES);
    expect(a.spendingPrivateKey).toEqual(b.spendingPrivateKey);
    expect(a.viewingPrivateKey).toEqual(b.viewingPrivateKey);
    expect(a.spendingPublicKey).toEqual(b.spendingPublicKey);
    expect(a.viewingPublicKey).toEqual(b.viewingPublicKey);
  });

  it('produces different keys for different seeds', () => {
    const seedB = new Uint8Array(32).fill(0x99);
    const a = deriveKeys(SEED_BYTES);
    const b = deriveKeys(seedB);
    expect(a.spendingPrivateKey).not.toEqual(b.spendingPrivateKey);
    expect(a.viewingPrivateKey).not.toEqual(b.viewingPrivateKey);
  });

  it('produces valid secp256k1 public keys (compressed, 33 bytes)', () => {
    const keys = deriveKeys(SEED_BYTES);
    expect(keys.spendingPublicKey.length).toBe(33);
    expect(keys.viewingPublicKey.length).toBe(33);
    const prefix = keys.spendingPublicKey[0];
    expect(prefix === 0x02 || prefix === 0x03).toBe(true);
  });

  it('spending and viewing keys are different', () => {
    const keys = deriveKeys(SEED_BYTES);
    expect(keys.spendingPrivateKey).not.toEqual(keys.viewingPrivateKey);
    expect(keys.spendingPublicKey).not.toEqual(keys.viewingPublicKey);
  });
});

describe('computeSharedSecret', () => {
  it('is commutative: privA×pubB === privB×pubA', () => {
    const seedA = new Uint8Array(32).fill(0x11);
    const seedB = new Uint8Array(32).fill(0x22);
    const a = deriveKeys(seedA);
    const b = deriveKeys(seedB);

    const secretAB = computeSharedSecret(a.spendingPrivateKey, b.spendingPublicKey);
    const secretBA = computeSharedSecret(b.spendingPrivateKey, a.spendingPublicKey);
    expect(secretAB).toEqual(secretBA);
  });

  it('returns 32 bytes', () => {
    const keys = deriveKeys(SEED_BYTES);
    const secret = computeSharedSecret(keys.spendingPrivateKey, keys.viewingPublicKey);
    expect(secret.length).toBe(32);
  });
});

describe('deriveShardPrivateKey', () => {
  it('derives a key different from the master key', () => {
    const keys = deriveKeys(SEED_BYTES);
    const sharedSecret = computeSharedSecret(keys.spendingPrivateKey, keys.viewingPublicKey);
    const shardPriv = deriveShardPrivateKey(keys.spendingPrivateKey, sharedSecret);
    expect(shardPriv).not.toEqual(keys.spendingPrivateKey);
    expect(shardPriv.length).toBe(32);
  });

  it('derived key is a valid secp256k1 scalar (< n)', () => {
    const keys = deriveKeys(SEED_BYTES);
    const sharedSecret = computeSharedSecret(keys.spendingPrivateKey, keys.viewingPublicKey);
    const shardPriv = deriveShardPrivateKey(keys.spendingPrivateKey, sharedSecret);
    const n = secp256k1.Point.CURVE().n;
    const scalar = BigInt(bytesToHex(shardPriv));
    expect(scalar).toBeGreaterThan(0n);
    expect(scalar).toBeLessThan(n);
  });
});

describe('computeStealthAddress', () => {
  it('produces a 20-byte (40 hex char) address', () => {
    const keys = deriveKeys(SEED_BYTES);
    const sharedSecret = computeSharedSecret(keys.spendingPrivateKey, keys.viewingPublicKey);
    const address = computeStealthAddress(keys.spendingPublicKey, sharedSecret);
    expect(address).toMatch(/^0x[0-9a-f]{40}$/i);
  });
});