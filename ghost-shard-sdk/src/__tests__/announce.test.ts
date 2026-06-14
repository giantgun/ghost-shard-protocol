import { describe, it, expect } from 'vitest';
import { packMetadata, decryptMetadataPayload, prepareAnnounceTransfer } from '../announce.js';
import { SEED_BYTES, stubRandomBytes } from './helpers.js';
import { deriveKeys, computeSharedSecret } from '../keys.js';
import { hexToBytes, bytesToHex } from 'viem';
import { ERC5564_ANNOUNCE_ABI } from '../abi.js';
import { decodeFunctionData } from 'viem';

describe('packMetadata', () => {
  it('returns single viewTag byte when no assetInfo', async () => {
    const sharedSecret = new Uint8Array(32).fill(0xab);
    const result = await packMetadata(sharedSecret);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(0xab);
  });

  it('returns 54 bytes for NATIVE asset', async () => {
    const sharedSecret = new Uint8Array(32).fill(0x42);
    const result = await packMetadata(sharedSecret, {
      type: 'NATIVE',
      amount: 1000000n,
    });
    expect(result.length).toBe(54);
    // viewTag
    expect(result[0]).toBe(0x42);
    // assetType = 0 (NATIVE)
    expect(result[1]).toBe(0);
    // tokenAddress is all zeros for NATIVE
    for (let i = 2; i < 22; i++) expect(result[i]).toBe(0);
  });

  it('includes tokenAddress for ERC20', async () => {
    const sharedSecret = new Uint8Array(32).fill(0x42);
    const tokenAddr = '0x' + '23'.repeat(20);
    const result = await packMetadata(sharedSecret, {
      type: 'ERC20',
      tokenAddress: tokenAddr as `0x${string}`,
      amount: 500000n,
    });
    expect(result.length).toBe(54);
    expect(result[1]).toBe(1); // ERC20 type
    // tokenAddress bytes at position 2-21
    const addrBytes = result.slice(2, 22);
    expect(bytesToHex(addrBytes)).toBe(tokenAddr.toLowerCase());
  });

  it('includes tokenId for ERC721', async () => {
    const sharedSecret = new Uint8Array(32).fill(0x42);
    const tokenAddr = '0x' + '23'.repeat(20);
    const result = await packMetadata(sharedSecret, {
      type: 'ERC721',
      tokenAddress: tokenAddr as `0x${string}`,
      tokenId: 42n,
    });
    expect(result.length).toBe(54);
    expect(result[1]).toBe(2); // ERC721 type
  });

  it('appends encrypted senderInfo when provided', async () => {
    const sharedSecret = new Uint8Array(32).fill(0x42);
    const result = await packMetadata(sharedSecret, {
      type: 'NATIVE',
      amount: 100n,
    }, 'hello-sender');

    // 54 header + 12 IV + ciphertext+tag
    expect(result.length).toBeGreaterThan(54 + 12);
    // First 54 bytes are still the header
    expect(result[0]).toBe(0x42);
    expect(result[1]).toBe(0);
  });
});

describe('decryptMetadataPayload', () => {
  it('round-trips a senderInfo string', async () => {
    const sharedSecret = new Uint8Array(32).fill(0x99);
    const originalInfo = 'alice@example.com';

    const packed = await packMetadata(sharedSecret, {
      type: 'NATIVE',
      amount: 1000n,
    }, originalInfo);

    // Extract the trailing payload (after 54-byte header)
    const payload = packed.slice(54);
    const decrypted = await decryptMetadataPayload(payload, sharedSecret);
    expect(decrypted).toBe(originalInfo);
  });

  it('throws on tampered ciphertext', async () => {
    const sharedSecret = new Uint8Array(32).fill(0x99);
    const packed = await packMetadata(sharedSecret, {
      type: 'NATIVE',
      amount: 1000n,
    }, 'secret');

    const payload = packed.slice(54);
    // Tamper with the ciphertext
    payload[payload.length - 1] ^= 0xff;

    await expect(decryptMetadataPayload(payload, sharedSecret)).rejects.toThrow();
  });
});

describe('prepareAnnounceTransfer', () => {
  it('returns a transaction with ABI-encoded announce() call', async () => {
    const stealthAddress = '0x' + '11'.repeat(20);
    const ephemeralPubKey = '0x02' + '22'.repeat(32);
    const announcerAddress = '0x' + '33'.repeat(20);
    const sharedSecret = bytesToHex(new Uint8Array(32).fill(0x42));

    const tx = await prepareAnnounceTransfer(
      stealthAddress as `0x${string}`,
      ephemeralPubKey as `0x${string}`,
      announcerAddress as `0x${string}`,
      1,
      { sharedSecret: sharedSecret as `0x${string}`, assetInfo: { type: 'NATIVE', amount: 500n } },
    );

    expect(tx.to).toBe(announcerAddress);
    expect(tx.data).toMatch(/^0x/);

    // Decode to verify it's a valid announce() call
    const decoded = decodeFunctionData({
      abi: ERC5564_ANNOUNCE_ABI,
      data: tx.data,
    });
    expect(decoded.functionName).toBe('announce');
    expect(decoded.args![0]).toBe(1n); // schemeId
  });

  it('produces metadata-only bytes when no senderInfo', async () => {
    const stealthAddress = '0x' + '11'.repeat(20);
    const ephemeralPubKey = '0x02' + '22'.repeat(32);
    const announcerAddress = '0x' + '33'.repeat(20);

    const tx = await prepareAnnounceTransfer(
      stealthAddress as `0x${string}`,
      ephemeralPubKey as `0x${string}`,
      announcerAddress as `0x${string}`,
    );

    expect(tx.data).toMatch(/^0x/);
  });
});