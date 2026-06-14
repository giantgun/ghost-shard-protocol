/**
 * GhostShard SDK — ABI Log Parsing Utilities
 *
 * Pure functions for parsing ERC-5564 announcement logs.
 * No RPC or network dependencies.
 *
 * ERC-5564 Announcement event:
 *   event Announcement(uint256 indexed schemeId, address indexed stealthAddress,
 *                       address indexed caller, bytes ephemeralPubKey, bytes metadata)
 *
 * topics[0] = event sig hash, topics[1] = schemeId, topics[2] = stealthAddress, topics[3] = caller
 * ephemeralPubKey + metadata are ABI-encoded dynamic bytes in the data field.
 */
import { decodeEventLog } from 'viem/utils';
import type { AnnouncementLog } from './types.js';
import { Hex, isHex, Log, size } from 'viem';
import { ERC5564_ANNOUNCE_ABI } from './abi.js';

/**
 * Parse an ERC-5564 announcement log into ephemeralPubKey metadata.
 */
export function parseLog(log: Log): AnnouncementLog | null {
  try {
    const decoded = decodeEventLog({
      abi: ERC5564_ANNOUNCE_ABI,
      data: log.data,
      topics: log.topics,
    });

    const { ephemeralPubKey, metadata } = decoded.args as {
      ephemeralPubKey: Hex;
      metadata: Hex;
    };

    const byteSize = size(ephemeralPubKey);
    if (byteSize !== 33 && byteSize !== 65) return null;

    if (metadata && isHex(metadata) && size(metadata) > 0) {
      return { ephemeralPubKey, metadata };
    }

    return { ephemeralPubKey };
  } catch {
    return null;
  }
}