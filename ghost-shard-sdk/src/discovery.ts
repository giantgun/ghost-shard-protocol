/**
 * GhostShard SDK — Discovery Layer
 *
 * Handles receiving side of stealth transfers:
 *   1. Process ERC-5564 announcement logs → discover shards
 *   2. Parse embedded asset metadata + decrypt sender info
 *   3. (Spent detection handled by syncSpentShards in index.ts)
 *
 * Discovery flow: AnnouncementLog → ECDH → viewTag check (fast reject) → stealth address → asset parsing
 * ViewTag fast rejects ~255/256 false positives with a single byte comparison (ERC-5564 §4.1).
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { computeSharedSecret, computeStealthAddress } from './keys.js';
import { decryptMetadataPayload } from './announce.js';
import type { KeySet, AnnouncementLog, AssetBalance, AssetType } from './types.js';
import { bytesToBigInt, bytesToHex, Hex, hexToBytes } from 'viem';

export interface DiscoveredShard {
  address: Hex;
  ephemeralPubKey: Hex;
  assets?: AssetBalance[];
  senderInfo?: string;
}

export interface ProcessAnnouncementsResult {
  shards: DiscoveredShard[];
  processed: number;
  matches: number;
}

/**
 * Parse asset metadata from announcement bytes.
 *
 * Layout: viewTag(1) + assetType(1) + tokenAddress(20) + identifier(32) + [IV(12) + ciphertext+tag(16)]
 *
 * @returns parsed assets + senderInfo, or null if viewTag doesn't match
 */
export async function parseAssetMetadata(
  metadata: Hex,
  sharedSecret: Uint8Array,
): Promise<{ assets: AssetBalance[]; senderInfo?: string } | null> {
  const metaBytes = hexToBytes(metadata);

  if (metaBytes.length < 1) return null;
  if (metaBytes[0] !== sharedSecret[0]) return null;

  if (metaBytes.length < 54) return { assets: [] };

  const assetType = metaBytes[1];
  const tokenAddress = bytesToHex(metaBytes.slice(2, 22));
  const identifier = bytesToBigInt(metaBytes.slice(22, 54));

  const typeMap: Record<number, AssetType> = { 0: 'NATIVE', 1: 'ERC20', 2: 'ERC721' };
  const type = typeMap[assetType] ?? 'NATIVE';

  const asset: AssetBalance = type === 'ERC721'
    ? { type: 'ERC721', tokenAddress, balance: 0n, tokenIds: [identifier] }
    : type === 'ERC20'
      ? { type: 'ERC20', tokenAddress, balance: identifier }
      : { type: 'NATIVE', balance: identifier };

  let senderInfo: string | undefined;

  if (metaBytes.length >= 54 + 12 + 16) {
    try {
      senderInfo = await decryptMetadataPayload(metaBytes.slice(54), sharedSecret);
    } catch {
      // Decryption failed — malformed or tampered sender info. Assets are still valid.
    }
  }

  return { assets: [asset], senderInfo };
}

/**
 * Trial-decrypt announcement logs against the user's keys.
 *
 * For each log:
 *   1. ECDH shared secret (viewingPriv × ephemeralPub)
 *   2. ViewTag fast reject
 *   3. Derive stealth address
 *   4. Parse asset metadata + decrypt sender info
 *
 * @returns discovered shards with populated assets + senderInfo. Caller is responsible for
 *          adding to ShardStore and verifying balances on-chain.
 */
export async function processAnnouncements(
  logs: AnnouncementLog[],
  keys: KeySet,
  chunkSize = 50,
): Promise<ProcessAnnouncementsResult> {
  const shards: DiscoveredShard[] = [];
  let matches = 0;

  for (let i = 0; i < logs.length; i += chunkSize) {
    const chunk = logs.slice(i, i + chunkSize);

    const chunkPromises = chunk.map(async (log) => {
      try {
        const ephBytes = hexToBytes(log.ephemeralPubKey);

        const sharedSecret = computeSharedSecret(keys.viewingPrivateKey, ephBytes);

        if (log.metadata) {
          const metaBytes = hexToBytes(log.metadata);
          if (metaBytes.length > 0 && metaBytes[0] !== sharedSecret[0]) {
            return null;
          }
          if (metaBytes.length === 0) {
            return null;
          }
        }

        const stealthAddress = computeStealthAddress(keys.spendingPublicKey, sharedSecret);

        let assets: AssetBalance[] | undefined;
        let senderInfo: string | undefined;

        if (log.metadata) {
          const parsed = await parseAssetMetadata(log.metadata, sharedSecret);
          if (parsed) {
            assets = parsed.assets;
            senderInfo = parsed.senderInfo;
          }
        }

        return {
          address: stealthAddress,
          ephemeralPubKey: log.ephemeralPubKey,
          assets,
          senderInfo,
        };
      } catch (err) {
        console.error
      } 
    });

    const completedChunk = await Promise.all(chunkPromises);

    for (const shard of completedChunk) {
      if (shard) {
        shards.push(shard);
        matches++;
      }
    }
  }

  return { shards, processed: logs.length, matches };
}

/** Build keccak256 topic hash for ERC-5564 Announcement event. */
export function announcementTopic(): Hex {
  const hash = keccak_256(
    new TextEncoder().encode('Announcement(uint256,address,address,bytes,bytes)'),
  );
  return bytesToHex(hash);
}

/** Build event topics for known ERC-5564 event signatures. */
export function announcementTopics(): Hex[] {
  const sigs = [
    'Announcement(uint256,address,address,bytes,bytes)',
  ];
  return sigs.map((sig) => {
    const hash = keccak_256(new TextEncoder().encode(sig));
    return bytesToHex(hash);
  });
}