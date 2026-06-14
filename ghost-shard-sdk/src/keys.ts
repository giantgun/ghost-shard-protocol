import { keccak_256 } from '@noble/hashes/sha3';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { GhostIdentitySigner, KeySet } from './types.js';
import { Account, bytesToHex, Chain, createClient, publicActions, Hex, hexToBytes, http, createWalletClient } from 'viem';

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) + BigInt(b);
  return result;
}

function bigIntToBytes(n: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) { bytes[i] = Number(n & 0xffn); n >>= 8n; }
  return bytes;
}

const GHOST_IDENTITY_TYPE = [
  { name: 'account', type: 'address' },
];

const EIP712_DOMAIN = {
  name: 'GhostShard',
  version: '1',
  chainId: 1,
  verifyingContract: '0x0000000000000000000000000000000000000000' as Hex,
};

const SPENDING_KEY_INFO = 'ghost-shard-spending-key';
const VIEWING_KEY_INFO = 'ghost-shard-viewing-key';
const DB_ENCRYPTION_KEY_INFO = 'ghost-shard-db-encryption-key';

/**
 * Derive root entropy seed from the signer's EIP-712 signature.
 */
export async function entropyFromEIP712(
  signer: GhostIdentitySigner,
  chainId: number,
): Promise<{ rootSeed: Uint8Array; account: Hex }> {
  const account = signer.address;

  const domain = { ...EIP712_DOMAIN, chainId };
  const types = { GhostIdentity: GHOST_IDENTITY_TYPE };
  const message = { account };

  if (!signer.signTypedData) {
    throw new Error('Signer must implement signTypedData for EIP-712 key derivation');
  }

  // Executes using whatever wallet infrastructure the developer passed in
  const signature = await signer.signTypedData({
    domain,
    types,
    primaryType: 'GhostIdentity',
    message,
  });

  const sigBytes = hexToBytes(signature);
  const rootSeed = keccak_256(sigBytes);

  return { rootSeed, account };
}

/**
 * Normalize a 32-byte key into a valid secp256k1 private key.
 */
function normalizePrivateKey(key: Uint8Array): Uint8Array {
  const n = secp256k1.Point.CURVE().n;
  let candidate = key;
  for (let i = 0; i < 100; i++) {
    // Fixed: Bypassed invalid bytesToHex conversion
    const k = bytesToBigInt(candidate);
    if (k > 0n && k < n) return candidate;
    candidate = keccak_256(candidate);
  }
  throw new Error('normalizePrivateKey failed after 100 iterations');
}

/**
 * Derive full keypair set from root seed via HKDF(sha256).
 */
export function deriveKeys(rootSeed: Uint8Array): KeySet {
  const spendingPrivateKey = normalizePrivateKey(
    hkdf(sha256, rootSeed, new Uint8Array(), SPENDING_KEY_INFO, 32),
  );
  const viewingPrivateKey = normalizePrivateKey(
    hkdf(sha256, rootSeed, new Uint8Array(), VIEWING_KEY_INFO, 32),
  );
  const dbEncryptionKey = hkdf(sha256, rootSeed, new Uint8Array(), DB_ENCRYPTION_KEY_INFO, 32);

  const spendingPublicKey = secp256k1.getPublicKey(spendingPrivateKey, true);
  const viewingPublicKey = secp256k1.getPublicKey(viewingPrivateKey, true);

  return { spendingPrivateKey, spendingPublicKey, viewingPrivateKey, viewingPublicKey, dbEncryptionKey };
}

export function computeSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Uint8Array {
  // 1. Get the UNCOMPRESSED shared point (65 bytes: 0x04 || X-coord || Y-coord)
  const sharedPoint = secp256k1.getSharedSecret(privateKey, publicKey, false);

  // 2. Extract ONLY the 32-byte X-coordinate (bytes 1 to 33)
  const xCoordinate = sharedPoint.slice(1, 33);

  // 3. Hash the raw X-coordinate using Keccak256
  const sharedSecretHash = keccak_256(xCoordinate);

  return sharedSecretHash;
}

export function deriveShardPrivateKey(
  spendingPrivateKey: Uint8Array,
  sharedSecret: Uint8Array,
): Uint8Array {
  const n = secp256k1.Point.CURVE().n;
  const s = bytesToBigInt(spendingPrivateKey);
  const h = bytesToBigInt(sharedSecret);
  const shardPriv = (s + h) % n;
  return bigIntToBytes(shardPriv, 32);
}

export function deriveStealthPublicKey(
  spendingPublicKey: Uint8Array,
  sharedSecret: Uint8Array,
): Uint8Array {
  const spendingPoint = secp256k1.Point.fromHex(spendingPublicKey);
  const hashScalar = bytesToBigInt(sharedSecret);
  const hashPoint = secp256k1.Point.BASE.multiply(hashScalar);
  const stealthPoint = spendingPoint.add(hashPoint);
  return stealthPoint.toBytes(false);
}

function pointToEthereumAddress(point: Uint8Array): Hex {
  const hash = keccak_256(point.slice(1));
  return bytesToHex(hash.slice(12));
}

export function computeStealthAddress(
  spendingPublicKey: Uint8Array,
  sharedSecret: Uint8Array,
): Hex {
  const stealthPubKey = deriveStealthPublicKey(spendingPublicKey, sharedSecret);
  return pointToEthereumAddress(stealthPubKey);
}
