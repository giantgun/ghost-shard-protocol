"use client";

import { useConnect } from "wagmi";
import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useGhost } from "@/lib/contexts/GhostContext";

export function Initialize() {
  const { connect, connectors, isPending } = useConnect();
  const { initializeGhost } = useGhost();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const injectedConnector = connectors.find(
    (c) => c.id === "injected"
  );

  const handleConnect = async () => {
    if (injectedConnector) {
      connect({ connector: injectedConnector });
      await initializeGhost();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <div className="text-6xl mb-6">👻</div>
          <h1 className="text-3xl font-bold text-foreground mb-2">GhostShard</h1>
          <p className="text-muted-foreground mb-8">
            Privacy-preserving Ethereum asset management with stealth addresses
          </p>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your wallet to get started with private asset transfers
            </p>

            <button
              onClick={handleConnect}
              disabled={isPending}
              className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted text-primary-foreground font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all duration-200"
            >
              <Wallet className="w-5 h-5" />
              {isPending ? "Connecting..." : "Connect Wallet"}
            </button>

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-3">Supported chains:</p>
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="px-2 py-1 bg-muted rounded">Arbitrum Sepolia</span>
                <span className="px-2 py-1 bg-muted rounded">Sepolia</span>
                <span className="px-2 py-1 bg-muted rounded">Mainnet</span>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-muted/50 rounded-lg">
            <h3 className="font-semibold text-sm text-foreground mb-2">How it works</h3>
            <ul className="text-xs text-muted-foreground space-y-1 text-left">
              <li>✓ Derive a meta address using your wallet signature</li>
              <li>✓ Receive private payments as stealth addresses</li>
              <li>✓ Send funds with multi-shard randomized splits</li>
              <li>✓ Manage ETH, ERC20, and ERC721 assets privately</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
