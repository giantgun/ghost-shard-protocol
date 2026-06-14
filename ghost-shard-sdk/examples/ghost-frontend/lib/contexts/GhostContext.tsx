"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { GhostClient, Shard, GhostIdentitySigner, AssetBalance, ERC20Balance, GhostTransactionSigner, TransferRequest, PrivateTransferRequest, MeshExecutionResult } from "@ghost-shard/sdk";
import { arbitrumSepolia } from "viem/chains";
import { useAccount, useSignTypedData, useSignMessage } from "wagmi";
import { shardLocalStorage } from "../storage";

export type AssetType = "NATIVE" | "ERC20" | "ERC721";

export interface ShardWithAssets extends Shard {
  displayAssets: AssetBalance[];
}

interface GhostContextType {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  ghost: GhostClient | null;
  metaAddress: string | null;
  shards: ShardWithAssets[];
  isSyncing: boolean;
  isSending: boolean; // Added sending state
  lastSyncTime: number | null;
  userAddress: string | null;
  viewingKey: string | null;
  spendingKey: string | null;
  showComplianceKeys: boolean;

  // Filter states
  assetTypeFilter: AssetType | "ALL";
  tokenAddressFilter: string | null;
  tokenIdFilter: string | null;

  // Computed balances
  filteredShards: ShardWithAssets[];
  discoveredTokenAddresses: string[];
  balanceSummary: {
    totalNativeBalance: bigint;
    ethShardCount: number;
    erc20Shards: Map<string, { balance: bigint; shards: ShardWithAssets[] }>;
    erc721Collections: Map<string, { nfts: ShardWithAssets[] }>;
    erc20TokenCount: number;
  };

  // Methods
  initializeGhost: () => Promise<void>;
  syncWithChain: () => Promise<void>;
  sendAsset: (txParams: TransferRequest | PrivateTransferRequest) => Promise<MeshExecutionResult & { txHash: `0x${string}` }>; // Added send method
  setAssetTypeFilter: (type: AssetType | "ALL") => void;
  setTokenAddressFilter: (address: string | null) => void;
  setTokenIdFilter: (id: string | null) => void;
  toggleComplianceKeys: () => void;
  startAutoSync: () => void;
  stopAutoSync: () => void;
  clearError: () => void;
  disconnect: () => Promise<void>;
}

const GhostContext = createContext<GhostContextType | undefined>(undefined);

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL;
const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_URL;

export function GhostProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ghost, setGhost] = useState<GhostClient | null>(null);
  const [metaAddress, setMetaAddress] = useState<string | null>(null);
  const [shards, setShards] = useState<ShardWithAssets[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSending, setIsSending] = useState(false); // Added sending state
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [spendingKey, setSpendingKey] = useState<string | null>(null);
  const [showComplianceKeys, setShowComplianceKeys] = useState(false);

  // Filter states
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetType | "ALL">("ALL");
  const [tokenAddressFilter, setTokenAddressFilter] = useState<string | null>(null);
  const [tokenIdFilter, setTokenIdFilter] = useState<string | null>(null);

  const autoSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { signMessageAsync } = useSignMessage();

  // Helper: Extract unique token addresses from shards
  const extractTokenAddresses = useCallback((shardsData: ShardWithAssets[]) => {
    const tokens = new Set<string>();
    shardsData.forEach((shard) => {
      shard.displayAssets.forEach((asset) => {
        if (asset.type === "ERC20" || asset.type === "ERC721") {
          if (asset.tokenAddress) {
            tokens.add(asset.tokenAddress.toLowerCase());
          }
        }
      });
    });
    return Array.from(tokens);
  }, []);

  // Helper: Compute balance summary
  const computeBalanceSummary = useCallback(
    (shardsData: ShardWithAssets[]) => {
      let totalNativeBalance = 0n;
      let ethShardCount = 0;
      const erc20Map = new Map<string, { balance: bigint; shards: ShardWithAssets[] }>();
      const erc721Map = new Map<string, { nfts: ShardWithAssets[] }>();

      let erc20count = 0;
      shardsData.forEach((shard) => {
        shard.displayAssets.forEach((asset) => {
          if (asset.type === "NATIVE") {
            totalNativeBalance += asset.balance;
            ethShardCount += 1;
          } else if (asset.type === "ERC20") {
            const tokenAddr = asset.tokenAddress?.toLowerCase() || "";
            if (!erc20Map.has(tokenAddr)) {
              erc20Map.set(tokenAddr, { balance: 0n, shards: [] });
            }
            const entry = erc20Map.get(tokenAddr)!;
            entry.balance += asset.balance;
            entry.shards.push(shard);
            erc20count += 1;
          } else if (asset.type === "ERC721") {
            const tokenAddr = asset.tokenAddress?.toLowerCase() || "";
            if (!erc721Map.has(tokenAddr)) {
              erc721Map.set(tokenAddr, { nfts: [] });
            }
            erc721Map.get(tokenAddr)!.nfts.push(shard);
          }
        });
      });

      return {
        totalNativeBalance,
        ethShardCount,
        erc20Shards: erc20Map,
        erc721Collections: erc721Map,
        erc20TokenCount: erc20count,
      };
    },
    []
  );

  // Helper: Filter shards based on active filters
  const applyFilters = useCallback(
    (shardsData: ShardWithAssets[]) => {
      return shardsData.filter((shard) => {
        // Filter by asset type
        if (assetTypeFilter !== "ALL") {
          const hasAssetType = shard.displayAssets.some((a) => a.type === assetTypeFilter);
          if (!hasAssetType) return false;
        }

        // Filter by token address (ERC20/ERC721)
        if (tokenAddressFilter) {
          const hasToken = shard.displayAssets.some(
            (a) => (a as ERC20Balance).tokenAddress?.toLowerCase() === tokenAddressFilter.toLowerCase()
          );
          if (!hasToken) return false;
        }

        // Filter by token ID (ERC721)
        if (tokenIdFilter) {
          const hasTokenId = shard.displayAssets.some(
            (a) => a.type === "ERC721" && a.tokenIds?.some((id) => id.toString() === tokenIdFilter)
          );
          if (!hasTokenId) return false;
        }

        return true;
      });
    },
    [assetTypeFilter, tokenAddressFilter, tokenIdFilter]
  );

  const syncWithChain = useCallback(async () => {
    if (!ghost) return;

    try {
      setIsSyncing(true);
      await ghost.syncWithChain();
      const ghostShards = ghost.getShards();
      const shardsWithAssets: ShardWithAssets[] = ghostShards.map((shard) => ({
        ...shard,
        displayAssets: shard.assets || [],
      }));
      setShards(shardsWithAssets);
      setLastSyncTime(Date.now());
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Sync failed";
      setError(errorMsg);
      console.error("[GhostContext] Sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [ghost]);

  const initializeGhost = useCallback(async () => {
    if (!isConnected || !address) {
      setError("Wallet not connected");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { GhostClient } = await import("@ghost-shard/sdk");
      
      const ghostClient = new GhostClient({
        chain: arbitrumSepolia,
        rpcUrl,
        paymasterUrl,
        relayerUrl,
        startBlock: 19500000n,
        storage: shardLocalStorage
      } as any);

      const identitySigner: GhostIdentitySigner = {
        address: address,
        signTypedData: signTypedDataAsync,
      };

      await ghostClient.init(identitySigner);
      const meta = ghostClient.getMetaAddress();

      const viewing =
        ghostClient.keys && ghostClient.keys.viewingPrivateKey
          ? "0x" + Array.from(ghostClient.keys.viewingPrivateKey).map((b: any) => b.toString(16).padStart(2, "0")).join("")
          : "N/A";

      const spending =
        ghostClient.keys && ghostClient.keys.spendingPrivateKey
          ? "0x" + Array.from(ghostClient.keys.spendingPrivateKey).map((b: any) => b.toString(16).padStart(2, "0")).join("")
          : "N/A";

      setGhost(ghostClient);
      setMetaAddress(meta);
      setUserAddress(address);
      setViewingKey(viewing);
      setSpendingKey(spending);
      setIsInitialized(true);

      await syncWithChain();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to initialize";
      setError(errorMsg);
      console.error("[GhostContext] Init error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected, signTypedDataAsync, syncWithChain]);

  // NEW: Sending functionality
  const sendAsset = useCallback(
    async (txParams: TransferRequest | PrivateTransferRequest) => {
      if (!ghost || !address) {
        const errorMsg = "Ghost client or wallet not initialized";
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      setIsSending(true);
      setError(null);

      try {
        // Reconstruct the signer for Wagmi/Browser
        const txSigner: GhostTransactionSigner = {
          address: address,
          signMessage: signMessageAsync,
        };

        const tx = await ghost.relayTransfer(txParams, txSigner);

        const receipt = await tx.wait();

        return {...receipt, txHash: tx.transactionHash};
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Transfer failed";
        setError(errorMsg);
        console.error("[GhostContext] Transfer error:", err);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [ghost, address, signTypedDataAsync, syncWithChain]
  );

  const toggleComplianceKeys = useCallback(() => {
    setShowComplianceKeys((prev) => !prev);
  }, []);

  const startAutoSync = useCallback(() => {
    if (autoSyncIntervalRef.current) return;
    autoSyncIntervalRef.current = setInterval(() => {
      syncWithChain();
    }, 15000);
  }, [syncWithChain]);

  const stopAutoSync = useCallback(() => {
    if (autoSyncIntervalRef.current) {
      clearInterval(autoSyncIntervalRef.current);
      autoSyncIntervalRef.current = null;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const disconnect = useCallback(async () => {
    stopAutoSync();
    setIsInitialized(false);
    setGhost(null);
    setMetaAddress(null);
    setUserAddress(null);
    setViewingKey(null);
    setSpendingKey(null);
    setShards([]);
    setError(null);
    setShowComplianceKeys(false);
  }, [stopAutoSync]);

  // Compute derived state
  const filteredShards = applyFilters(shards);
  const discoveredTokenAddresses = extractTokenAddresses(shards);
  const balanceSummary = computeBalanceSummary(shards);

  const value: GhostContextType = {
    isInitialized,
    isLoading,
    error,
    ghost,
    metaAddress,
    shards,
    isSyncing,
    isSending,
    lastSyncTime,
    userAddress,
    viewingKey,
    spendingKey,
    showComplianceKeys,
    assetTypeFilter,
    tokenAddressFilter,
    tokenIdFilter,
    filteredShards,
    discoveredTokenAddresses,
    balanceSummary,
    initializeGhost,
    syncWithChain,
    sendAsset,
    setAssetTypeFilter,
    setTokenAddressFilter,
    setTokenIdFilter,
    toggleComplianceKeys,
    startAutoSync,
    stopAutoSync,
    clearError,
    disconnect,
  };

  return <GhostContext.Provider value={value}>{children}</GhostContext.Provider>;
}

export function useGhost() {
  const context = useContext(GhostContext);
  if (!context) {
    throw new Error("useGhost must be used within GhostProvider");
  }
  return context;
}