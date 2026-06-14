import { describe, it, expect } from 'vitest';
import { buildBalanceVerificationBatch } from '../multicall.js';
import { MULTICALL3_ADDRESS } from '../abi.js';
import type { Hex } from 'viem';
import { decodeFunctionData } from 'viem';
import { ERC20_ABI, ERC721_ABI, MULTICALL3_ABI } from '../abi.js';

describe('buildBalanceVerificationBatch', () => {
  const shardAddresses: Hex[] = [
    '0x' + '11'.repeat(20) as Hex,
    '0x' + '22'.repeat(20) as Hex,
  ];

  it('creates getEthBalance calls for NATIVE assets', () => {
    const { calls, mapping } = buildBalanceVerificationBatch(
      [shardAddresses[0]],
      [[{ type: 'NATIVE' }]],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].target).toBe(MULTICALL3_ADDRESS);
    expect(calls[0].allowFailure).toBe(true);

    const decoded = decodeFunctionData({
      abi: MULTICALL3_ABI,
      data: calls[0].callData,
    });
    expect(decoded.functionName).toBe('getEthBalance');
    expect(decoded.args![0]).toBe(shardAddresses[0]);

    expect(mapping).toHaveLength(1);
    expect(mapping[0].type).toBe('NATIVE');
    expect(mapping[0].shardIndex).toBe(0);
    expect(mapping[0].assetIndex).toBe(0);
  });

  it('creates balanceOf calls for ERC20 assets', () => {
    const tokenAddr = '0x' + 'aa'.repeat(20) as Hex;
    const { calls, mapping } = buildBalanceVerificationBatch(
      [shardAddresses[0]],
      [[{ type: 'ERC20', tokenAddress: tokenAddr }]],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].target).toBe(tokenAddr);

    const decoded = decodeFunctionData({
      abi: ERC20_ABI,
      data: calls[0].callData,
    });
    expect(decoded.functionName).toBe('balanceOf');
    expect(decoded.args![0]).toBe(shardAddresses[0]);

    expect(mapping[0].type).toBe('ERC20');
    expect(mapping[0].tokenAddress).toBe(tokenAddr);
  });

  it('creates ownerOf calls for ERC721 assets', () => {
    const tokenAddr = '0x' + 'bb'.repeat(20) as Hex;
    const { calls, mapping } = buildBalanceVerificationBatch(
      [shardAddresses[0]],
      [[{ type: 'ERC721', tokenAddress: tokenAddr, tokenIds: [1n, 2n] }]],
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].target).toBe(tokenAddr);
    expect(calls[1].target).toBe(tokenAddr);

    const decoded0 = decodeFunctionData({
      abi: ERC721_ABI,
      data: calls[0].callData,
    });
    expect(decoded0.functionName).toBe('ownerOf');
    expect(decoded0.args![0]).toBe(1n);

    const decoded1 = decodeFunctionData({
      abi: ERC721_ABI,
      data: calls[1].callData,
    });
    expect(decoded1.functionName).toBe('ownerOf');
    expect(decoded1.args![0]).toBe(2n);

    expect(mapping).toHaveLength(2);
    expect(mapping[0].tokenId).toBe(1n);
    expect(mapping[0].tokenIdIndex).toBe(0);
    expect(mapping[1].tokenId).toBe(2n);
    expect(mapping[1].tokenIdIndex).toBe(1);
  });

  it('handles mixed asset types across multiple shards', () => {
    const tokenAddr = '0x' + 'cc'.repeat(20) as Hex;
    const { calls, mapping } = buildBalanceVerificationBatch(
      shardAddresses,
      [
        [{ type: 'NATIVE' }, { type: 'ERC20', tokenAddress: tokenAddr }],
        [{ type: 'ERC721', tokenAddress: tokenAddr, tokenIds: [7n] }],
      ],
    );

    // shard 0: NATIVE (1) + ERC20 (1) = 2
    // shard 1: ERC721 with 1 tokenId = 1
    expect(calls).toHaveLength(3);
    expect(mapping).toHaveLength(3);

    expect(mapping[0].shardIndex).toBe(0);
    expect(mapping[0].type).toBe('NATIVE');

    expect(mapping[1].shardIndex).toBe(0);
    expect(mapping[1].type).toBe('ERC20');

    expect(mapping[2].shardIndex).toBe(1);
    expect(mapping[2].type).toBe('ERC721');
  });

  it('returns empty arrays for empty inputs', () => {
    const { calls, mapping } = buildBalanceVerificationBatch([], []);
    expect(calls).toHaveLength(0);
    expect(mapping).toHaveLength(0);
  });
});