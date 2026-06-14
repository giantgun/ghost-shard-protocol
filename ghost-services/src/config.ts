import 'dotenv/config'
import { type Address } from "viem";
import { arbitrumSepolia } from 'viem/chains';

export const config = {
  routerAddress: (process.env.ROUTER_ADDRESS ?? '0xA52c642899710654908B1CD79Fc04FbeA5bA467b') as Address,
  paymasterPrivateKey: process.env.PAYMASTER_PRIVATE_KEY as `0x${string}` | undefined,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined,
  readRpcUrl: process.env.READ_RPC_URL ?? 'http://localhost:8545',
  privateRpcUrl: process.env.PRIVATE_RPC_URL ?? 'http://localhost:8545',
  chain: arbitrumSepolia,
  /** Single unified port for the merged Ghost Relayer service */
  port: parseInt(process.env.PORT ?? '3000', 10),
  /** Comma-separated list of user (shard owner) addresses the paymaster is willing to sponsor. */
  allowedUsers: (process.env.ALLOWED_USERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0),
};
