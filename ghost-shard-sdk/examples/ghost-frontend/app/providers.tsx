"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GhostProvider } from "@/lib/contexts/GhostContext";
import { config } from "@/lib/wagmi";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <GhostProvider>{children}</GhostProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
