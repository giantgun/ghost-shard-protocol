"use client";

import { useState, useMemo, useEffect } from "react";
import { Send, ExternalLink } from "lucide-react";
import { useGhost, ShardWithAssets, AssetType } from "@/lib/contexts/GhostContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isMetaAddress } from "@ghost-shard/sdk/utils";
import { ERC20Balance, ERC721Balance } from "@ghost-shard/sdk/";

interface TransferModalProps {
  onClose: () => void;
  availableShards: ShardWithAssets[];
}

export function TransferModal({ onClose, availableShards }: TransferModalProps) {
  const { ghost, sendAsset } = useGhost();
  const [mode, setMode] = useState<"public" | "private">("private");

  // Intent State
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean | null>(false);
  const [txHash, setTxHash] = useState<string | null>(null); // Track on-chain transaction hash

  // 1. Extract all raw assets across all available shards
  const allAssets = useMemo(() => {
    return availableShards.flatMap((s) => s.displayAssets);
  }, [availableShards]);

  // 2. Derive available Asset Types
  const availableAssetTypes = useMemo(() => {
    const types = new Set<AssetType>();
    allAssets.forEach((a) => types.add(a.type as AssetType));
    return Array.from(types);
  }, [allAssets]);

  // 3. Derive available Token Addresses (if ERC20 or ERC721 selected)
  const availableTokenAddresses = useMemo(() => {
    if (!selectedAssetType || selectedAssetType === "NATIVE") return [];
    const addresses = new Set<string>();
    allAssets.forEach((a) => {
      if (a.type === selectedAssetType && a.tokenAddress) {
        addresses.add(a.tokenAddress);
      }
    });
    return Array.from(addresses);
  }, [allAssets, selectedAssetType]);

  // 4. Derive available Token IDs (if ERC721 and a Token Address is selected)
  const availableTokenIds = useMemo(() => {
    if (selectedAssetType !== "ERC721" || !selectedTokenAddress) return [];
    const ids = new Set<string>();
    allAssets.forEach((a) => {
      if (a.type === "ERC721" && a.tokenAddress === selectedTokenAddress && a.tokenIds) {
        a.tokenIds.forEach((id) => ids.add(id.toString()));
      }
    });
    return Array.from(ids);
  }, [allAssets, selectedAssetType, selectedTokenAddress]);

  // Calculate the max cumulative balance for the selected asset intent
  const currentMaxBalance = useMemo(() => {
    if (!selectedAssetType) return 0n;

    return allAssets.reduce((sum, a) => {
      if (a.type !== selectedAssetType) return sum;
      if (selectedAssetType === "ERC20" && (a as ERC20Balance).tokenAddress !== selectedTokenAddress) return sum;
      if (selectedAssetType === "ERC721") {
        if ((a as ERC20Balance).tokenAddress !== selectedTokenAddress) return sum;
        if (selectedTokenId && !(a as ERC721Balance).tokenIds?.map(String).includes(selectedTokenId)) return sum;
      }
      return sum + (a.balance || 0n);
    }, 0n);
  }, [allAssets, selectedAssetType, selectedTokenAddress, selectedTokenId]);

  // Force amount to 1 if ERC721
  useEffect(() => {
    if (selectedAssetType === "ERC721") {
      setAmount("1");
    } else {
      setAmount("");
    }
  }, [selectedAssetType, selectedTokenId]);

  // Reset downstream selections when upstream changes
  const handleAssetTypeChange = (val: string | null) => {
    if (!val) return;
    setSelectedAssetType(val as AssetType);
    setSelectedTokenAddress(null);
    setSelectedTokenId(null);
  };

  const handleTokenAddressChange = (val: string | null) => {
    setSelectedTokenAddress(val);
    setSelectedTokenId(null);
  };

  const handleTransfer = async () => {
    try {
      setError(null);
      setTxHash(null);
      setIsLoading(true);

      if (!ghost) throw new Error("GhostClient not initialized");
      if (!selectedAssetType) throw new Error("Please select an asset type");

      if ((selectedAssetType === "ERC20" || selectedAssetType === "ERC721") && !selectedTokenAddress) {
        throw new Error("Please select a token address");
      }

      if (selectedAssetType === "ERC721" && !selectedTokenId) {
        throw new Error("Please select a token ID");
      }

      if (!recipientAddress) throw new Error("Please enter recipient address");
      if (!amount || parseFloat(amount) <= 0) throw new Error("Please enter a valid amount");

      const amountInWei = selectedAssetType === "ERC721"
        ? 1n
        : BigInt(Math.floor(parseFloat(amount) * 1e18));

      // Build payload based on custom implementation
      const payload: any = {
        type: selectedAssetType,
        amount: amountInWei,
      };

      if (selectedTokenAddress) payload.tokenAddress = selectedTokenAddress;
      if (selectedTokenId) payload.tokenId = selectedTokenId;

      if (mode === "public") {
        payload.to = recipientAddress as `0x${string}`;
      } else {
        if (!isMetaAddress(recipientAddress)) {
          throw new Error("For private transfers, enter a valid meta address (st:eth:...)");
        }
        payload.metaAddress = recipientAddress;
      }

      console.log("Transfer Payload:", payload);

      const receipt = await sendAsset(payload);

      // Extract transaction hash securely depending on SDK/wagmi output structure
      const hash = receipt.txHash;
      if (hash) {
        setTxHash(hash);
      }

      setSuccess(receipt.success);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Transfer failed";
      setError(errorMsg);
      console.error("[GhostTransfer]", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatBalance = (bal: bigint) => {
    const value = Number(bal) / 1e18;
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 18,
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle>Send Transfer</DialogTitle>
          <DialogDescription>
            Send assets privately via metaAddress or publicly to an address
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Mode Selector */}
          <Tabs defaultValue="private" onValueChange={(v) => setMode(v as "public" | "private")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="private" disabled={success === true}>Private</TabsTrigger>
              <TabsTrigger value="public" disabled={success === true}>Public</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Asset Type Selector */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Asset Type</label>
            <Select
              value={selectedAssetType || ""}
              onValueChange={handleAssetTypeChange}
              disabled={success === true}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select asset type..." />
              </SelectTrigger>
              <SelectContent>
                {availableAssetTypes.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
                {availableAssetTypes.length === 0 && (
                  <SelectItem value="none" disabled>No assets available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            {/* Token Address Selector (ERC20 / ERC721) */}
            {(selectedAssetType === "ERC20" || selectedAssetType === "ERC721") && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">Token Address</label>
                <Select
                  value={selectedTokenAddress || ""}
                  onValueChange={handleTokenAddressChange}
                  disabled={success === true}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select token..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTokenAddresses.map((addr) => (
                      <SelectItem key={addr} value={addr}>
                        {addr.substring(0, 10)}...{addr.substring(addr.length - 4)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Token ID Selector (ERC721) */}
            {selectedAssetType === "ERC721" && selectedTokenAddress && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">Token ID</label>
                <Select
                  value={selectedTokenId || ""}
                  onValueChange={(v) => setSelectedTokenId(v)}
                  disabled={success === true}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Token ID..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTokenIds.map((id) => (
                      <SelectItem key={id} value={id}>
                        ID: {id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Balance Helper */}
            {selectedAssetType && currentMaxBalance > 0n && selectedAssetType !== "ERC721" && (
              <p className="text-xs text-muted-foreground text-right">
                Available Balance: {formatBalance(currentMaxBalance)} {selectedAssetType === "NATIVE" ? "ETH" : "Tokens"}
              </p>
            )}
          </div>


          {/* Recipient */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">
              {mode === "private" ? "Recipient Meta Address" : "Recipient Address"}
            </label>
            <Input
              placeholder={mode === "private" ? "st:eth:0x..." : "0x..."}
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              className="font-mono"
              disabled={success === true}
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-semibold">Amount</label>
            </div>
            <Input
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="0.0001"
              min="0"
              disabled={selectedAssetType === "ERC721" || success === true}
            />
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Status with Explorer Link */}
          {success === true && (
            <Alert className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20">
              <AlertDescription className="space-y-2">
                <p className="font-semibold">Transfer Processed Successfully!</p>
                {txHash && (
                  <div className="text-xs space-y-1">
                    <p className="text-muted-foreground">Transaction Hash:</p>
                    <a
                      href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono underline text-green-700 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 break-all"
                    >
                      {txHash.substring(0, 20)}...{txHash.substring(txHash.length - 10)}
                      <ExternalLink className="h-3 w-3 inline" />
                    </a>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {success === true ? (
              <Button onClick={onClose} className="flex-1 w-full" variant="secondary">
                Close Window
              </Button>
            ) : (
              <>
                <Button onClick={onClose} variant="outline" className="flex-1" disabled={isLoading}>
                  Cancel
                </Button>
                <Button
                  onClick={handleTransfer}
                  disabled={
                    isLoading ||
                    !selectedAssetType ||
                    !recipientAddress ||
                    !amount ||
                    ((selectedAssetType === "ERC20" || selectedAssetType === "ERC721") && !selectedTokenAddress) ||
                    (selectedAssetType === "ERC721" && !selectedTokenId)
                  }
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {isLoading ? "Processing..." : "Send"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}