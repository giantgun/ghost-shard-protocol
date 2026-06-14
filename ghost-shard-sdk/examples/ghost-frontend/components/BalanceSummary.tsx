"use client";

import { useGhost } from "@/lib/contexts/GhostContext";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function BalanceSummary() {
  const { balanceSummary, setTokenAddressFilter } = useGhost();
  const [expandedTokens, setExpandedTokens] = useState<Set<string>>(new Set());

  const toggleTokenExpand = (tokenAddr: string) => {
    const newExpanded = new Set(expandedTokens);
    if (newExpanded.has(tokenAddr)) {
      newExpanded.delete(tokenAddr);
    } else {
      newExpanded.add(tokenAddr);
    }
    setExpandedTokens(newExpanded);
  };

  const formatBalance = (balance: bigint, decimals: number = 18) => {
    const value = Number(balance) / Math.pow(10, decimals);
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 18,
    });
  };

  const formatAddress = (addr: string) => {
    return addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
  };

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Balance Summary</CardTitle>
        <CardDescription>Overview of all your assets and balances</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Native ETH Balance */}
          <div className="rounded-lg border bg-gradient-to-br from-blue-500/10 to-background p-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">Total ETH</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-bold text-foreground">
                {formatBalance(balanceSummary.totalNativeBalance)}
              </p>
              <Badge variant="secondary">{balanceSummary.ethShardCount} shards</Badge>
            </div>
          </div>

          {/* ERC20 Count */}
          <div className="rounded-lg border bg-gradient-to-br from-purple-500/10 to-background p-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">ERC20 Tokens</p>
            <p className="text-2xl font-bold text-foreground">{balanceSummary.erc20Shards.size}</p>
            <p className="text-xs text-muted-foreground">token types</p>
          </div>

          {/* NFT Count */}
          <div className="rounded-lg border bg-gradient-to-br from-amber-500/10 to-background p-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">NFT Collections</p>
            <p className="text-2xl font-bold text-foreground">{balanceSummary.erc721Collections.size}</p>
            <p className="text-xs text-muted-foreground">collections</p>
          </div>
        </div>

        {/* ERC20 Token Details */}
        {balanceSummary.erc20Shards.size > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">ERC20 Token Holdings</h3>
            <div className="space-y-2">
              {Array.from(balanceSummary.erc20Shards.entries()).map(([tokenAddr, data]) => (
                <div key={tokenAddr} className="rounded-lg border bg-muted/30 overflow-hidden">
                  {/* CHANGED FROM BUTTON TO DIV */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleTokenExpand(tokenAddr)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleTokenExpand(tokenAddr);
                      }
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <code className="text-xs text-muted-foreground font-mono">{formatAddress(tokenAddr)}</code>
                      <span className="text-sm font-semibold text-foreground">
                        {formatBalance(data.balance, 18)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevents row layout expansion toggle
                          setTokenAddressFilter(tokenAddr);
                        }}
                      >
                        View
                      </Button>
                      {expandedTokens.has(tokenAddr) ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>

                  {expandedTokens.has(tokenAddr) && (
                    <div className="px-4 py-3 bg-muted/50 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Address:</p>
                      <code className="text-xs text-foreground font-mono break-all">{tokenAddr}</code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ERC721 NFT Collections */}
        {balanceSummary.erc721Collections.size > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">NFT Collections</h3>
            <div className="space-y-2">
              {Array.from(balanceSummary.erc721Collections.entries()).map(([collectionAddr, data]) => (
                <div key={collectionAddr} className="rounded-lg border bg-muted/30 overflow-hidden">
                  {/* CHANGED FROM BUTTON TO DIV */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleTokenExpand(collectionAddr)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleTokenExpand(collectionAddr);
                      }
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <code className="text-xs text-muted-foreground font-mono">{formatAddress(collectionAddr)}</code>
                      <Badge variant="secondary">{data.nfts.length} NFTs</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevents row layout expansion toggle
                          setTokenAddressFilter(collectionAddr);
                        }}
                      >
                        View
                      </Button>
                      {expandedTokens.has(collectionAddr) ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>

                  {expandedTokens.has(collectionAddr) && (
                    <div className="px-4 py-3 bg-muted/50 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Collection:</p>
                      <code className="text-xs text-foreground font-mono break-all">{collectionAddr}</code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
