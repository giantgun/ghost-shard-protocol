"use client";

import { useState, useEffect } from "react";
import { useGhost } from "@/lib/contexts/GhostContext";
import { useDisconnect } from "wagmi";
import { Loader2, RefreshCw, Send, LogOut, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MetaAddressCard } from "./MetaAddressCard";
import { ShardsTable } from "./ShardsTable";
import { TransferModal } from "./TransferModal";
import { BalanceSummary } from "./BalanceSummary";
import { ComplianceKeysCard } from "./ComplianceKeysCard";

export function Dashboard() {
  const {
    metaAddress,
    shards,
    isSyncing,
    lastSyncTime,
    syncWithChain,
    startAutoSync,
    stopAutoSync,
    error,
    clearError,
    disconnect,
    userAddress,
    filteredShards,
    balanceSummary,
    showComplianceKeys,
    toggleComplianceKeys,
    viewingKey,
    spendingKey,
  } = useGhost();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    startAutoSync();
    return () => stopAutoSync();
  }, [startAutoSync, stopAutoSync]);

  const handleCopyMetaAddress = () => {
    if (metaAddress) {
      navigator.clipboard.writeText(metaAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    wagmiDisconnect();
  };

  const lastSyncFormatted = lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : "Never";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            
            <h1 className="text-4xl font-bold text-white mb-2">
              <span className="text-4xl mb-6">👻</span>Ghost Dashboard
            </h1>
            <p className="text-accent text-white">
              Manage your private Ethereum assets with utxo-based shards(EOAs)
            </p>
          </div>
          <Button
            onClick={handleDisconnect}
            variant="destructive"
            title={`Disconnect ${userAddress}`}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Disconnect
          </Button>
        </div>

        {/* Error Banner */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-start justify-between">
              <span>{error}</span>
              <button
                onClick={clearError}
                className="ml-4 hover:opacity-80"
              >
                ✕
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Top Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Shard Count Card */}
          <div className="rounded-lg border bg-card p-6">
            <p className="text-muted-foreground text-sm font-medium mb-2">Total Shards</p>
            <p className="text-3xl font-bold text-foreground mb-2">{shards.length}</p>
            <p className="text-foreground text-accent text-md">
              ETH: {balanceSummary.ethShardCount} | ERC20: {balanceSummary.erc20TokenCount} | NFT: {balanceSummary.erc721Collections.size}
            </p>
          </div>

          {/* Sync Status Card */}
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-muted-foreground text-sm font-medium">Sync Status</p>
              {isSyncing && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            </div>
            <p className="text-foreground font-semibold mb-2">{isSyncing ? "Syncing..." : "Synced"}</p>
            <p className="text-muted-foreground text-xs">Last: {lastSyncFormatted}</p>
          </div>

          {/* Action Buttons */}
          <div className="rounded-lg border bg-card p-6 flex flex-col gap-3">
            <Button
              onClick={syncWithChain}
              disabled={isSyncing}
              className="w-full"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
            <Button
              onClick={() => setShowTransferModal(true)}
              variant="secondary"
              className="w-full"
            >
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
        </div>

        {/* Meta Address Card */}
        {metaAddress && (
          <MetaAddressCard
            metaAddress={metaAddress}
            onCopy={handleCopyMetaAddress}
            copied={copied}
            onToggleComplianceKeys={toggleComplianceKeys}
            showComplianceKeys={showComplianceKeys}
            viewingKey={viewingKey}
            spendingKey={spendingKey}
          />
        )}

        {/* Compliance Keys Card */}
        {showComplianceKeys && metaAddress && (
          <ComplianceKeysCard viewingKey={viewingKey} spendingKey={spendingKey} />
        )}

        {/* Balance Summary */}
        <BalanceSummary />

        {/* Shards Table */}
        <ShardsTable shards={filteredShards} />

        {/* Transfer Modal */}
        {showTransferModal && (
          <TransferModal
            onClose={() => setShowTransferModal(false)}
            availableShards={shards}
          />
        )}
      </div>
    </div>
  );
}
