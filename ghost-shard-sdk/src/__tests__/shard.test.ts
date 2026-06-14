import { describe, it, expect, beforeEach } from 'vitest';
import { ShardStore } from '../shard.js';
import { makeNativeShard, makeERC20Shard, makeERC721Shard } from './helpers.js';
import type { Hex } from 'viem';

describe('ShardStore', () => {
  let store: ShardStore;

  beforeEach(() => {
    store = new ShardStore();
  });

  describe('add / getAll', () => {
    it('stores a shard and returns it via getAll', () => {
      const shard = makeNativeShard();
      store.add(shard);
      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0].address).toBe(shard.address);
    });

    it('sets pending to false on add', () => {
      const shard = makeNativeShard();
      shard.pending = true;
      store.add(shard);
      expect(store.getAll()[0].pending).toBe(false);
    });
  });

  describe('getUnspent', () => {
    it('returns only unspent and non-pending shards', () => {
      const s1 = makeNativeShard('0x0000000000000000000000000000000000000001' as Hex, 100n);
      const s2 = makeNativeShard('0x0000000000000000000000000000000000000002' as Hex, 200n);
      const s3 = makeNativeShard('0x0000000000000000000000000000000000000003' as Hex, 300n);
      store.add(s1);
      store.add(s2);
      store.add(s3);

      store.markPending([s2.address]);

      const unspent = store.getUnspent();
      expect(unspent).toHaveLength(2);
      expect(unspent.map((s) => s.address)).not.toContain(s2.address);
    });
  });

  describe('markPending / confirmFailed', () => {
    it('confirmFailed reverts pending status', () => {
      const shard = makeNativeShard();
      store.add(shard);
      store.markPending([shard.address]);

      expect(store.getUnspent()).toHaveLength(0);

      store.confirmFailed([shard.address]);
      expect(store.getUnspent()).toHaveLength(1);
    });

    it('confirmFailed removes change address if provided', () => {
      const shard = makeNativeShard();
      const changeAddr = '0x' + 'ff'.repeat(20) as Hex;
      store.add(shard);
      store.add(makeNativeShard(changeAddr, 50n));

      store.markPending([shard.address]);
      store.confirmFailed([shard.address], changeAddr);

      expect(store.get(changeAddr)).toBeUndefined();
    });
  });

  describe('removeMany', () => {
    it('removes specified shards from store', () => {
      const s1 = makeNativeShard('0x000000000000000000000000000000000000000a' as Hex, 100n);
      const s2 = makeNativeShard('0x000000000000000000000000000000000000000b' as Hex, 200n);
      store.add(s1);
      store.add(s2);

      store.removeMany([s1.address]);
      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0].address).toBe(s2.address);
    });
  });

  describe('getUnspentForAsset', () => {
    it('filters by asset type', () => {
      const native = makeNativeShard(undefined, 100n);
      const tokenAddr = '0x' + 'aa'.repeat(20) as Hex;
      const erc20 = makeERC20Shard(tokenAddr, 500n);

      store.add(native);
      store.add(erc20);

      const natives = store.getUnspentForAsset('NATIVE');
      expect(natives).toHaveLength(1);
      expect(natives[0].address).toBe(native.address);

      const erc20s = store.getUnspentForAsset('ERC20', tokenAddr);
      expect(erc20s).toHaveLength(1);
      expect(erc20s[0].address).toBe(erc20.address);
    });
  });

  describe('getBalanceForAsset', () => {
    it('sums NATIVE balances', () => {
      store.add(makeNativeShard(undefined, 100n));
      store.add(makeNativeShard(undefined, 200n));
      expect(store.getBalanceForAsset('NATIVE')).toBe(300n);
    });

    it('sums ERC20 balances by token address', () => {
      const t1 = '0x' + 'aa'.repeat(20) as Hex;
      const t2 = '0x' + 'bb'.repeat(20) as Hex;
      store.add(makeERC20Shard(t1, 100n));
      store.add(makeERC20Shard(t1, 200n));
      store.add(makeERC20Shard(t2, 500n));

      expect(store.getBalanceForAsset('ERC20', t1)).toBe(300n);
      expect(store.getBalanceForAsset('ERC20', t2)).toBe(500n);
    });
  });

  describe('getNFTs', () => {
    it('returns flat list of all NFTs across shards', () => {
      const t1 = '0x' + 'aa'.repeat(20) as Hex;
      const shard = makeERC721Shard(t1, [1n, 2n, 3n]);
      store.add(shard);

      const nfts = store.getNFTs();
      expect(nfts).toHaveLength(3);
      expect(nfts[0].tokenId).toBe(1n);
      expect(nfts[1].tokenId).toBe(2n);
      expect(nfts[2].tokenId).toBe(3n);
      expect(nfts[0].shardAddress).toBe(shard.address);
    });
  });

  describe('get', () => {
    it('returns a deep clone by address', () => {
      const shard = makeNativeShard(undefined, 100n);
      store.add(shard);

      const fetched = store.get(shard.address);
      expect(fetched).toBeDefined();
      expect(fetched!.address).toBe(shard.address);

      // Mutating the clone doesn't affect store
      fetched!.assets[0].balance = 999n;
      expect(store.get(shard.address)!.assets[0].balance).toBe(100n);
    });

    it('returns undefined for unknown address', () => {
      const addr = '0x' + 'ee'.repeat(20) as Hex;
      expect(store.get(addr)).toBeUndefined();
    });
  });

  describe('exportState / importState', () => {
    it('round-trips state correctly', () => {
      store.add(makeNativeShard(undefined, 100n));
      store.add(makeERC20Shard('0x' + 'aa'.repeat(20) as Hex, 200n));
      store.setLastSyncedBlock(12345n);

      const state = store.exportState();
      const newStore = new ShardStore();
      newStore.importState(state);

      expect(newStore.getAll()).toHaveLength(2);
      expect(newStore.getBalanceForAsset('NATIVE')).toBe(100n);
      expect(newStore.getLastSyncedBlock()).toBe(12345n);
    });
  });

  describe('setLastSyncedBlock / getLastSyncedBlock', () => {
    it('persists the last synced block', () => {
      expect(store.getLastSyncedBlock()).toBeNull();
      store.setLastSyncedBlock(99999n);
      expect(store.getLastSyncedBlock()).toBe(99999n);
    });
  });

  describe('length', () => {
    it('returns the number of shards', () => {
      expect(store.length).toBe(0);
      store.add(makeNativeShard());
      expect(store.length).toBe(1);
    });
  });
});