/**
 * GhostShard SDK — Stealth Address Generation
 *
 * Generates ephemeral stealth addresses for sending to a recipient (or yourself).
 *
 * Flow:
 *   1. Generate random ephemeral keypair (one-time-use)
 *   2. ECDH: ephemeralPriv × viewingPub → sharedSecret
 *   3. Derive stealth address: spendingPub + (sharedSecret × G)
 *   4. Return { stealthAddress, ephemeralPubKey, sharedSecret }
 *
 * Every call generates a new random ephemeral keypair — same recipient gets different
 * addresses each time (privacy). Deposit addresses cannot be deterministically regenerated.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { randomBytes } from '@noble/hashes/utils';
import type { KeySet, StealthAddressResult } from './types.js';
import { decodeMetaAddress } from './metaAddress.js';
import { computeSharedSecret, computeStealthAddress } from './keys.js';
import { bytesToHex } from 'viem';

/** Generate a random secp256k1 keypair. Private key is discarded after address generation. */
function generateEphemeralKeypair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = randomBytes(32);
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  return { privateKey, publicKey };
}

export function generateRandomKeypair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  return generateEphemeralKeypair();
}

/**
 * Generate a stealth address for a recipient identified by their meta-address.
 */
export function generateStealthAddress(
  metaAddress: string,
): StealthAddressResult {
  const { viewingPublicKey, spendingPublicKey } = decodeMetaAddress(metaAddress);
  
  const { publicKey: ephemeralPubKey, privateKey: ephemeralPrivKey } = generateEphemeralKeypair();
  const sharedSecret = computeSharedSecret(ephemeralPrivKey, viewingPublicKey);
  const stealthAddress = computeStealthAddress(spendingPublicKey, sharedSecret);

  return {
    stealthAddress,
    ephemeralPubKey: bytesToHex(ephemeralPubKey),
    sharedSecret: bytesToHex(sharedSecret),
  };
}

/**
 * Generate a stealth address the caller controls (for change or deposit).
 * Uses own viewing key — the generated address is discoverable on next sync.
 */
export function getNewDepositAddress(keys: KeySet): StealthAddressResult {
  const { publicKey: ephemeralPubKey, privateKey: ephemeralPrivKey } = generateEphemeralKeypair();

  const sharedSecret = computeSharedSecret(ephemeralPrivKey, keys.viewingPublicKey);
  const stealthAddress = computeStealthAddress(keys.spendingPublicKey, sharedSecret);

  return {
    stealthAddress,
    ephemeralPubKey: bytesToHex(ephemeralPubKey),
    sharedSecret: bytesToHex(sharedSecret),
  };
}