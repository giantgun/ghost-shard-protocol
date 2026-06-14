import { createConfig, http, injected } from "wagmi";
import { arbitrumSepolia, mainnet, sepolia } from "wagmi/chains";

export const config = createConfig({
  chains: [arbitrumSepolia, mainnet, sepolia],
  connectors: [injected()],
  transports: {
    [arbitrumSepolia.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});
