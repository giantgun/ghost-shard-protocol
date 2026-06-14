/**
 * GhostShard SDK — Multicall3 Batch Utilities
 *
 * Encodes/decodes calls to Multicall3's aggregate3 function.
 * Reduces N individual eth_calls to ceil(N / 300) concurrent chunks.
 *
 * Functions used:
 *   - getEthBalance(address) — Multicall3 built-in ETH balance
 *   - balanceOf(address) — ERC20 standard
 *   - ownerOf(uint256) — ERC721 standard
 *
 * Multicall3: 0xcA11bde05977b3631167028862bE2a173976CA11 (same on all chains via CREATE2)
 */
import { ERC20_ABI, ERC721_ABI, MULTICALL3_ABI, MULTICALL3_ADDRESS } from './abi.js';
import type { AssetType } from './types.js';
import { encodeFunctionData, Hex } from 'viem';

export interface Multicall3Call {
  target: Hex;
  allowFailure: boolean;
  callData: Hex;
}

export interface Multicall3Result {
  success: boolean;
  returnData: Hex;
}

export interface BalanceCall {
  shardIndex: number;
  assetIndex: number;
  type: AssetType;
  tokenAddress?: Hex;
  tokenId?: bigint;
  tokenIdIndex?: number;
}

/**
 * Build Multicall3 calls from shard assets for on-chain balance verification.
 *
 * NATIVE → Multicall3.getEthBalance(shard)
 * ERC20  → token.balanceOf(shard)
 * ERC721 → nft.ownerOf(tokenId)
 *
 * @returns calls array + mapping for result correlation
 */
export function buildBalanceVerificationBatch(
  shardAddresses: Hex[],
  assetsByShard: Array<Array<{ type: AssetType; tokenAddress?: Hex; tokenIds?: bigint[] }>>,
): { calls: Multicall3Call[]; mapping: BalanceCall[] } {
  const calls: Multicall3Call[] = [];
  const mapping: BalanceCall[] = [];

  for (let si = 0; si < shardAddresses.length; si++) {
    const addr = shardAddresses[si];
    const assets = assetsByShard[si];

    for (let ai = 0; ai < assets.length; ai++) {
      const asset = assets[ai];

      if (asset.type === 'NATIVE') {
        calls.push({
          target: MULTICALL3_ADDRESS,
          allowFailure: true,
          callData: encodeFunctionData({
            abi: MULTICALL3_ABI,
            functionName: 'getEthBalance',
            args: [addr],
          }),
        });
        mapping.push({ shardIndex: si, assetIndex: ai, type: 'NATIVE' });
      } else if (asset.type === 'ERC20' && asset.tokenAddress) {
        calls.push({
          target: asset.tokenAddress,
          allowFailure: true,
          callData: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [addr],
          }),
        });
        mapping.push({ shardIndex: si, assetIndex: ai, type: 'ERC20', tokenAddress: asset.tokenAddress });
      } else if (asset.type === 'ERC721' && asset.tokenAddress && asset.tokenIds) {
        for (let ti = 0; ti < asset.tokenIds.length; ti++) {
          calls.push({
            target: asset.tokenAddress,
            allowFailure: true,
            callData: encodeFunctionData({
              abi: ERC721_ABI,
              functionName: 'ownerOf',
              args: [asset.tokenIds[ti]],
            }),
          });
          mapping.push({
            shardIndex: si,
            assetIndex: ai,
            type: 'ERC721',
            tokenAddress: asset.tokenAddress,
            tokenId: asset.tokenIds[ti],
            tokenIdIndex: ti,
          });
        }
      }
    }
  }

  return { calls, mapping };
}