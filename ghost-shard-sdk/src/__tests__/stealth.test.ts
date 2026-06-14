import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateStealthAddress, getNewDepositAddress } from '../stealth.js';
import { SEED_BYTES, stubRandomBytes } from './helpers.js';
import { deriveKeys, deriveShardPrivateKey } from '../keys.js';
import { encodeMetaAddress } from '../metaAddress.js';
import { bytesToBigInt, bytesToHex, hexToBytes, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Stub randomBytes so stealth addresses are deterministic
vi.mock('@noble/hashes/utils', () => ({
  randomBytes: () => stubRandomBytes(),
}));

describe('generateStealthAddress', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns stealthAddress, ephemeralPubKey, and sharedSecret', () => {
    const keys = deriveKeys(SEED_BYTES);
    const metaAddress = encodeMetaAddress(keys);
    const result = generateStealthAddress(metaAddress);

    expect(result.stealthAddress).toMatch(/^0x[0-9a-f]{40}$/i);
    expect(result.ephemeralPubKey).toMatch(/^0x[0-9a-f]{66}$/i);
    expect(result.sharedSecret).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it('produces deterministic results with stubbed randomBytes', () => {
    const keys = deriveKeys(SEED_BYTES);
    const metaAddress = encodeMetaAddress(keys);

    const a = generateStealthAddress(metaAddress);
    const b = generateStealthAddress(metaAddress);

    expect(a.stealthAddress).toEqual(b.stealthAddress);
    expect(a.ephemeralPubKey).toEqual(b.ephemeralPubKey);
    expect(a.sharedSecret).toEqual(b.sharedSecret);
  });

  it('throws on invalid meta-address', () => {
    expect(() => generateStealthAddress('0xinvalid')).toThrow();
  });
});

describe('getNewDepositAddress', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a valid stealth address for self', () => {
    const keys = deriveKeys(SEED_BYTES);
    const result = getNewDepositAddress(keys);

    const shardPrivKey = deriveShardPrivateKey(keys.spendingPrivateKey, hexToBytes(result.sharedSecret));
    const account = privateKeyToAccount(bytesToHex(shardPrivKey));

    expect(result.stealthAddress).toMatch(/^0x[0-9a-f]{40}$/i);
    expect(result.ephemeralPubKey).toMatch(/^0x[0-9a-f]{66}$/i);
    expect(result.sharedSecret).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(account.address.toLowerCase()).toEqual(result.stealthAddress.toLowerCase());
  });

  it('produces deterministic results with stubbed randomBytes', () => {
    const keys = deriveKeys(SEED_BYTES);
    const a = getNewDepositAddress(keys);
    const b = getNewDepositAddress(keys);

    expect(a.stealthAddress).toEqual(b.stealthAddress);
  });
});