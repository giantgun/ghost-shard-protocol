import { describe, it, expect } from 'vitest';
import { encodeMetaAddress, decodeMetaAddress, isMetaAddress } from '../metaAddress.js';
import { SEED_BYTES } from './helpers.js';
import { deriveKeys } from '../keys.js';

describe('encodeMetaAddress', () => {
  it('produces st:eth:0x prefixed string', () => {
    const keys = deriveKeys(SEED_BYTES);
    const encoded = encodeMetaAddress(keys);
    expect(encoded).toMatch(/^st:eth:0x/);
  });

  it('round-trips through decodeMetaAddress', () => {
    const keys = deriveKeys(SEED_BYTES);
    const encoded = encodeMetaAddress(keys);
    const decoded = decodeMetaAddress(encoded);
    expect(decoded.spendingPublicKey).toEqual(keys.spendingPublicKey);
    expect(decoded.viewingPublicKey).toEqual(keys.viewingPublicKey);
  });
});

describe('decodeMetaAddress', () => {
  it('throws on missing prefix', () => {
    expect(() => decodeMetaAddress('0x1234')).toThrow('st:eth:');
  });

  it('throws on wrong payload length', () => {
    expect(() => decodeMetaAddress('st:eth:0x1234')).toThrow('67 bytes');
  });

  it('throws on invalid curve points', () => {
    // 66 bytes of zeros — invalid public keys
    const zeroHex = '00'.repeat(66);
    expect(() => decodeMetaAddress(`st:eth:0x01${zeroHex}`)).toThrow('secp256k1');
  });

  it('decodes a known valid meta-address', () => {
    const keys = deriveKeys(SEED_BYTES);
    const encoded = encodeMetaAddress(keys);
    const decoded = decodeMetaAddress(encoded);
    expect(decoded.spendingPublicKey).toBeInstanceOf(Uint8Array);
    expect(decoded.viewingPublicKey).toBeInstanceOf(Uint8Array);
    expect(decoded.spendingPublicKey.length).toBe(33);
    expect(decoded.viewingPublicKey.length).toBe(33);
  });
});

describe('isMetaAddress', () => {
  it('returns true for valid meta addresses', () => {
    const zeroHex = '00'.repeat(66);
    expect(isMetaAddress(`st:eth:0x01${zeroHex}`)).toBe(true);
  });

  it('returns false for non-prefixed strings', () => {
    expect(isMetaAddress('0x1234')).toBe(false);
    expect(isMetaAddress('')).toBe(false);
  });
});