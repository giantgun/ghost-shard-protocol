"use client";

import { useState } from "react";
import { useGhost, ShardWithAssets, AssetType } from "@/lib/contexts/GhostContext";
import { Copy, CheckCircle, Clock, Trash2, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ShardsTableProps {
  shards: ShardWithAssets[];
}

export function ShardsTable({ shards }: ShardsTableProps) {
  const {
    assetTypeFilter,
    setAssetTypeFilter,
    tokenAddressFilter,
    setTokenAddressFilter,
    tokenIdFilter,
    setTokenIdFilter,
    discoveredTokenAddresses,
  } = useGhost();

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const formatAddress = (addr: string) => {
    return addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
  };

  const formatBalance = (bal: bigint) => {
    const value = Number(bal) / 1e18;
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 18,
    });
  };

  const getAssetBadgeColor = (type: string) => {
    switch (type) {
      case "NATIVE":
        return "bg-blue-600/20 text-blue-400 border-blue-600/30";
      case "ERC20":
        return "bg-purple-600/20 text-purple-400 border-purple-600/30";
      case "ERC721":
        return "bg-pink-600/20 text-pink-400 border-pink-600/30";
      default:
        return "bg-slate-600/20 text-slate-400 border-slate-600/30";
    }
  };

  const getStatusColor = (shard: ShardWithAssets) => {
    if (shard.spent) {
      return <span className="inline-flex items-center gap-2 text-red-400"><span className="w-2 h-2 bg-red-400 rounded-full"></span>Spent</span>;
    }
    if (shard.pending) {
      return <span className="inline-flex items-center gap-2 text-yellow-400"><Clock className="w-4 h-4 animate-pulse" />Pending</span>;
    }
    return <span className="inline-flex items-center gap-2 text-green-400"><CheckCircle className="w-4 h-4" />Active</span>;
  };

  if (shards.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Stealth Addresses ({shards.length})
          </h2>

          {/* Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Asset Type Filter */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                Filter by Asset Type
              </label>
              <Select value={assetTypeFilter} onValueChange={(e) => setAssetTypeFilter(e as AssetType | "ALL")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Assets</SelectItem>
                  <SelectItem value="NATIVE">ETH (Native)</SelectItem>
                  <SelectItem value="ERC20">ERC20 Tokens</SelectItem>
                  <SelectItem value="ERC721">ERC721 NFTs</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Token Address Filter */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                Filter by Token Address
              </label>
              <Select value={tokenAddressFilter || ""} onValueChange={(e) => setTokenAddressFilter(e || null)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Tokens" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Tokens</SelectItem>
                  {discoveredTokenAddresses.map((addr) => (
                    <SelectItem key={addr} value={addr}>
                      {formatAddress(addr)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Token ID Filter */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                Search by Token ID (NFTs)
              </label>
              <Input
                type="text"
                placeholder="e.g., 123"
                value={tokenIdFilter || ""}
                onChange={(e) => setTokenIdFilter(e.target.value || null)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-16">
          <Trash2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground text-lg font-medium">No shards discovered</p>
          <p className="text-muted-foreground text-sm mt-2">
            Receive a payment to your meta address or manually sync to discover stealth addresses.
          </p>
        </div>

      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Stealth Addresses ({shards.length})
        </h2>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Asset Type Filter */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">
              Filter by Asset Type
            </label>
            <Select value={assetTypeFilter} onValueChange={(e) => setAssetTypeFilter(e as AssetType | "ALL")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Assets</SelectItem>
                <SelectItem value="NATIVE">ETH (Native)</SelectItem>
                <SelectItem value="ERC20">ERC20 Tokens</SelectItem>
                <SelectItem value="ERC721">ERC721 NFTs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Token Address Filter */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">
              Filter by Token Address
            </label>
            <Select value={tokenAddressFilter || ""} onValueChange={(e) => setTokenAddressFilter(e || null)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Tokens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Tokens</SelectItem>
                {discoveredTokenAddresses.map((addr) => (
                  <SelectItem key={addr} value={addr}>
                    {formatAddress(addr)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Token ID Filter */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">
              Search by Token ID (NFTs)
            </label>
            <Input
              type="text"
              placeholder="e.g., 123"
              value={tokenIdFilter || ""}
              onChange={(e) => setTokenIdFilter(e.target.value || null)}
            />
          </div>
        </div>
      </div>

      {/* Shards Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">Shard Address</TableHead>
              <TableHead className="text-left">Asset Type</TableHead>
              <TableHead className="text-left">Token/ID Info</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-left">Status</TableHead>
              <TableHead className="text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shards.map((shard) => (
              <TableRow key={shard.address}>
                {/* Shard Address */}
                <TableCell>
                  <code className="text-accent text-foreground">{formatAddress(shard.address)}</code>
                </TableCell>

                {/* Asset Types (can be multiple) */}
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {shard.displayAssets.map((asset, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className={getAssetBadgeColor(asset.type)}
                      >
                        {asset.type === "NATIVE" ? "ETH" : asset.type}
                      </Badge>
                    ))}
                  </div>
                </TableCell>

                {/* Token/ID Info */}
                <TableCell>
                  <div className="space-y-1">
                    {shard.displayAssets.map((asset, idx) => {
                      if (asset.type === "NATIVE") {
                        return <div key={idx} className="text-accent text-foreground">Native</div>;
                      }
                      if (asset.type === "ERC20") {
                        return (
                          <div key={idx} className="text-accent text-foreground">
                            {formatAddress(asset.tokenAddress || "")}
                          </div>
                        );
                      }
                      if (asset.type === "ERC721") {
                        return (
                          <div key={idx} className="space-y-0.5">
                            <div className="text-accent text-foreground">
                              {formatAddress(asset.tokenAddress || "")}
                            </div>
                            {asset.tokenIds && asset.tokenIds.length > 0 && (
                              <div className="text-accent text-foreground">
                                IDs: {asset.tokenIds.map((id) => id.toString()).join(", ")}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </TableCell>

                {/* Balance/Value */}
                <TableCell className="text-right">
                  <div className="space-y-1">
                    {shard.displayAssets.map((asset, idx) => {
                      if (asset.type === "NATIVE") {
                        return (
                          <span key={idx} className="text-accent text-foreground">
                            {formatBalance(asset.balance)} ETH
                          </span>
                        );
                      }
                      if (asset.type === "ERC20") {
                        return (
                          <span key={idx} className="text-accent text-foreground">
                            {formatBalance(asset.balance)}
                          </span>
                        );
                      }
                      if (asset.type === "ERC721") {
                        return (
                          <span key={idx} className="text-accent text-foreground">
                            {asset.tokenIds?.length || 0} NFT{(asset.tokenIds?.length || 0) > 1 ? "s" : ""}
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>
                </TableCell>

                {/* Status */}
                <TableCell>{getStatusColor(shard)}</TableCell>

                {/* Action */}
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyAddress(shard.address)}
                    title="Copy shard address"
                  >
                    {copiedAddress === shard.address ? (
                      <span className="text-xs text-green-400">✓</span>
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 text-xs text-muted-foreground flex items-start gap-2">
        <span>ℹ️</span>
        <p>
          Each shard is a one-time-use stealth address that holds a single asset type. When you spend, funds are
          automatically split across new shards for enhanced privacy.
        </p>
      </div>
    </div>
  );
}
