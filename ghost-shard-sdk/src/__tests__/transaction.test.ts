import { describe, it, expect } from 'vitest';
import { signAuthorization, deriveShardPrivateKeyFromAnnouncement } from '../transaction.js';
import { deriveKeys, deriveShardPrivateKey, computeSharedSecret } from '../keys.js';
import { SEED_BYTES, stubRandomBytes } from './helpers.js';
import { SHARD_IMPLEMENTATION } from '../abi.js';
import { bytesToHex } from 'viem';
import { secp256k1 } from '@noble/curves/secp256k1';

describe('signAuthorization', () => {
  it('returns an Authorization struct with expected fields', () => {
    const privateKey = new Uint8Array(32).fill(0x01);
    privateKey[31] = 0x01; // valid secp256k1 scalar

    const auth = signAuthorization(privateKey, SHARD_IMPLEMENTATION, 1, 0);

    expect(auth.chainId).toBe(1);
    expect(auth.targetAddress).toBe(SHARD_IMPLEMENTATION);
    expect(auth.nonce).toBe(0);
    expect(auth.r).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(auth.s).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(auth.yParity).toBeTypeOf('number');
  });

  it('produces valid secp256k1 signature', () => {
    const privateKey = new Uint8Array(32).fill(0x02);
    privateKey[31] = 0x02;

    const auth = signAuthorization(privateKey, SHARD_IMPLEMENTATION, 1, 0);

    // The r and s should produce a valid signature
    const r = BigInt(auth.r);
    const s = BigInt(auth.s);
    const n = secp256k1.CURVE.n;
    expect(r).toBeGreaterThan(0n);
    expect(r).toBeLessThan(n);
    expect(s).toBeGreaterThan(0n);
    expect(s).toBeLessThan(n);
  });
});

describe('deriveShardPrivateKeyFromAnnouncement', () => {
  it('matches deriveShardPrivateKey result', () => {
    const keys = deriveKeys(SEED_BYTES);

    // Compute shared secret and shard key directly
    const sharedSecret = computeSharedSecret(keys.spendingPrivateKey, keys.viewingPublicKey);
    const directShardKey = deriveShardPrivateKey(keys.spendingPrivateKey, sharedSecret);

    // Derive from announcement using spendingPubKey as ephemeralPubKey
    // (ECDH: viewingPriv × spendingPub === spendingPriv × viewingPub)
    const ephPubKey = bytesToHex(keys.spendingPublicKey);
    const fromAnnouncement = deriveShardPrivateKeyFromAnnouncement(
      keys.spendingPrivateKey,
      keys.viewingPrivateKey,
      ephPubKey,
    );

    expect(bytesToHex(fromAnnouncement)).toBe(bytesToHex(directShardKey));
  });

  it('returns 32 bytes', () => {
    const keys = deriveKeys(SEED_BYTES);
    const ephPubKey = bytesToHex(keys.viewingPublicKey);
    const result = deriveShardPrivateKeyFromAnnouncement(
      keys.spendingPrivateKey,
      keys.viewingPrivateKey,
      ephPubKey,
    );
    expect(result.length).toBe(32);
  });
});