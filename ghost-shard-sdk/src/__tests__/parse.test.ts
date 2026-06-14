import { describe, it, expect } from 'vitest';
import { parseLog } from '../parse.js';
import type { Log, Hex } from 'viem';
import { keccak256, encodeAbiParameters } from 'viem';

const EVENT_SIG = 'Announcement(uint256,address,address,bytes,bytes)';
const EVENT_TOPIC = keccak256(new TextEncoder().encode(EVENT_SIG));

function makeLog(ephemeralPubKey: Hex, metadata?: Hex): Log {
  const encoded = encodeAbiParameters(
    [
      { type: 'bytes', name: 'ephemeralPubKey' },
      { type: 'bytes', name: 'metadata' },
    ],
    [ephemeralPubKey, metadata ?? '0x'],
  );

  return {
    data: encoded,
    topics: [EVENT_TOPIC, '0x' + '00'.repeat(32) as Hex, '0x' + '00'.repeat(32) as Hex, '0x' + '00'.repeat(32) as Hex],
    address: '0x' + '00'.repeat(20) as Hex,
    blockHash: null,
    blockNumber: null,
    logIndex: null,
    transactionHash: null,
    transactionIndex: null,
    removed: false,
  } as unknown as Log;
}

describe('parseLog', () => {
  it('extracts ephemeralPubKey from a valid compressed key log', () => {
    const ephKey = ('0x02' + 'ab'.repeat(32)) as Hex;
    const log = makeLog(ephKey, '0x42');

    const parsed = parseLog(log);
    expect(parsed).not.toBeNull();
    expect(parsed!.ephemeralPubKey).toBe(ephKey);
    expect(parsed!.metadata).toBe('0x42');
  });

  it('extracts ephemeralPubKey from a valid uncompressed key log', () => {
    const ephKey = ('0x04' + 'ab'.repeat(64)) as Hex;
    const log = makeLog(ephKey, '0x42');

    const parsed = parseLog(log);
    expect(parsed).not.toBeNull();
    expect(parsed!.ephemeralPubKey).toBe(ephKey);
  });

  it('returns null for invalid pub key length (too short)', () => {
    const ephKey = ('0x1234') as Hex;
    const log = makeLog(ephKey, '0x42');

    const parsed = parseLog(log);
    expect(parsed).toBeNull();
  });

  it('returns null for malformed data', () => {
    const log = {
      data: '0xinvalid' as Hex,
      topics: [EVENT_TOPIC, '0x' + '00'.repeat(32), '0x' + '00'.repeat(32), '0x' + '00'.repeat(32)],
    } as unknown as Log;

    expect(parseLog(log)).toBeNull();
  });

  it('returns metadata as undefined when empty', () => {
    const ephKey = ('0x02' + 'ab'.repeat(32)) as Hex;
    const log = makeLog(ephKey, '0x');

    const parsed = parseLog(log);
    expect(parsed).not.toBeNull();
    expect(parsed!.ephemeralPubKey).toBe(ephKey);
    expect(parsed!.metadata).toBeUndefined();
  });
});