/**
 * GhostShard SDK — ERC-5564 Announcement + Metadata Packing
 *
 * Two responsibilities:
 *   1. Build ABI-encoded announce() calldata for ERC-5564
 *   2. Pack asset metadata + encrypted sender info into the announcement's bytes field
 *
 * Metadata layout (packed into `metadata` bytes field):
 *   Byte 0:       viewTag (1B)         — keccak256(sharedSecret)[0], fast reject
 *   Byte 1:       assetType (1B)       — 0=NATIVE, 1=ERC20, 2=ERC721
 *   Bytes 2-21:   tokenAddress (20B)   — 0x00..00 for NATIVE
 *   Bytes 22-53:  identifier (32B)     — uint256 amount (NATIVE/ERC20) or tokenId (ERC721)
 *   Bytes 54-65:  IV (12B)             — AES-GCM initialization vector
 *   Bytes 66+:    ciphertext + 16B tag — AES-GCM encrypted senderInfo
 */
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import type { AnnounceTransaction, AssetType } from './types.js';
import { encodeFunctionData, numberToBytes, bytesToHex, hexToBytes, Hex } from 'viem';
import { ERC5564_ANNOUNCE_ABI } from './abi.js';

/** Derive AES-GCM key from ECDH shared secret via HKDF. */
function deriveMetadataKey(sharedSecret: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, new Uint8Array(32), 'ghost-shard-metadata', 32);
}

/**
 * Pack asset info and optional senderInfo into metadata bytes.
 * Returns single viewTag byte if assetInfo is omitted (fast rejection only, no asset metadata).
 *
 * @param sharedSecret - Master secret for viewTag and key derivation
 * @param assetInfo - Asset metadata for the 54-byte header
 * @param senderInfo - Optional sender identity, encrypted via AES-GCM
 */
export async function packMetadata(
  sharedSecret: Uint8Array,
  assetInfo?: {
    type: AssetType;
    tokenAddress?: Hex;
    amount?: bigint;
    tokenId?: bigint;
  },
  senderInfo?: string,
): Promise<Uint8Array> {
  const viewTag = sharedSecret[0];

  if (!assetInfo) {
    return new Uint8Array([viewTag]);
  }

  const assetTypeMap: Record<AssetType, number> = { NATIVE: 0, ERC20: 1, ERC721: 2 };
  const aty = assetTypeMap[assetInfo.type];

  const tokenAddr = assetInfo.type === 'NATIVE'
    ? new Uint8Array(20)
    : hexToBytes(assetInfo.tokenAddress ?? '0x0000000000000000000000000000000000000000');

  const identifier = assetInfo.type === 'ERC721'
    ? (assetInfo.tokenId ?? 0n)
    : (assetInfo.amount ?? 0n);

  const identifierBytes = numberToBytes(identifier, { size: 32 });

  const metadata = new Uint8Array(54);
  metadata[0] = viewTag;
  metadata[1] = aty;
  metadata.set(tokenAddr, 2);
  metadata.set(identifierBytes, 22);

  if (senderInfo && senderInfo.length > 0) {
    const rawKeyBytes = deriveMetadataKey(sharedSecret);

    const strictBuffer = new ArrayBuffer(rawKeyBytes.byteLength);
    new Uint8Array(strictBuffer).set(rawKeyBytes);

    const aesKey = await crypto.subtle.importKey(
      "raw",
      strictBuffer,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(senderInfo);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      plaintext
    );
    const ciphertext = new Uint8Array(ciphertextBuffer);

    const withSender = new Uint8Array(metadata.length + iv.length + ciphertext.length);
    withSender.set(metadata, 0);
    withSender.set(iv, metadata.length);
    withSender.set(ciphertext, metadata.length + iv.length);

    return withSender;
  }

  return metadata;
}

/**
 * Decrypt senderInfo from trailing bytes of metadata payload.
 * Uses AES-GCM (authenticated encryption) — throws if key is wrong or data is tampered with.
 */
export async function decryptMetadataPayload(
  encrypted: Uint8Array,
  sharedSecret: Uint8Array,
): Promise<string> {
  const headerOffset = encrypted.length > 54 && encrypted[0] === sharedSecret[0] ? 54 : 0;

  const ivOffset = headerOffset;
  const iv = encrypted.slice(ivOffset, ivOffset + 12);

  const ciphertext = encrypted.slice(ivOffset + 12);

  const rawKeyBytes = deriveMetadataKey(sharedSecret);

  const strictBuffer = new ArrayBuffer(rawKeyBytes.byteLength);
  new Uint8Array(strictBuffer).set(rawKeyBytes);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    strictBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(plaintextBuffer);
}

export interface AnnounceOpts {
  /** Shared secret from generateStealthAddress(). Required for viewTag + encryption. */
  sharedSecret?: Hex;
  /** Asset metadata to embed (type, token, amount/tokenId). */
  assetInfo?: {
    type: AssetType;
    tokenAddress?: Hex;
    amount?: bigint;
    tokenId?: bigint;
  };
  /** Sender identity encrypted into metadata. Only the recipient can read it. */
  senderInfo?: string;
}

/**
 * Build ABI-encoded calldata for ERC-5564 announce().
 *
 * Contract: announce(uint256 schemeId, address stealthAddress, bytes ephemeralPubKey, bytes metadata)
 */
export async function prepareAnnounceTransfer(
  stealthAddress: Hex,
  ephemeralPubKey: Hex,
  announcerAddress: Hex,
  schemeId: number = 1,
  opts?: AnnounceOpts,
): Promise<AnnounceTransaction> {
  let metaHex: Hex = '0x';
  if (opts?.sharedSecret) {
    const ss = hexToBytes(opts.sharedSecret);
    const metadataBytes = await packMetadata(ss, opts.assetInfo, opts.senderInfo);

    if (metadataBytes.length > 0) {
      metaHex = bytesToHex(metadataBytes);
    }
  }

  const data = encodeFunctionData({
    abi: ERC5564_ANNOUNCE_ABI,
    functionName: 'announce',
    args: [BigInt(schemeId), stealthAddress, ephemeralPubKey, metaHex],
  });

  return {
    to: announcerAddress,
    data,
  };
}