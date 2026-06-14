import { describe, it, expect } from 'vitest';
import { selectCoins, shuffle, generateSplitsForShard } from '../coinSelection.js';
import { makeNativeShard, makeERC20Shard, makeERC721Shard } from './helpers.js';
import type { Hex } from 'viem';

describe('shuffle', () => {
  it('preserves all elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle([...arr]);
    expect(shuffled).toHaveLength(arr.length);
    expect(shuffled.sort()).toEqual(arr);
  });

  it('returns empty array for empty input', () => {
    expect(shuffle([])).toEqual([]);
  });
});

describe('generateSplitsForShard', () => {
  it('returns empty array for zero amount', () => {
    expect(generateSplitsForShard(0n, 3, 10000n)).toEqual([]);
  });

  it('returns single element for dust amount', () => {
    const result = generateSplitsForShard(500n, 3, 10000n);
    expect(result).toEqual([500n]);
  });

  it('sum of splits equals input amount', () => {
    const result = generateSplitsForShard(1000000n, 3, 10000n);
    const sum = result.reduce((a, b) => a + b, 0n);
    expect(sum).toBe(1000000n);
  });

  it('respects maxOutputs limit', () => {
    const result = generateSplitsForShard(1000000n, 1, 10000n);
    expect(result).toHaveLength(1);
  });
});

describe('selectCoins - NATIVE', () => {
  it('selects sufficient shards to meet amount', () => {
    const shards = [
      makeNativeShard(undefined, 100n),
      makeNativeShard(undefined, 200n),
      makeNativeShard(undefined, 300n),
    ];

    const result = selectCoins(shards, { type: 'NATIVE', to: '0x' + '11'.repeat(20) as Hex, amount: 250n });

    expect(result.totalSelected).toBe(250n);
    expect(result.shards.length).toBeGreaterThanOrEqual(1);
    // Every selected shard has payment splits
    expect(result.paymentSplitsByShard.length).toBe(result.shards.length);
    expect(result.changeSplitsByShard.length).toBe(result.shards.length);
  });

  it('selects all shards for amount exceeding total balance', () => {
    const shards = [
      makeNativeShard(undefined, 100n),
      makeNativeShard(undefined, 200n),
    ];

    expect(() => selectCoins(shards, { type: 'NATIVE', to: '0x' + '11'.repeat(20) as Hex, amount: 500n }))
      .toThrow('Insufficient NATIVE balance');
  });

  it('payment + change sum equals shard balance for each shard', () => {
    const shards = [
      makeNativeShard(undefined, 500000n),
      makeNativeShard(undefined, 700000n),
    ];

    const result = selectCoins(shards, { type: 'NATIVE', to: '0x' + '11'.repeat(20) as Hex, amount: 600000n });

    for (let i = 0; i < result.shards.length; i++) {
      const shard = result.shards[i];
      const nativeBalance = shard.assets.find((a) => a.type === 'NATIVE')!.balance;
      const paySum = result.paymentSplitsByShard[i].reduce((a, b) => a + b, 0n);
      const changeSum = result.changeSplitsByShard[i].reduce((a, b) => a + b, 0n);
      expect(paySum + changeSum).toBe(nativeBalance);
    }
  });
});

describe('selectCoins - ERC20', () => {
  it('selects shards with matching token', () => {
    const t1 = '0x' + 'aa'.repeat(20) as Hex;
    const t2 = '0x' + 'bb'.repeat(20) as Hex;
    const shards = [
      makeERC20Shard(t1, 1000n),
      makeERC20Shard(t2, 9999n),
      makeERC20Shard(t1, 500n),
    ];

    const result = selectCoins(shards, { type: 'ERC20', tokenAddress: t1, amount: 800n, to: '0x' + '11'.repeat(20) as Hex });

    expect(result.totalSelected).toBe(800n);
    // Only shards with t1 should be selected
    for (const shard of result.shards) {
      const hasT1 = shard.assets.some((a) => a.type === 'ERC20' && a.tokenAddress === t1);
      expect(hasT1).toBe(true);
    }
  });

  it('throws on insufficient balance', () => {
    const t1 = '0x' + 'aa'.repeat(20) as Hex;
    const shards = [makeERC20Shard(t1, 100n)];

    expect(() => selectCoins(shards, { type: 'ERC20', tokenAddress: t1, amount: 999n, to: '0x' + '11'.repeat(20) as Hex }))
      .toThrow('Insufficient ERC20 balance');
  });
});

describe('selectCoins - ERC721', () => {
  it('selects the exact shard holding the tokenId', () => {
    const t1 = '0x' + 'aa'.repeat(20) as Hex;
    const shards = [
      makeERC721Shard(t1, [1n, 2n]),
      makeERC721Shard(t1, [3n]),
    ];

    const result = selectCoins(shards, { type: 'ERC721', tokenAddress: t1, tokenId: 2n, to: '0x' + '00'.repeat(20) as Hex });

    expect(result.shards).toHaveLength(1);
    expect(result.totalSelected).toBe(1n);
  });

  it('throws when tokenId not found', () => {
    const t1 = '0x' + 'aa'.repeat(20) as Hex;
    const shards = [makeERC721Shard(t1, [1n])];

    expect(() => selectCoins(shards, { type: 'ERC721', tokenAddress: t1, tokenId: 99n, to: '0x' + '00'.repeat(20) as Hex }))
      .toThrow(/No shard found/);
  });
});