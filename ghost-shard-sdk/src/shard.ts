/**
 * GhostShard SDK — UTXO Shard Store
 *
 * In-memory store for UTXO-style shards with lifecycle management
 * (add, markPending, removeMany, confirmFailed) and queries
 * (getUnspent, getBalanceForAsset, getNFTs).
 */
import { isAddressEqual, type Hex } from 'viem';
import type { Shard, AssetType, NFT, PersistedState } from './types.js';

export class ShardStore {
  private shards: Shard[] = [];
  private lastSyncedBlock: bigint | null = null;

  getLastSyncedBlock(): bigint | null {
    return this.lastSyncedBlock;
  }

  setLastSyncedBlock(blockNumber: bigint): void {
    this.lastSyncedBlock = blockNumber;
  }

  private cloneShard(shard: Shard): Shard {
    return {
      ...shard,
      assets: shard.assets.map((a) => {
        if (a.type === 'ERC721') {
          return { ...a, tokenIds: [...a.tokenIds] };
        }
        return { ...a };
      }),
    };
  }

  private hasAddress(addresses: Hex[], target: Hex): boolean {
    return addresses.some((addr) => isAddressEqual(addr, target));
  }

  add(shard: Shard): void {
    // Explicitly guard against duplicate insertions of the same shard address
    if (this.shards.some((s) => isAddressEqual(s.address, shard.address))) {
      return;
    }
    const cloned = this.cloneShard(shard);
    cloned.pending = false;
    this.shards.push(cloned);
  }

  addMany(shards: Shard[]): void {
    for (const s of shards) this.add(s);
  }

  getUnspent(): Shard[] {
    return this.shards.filter((s) => !s.spent && !s.pending);
  }

  getUnspentForAsset(type: AssetType, tokenAddress?: Hex, tokenId?: bigint): Shard[] {
    return this.getUnspent().filter((s) =>
      s.assets.some((a) => {
        if (a.type !== type) return false;
        if (a.type === 'NATIVE') return true;
        if (!tokenAddress || !isAddressEqual(a.tokenAddress, tokenAddress)) return false;
        if (a.type === 'ERC721' && tokenId !== undefined) {
          return a.tokenIds.includes(tokenId);
        }
        return true;
      }),
    );
  }

  getBalanceForAsset(type: AssetType, tokenAddress?: Hex): bigint {
    // Leverage getUnspentForAsset directly to eliminate duplicate filtering logic
    const shards = this.getUnspentForAsset(type, tokenAddress);

    return shards.reduce((sum, s) => {
      const matchingAssetsSum = s.assets
        .filter((a) => {
          if (a.type !== type) return false;
          if (a.type === 'NATIVE' || !tokenAddress) return true;
          return isAddressEqual(a.tokenAddress, tokenAddress);
        })
        .reduce((subSum, a) => {
          return subSum + (a.type === 'ERC721' ? BigInt(a.tokenIds.length) : a.balance);
        }, 0n);

      return sum + matchingAssetsSum;
    }, 0n);
  }

  getNFTs(): NFT[] {
    const result: NFT[] = [];
    for (const shard of this.getUnspent()) {
      for (const asset of shard.assets) {
        if (asset.type !== 'ERC721') continue;
        for (const tokenId of asset.tokenIds) {
          result.push({
            shardAddress: shard.address,
            tokenAddress: asset.tokenAddress,
            tokenId,
          });
        }
      }
    }
    return result;
  }

  get(address: Hex): Shard | undefined {
    const matched = this.shards.find((s) => isAddressEqual(s.address, address));
    return matched ? this.cloneShard(matched) : undefined;
  }

  getAll(): Shard[] {
    return this.shards.map((s) => this.cloneShard(s));
  }

  exportState(): PersistedState {
    return {
      shards: this.getAll(),
      lastSyncedBlock: this.lastSyncedBlock,
    };
  }

  importState(state: PersistedState): void {
    this.shards = state.shards.map((s) => this.cloneShard(s));
    this.lastSyncedBlock = state.lastSyncedBlock;
  }

  /** Mark shards as pending — tx submitted but not confirmed. */
  markPending(addresses: Hex[]): void {
    for (const shard of this.shards) {
      if (this.hasAddress(addresses, shard.address)) {
        shard.pending = true;
      }
    }
  }

  /** Permanently remove shards from store by address. */
  removeMany(addresses: Hex[]): void {
    this.shards = this.shards.filter((s) => !this.hasAddress(addresses, s.address));
  }

  /** Revert pending status on failure. Removes change shard if provided. */
  confirmFailed(addresses: Hex[], changeAddress?: Hex): void {
    for (const shard of this.shards) {
      if (this.hasAddress(addresses, shard.address)) {
        shard.pending = false;
      }
    }
    if (changeAddress) {
      this.shards = this.shards.filter((s) => !isAddressEqual(s.address, changeAddress));
    }
  }

  get length(): number {
    return this.shards.length;
  }
}