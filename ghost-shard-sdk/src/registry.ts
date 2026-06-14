/**
 * GhostShard SDK — ERC-6538 Registry Helpers
 *
 * ERC-6538 defines a registry where users register their stealth meta-address
 * on-chain. Registry address is deterministic via CREATE2 (same on all chains).
 *
 * Functions:
 *   registerKeys(uint256 schemeId, bytes metaAddress)
 *   stealMetaAddressOf(address registrant, uint256 schemeId) → bytes
 */
import { ERC6538_REGISTRY_ABI, ERC6538_REGISTRY_ADDRESS } from './abi.js';
import { JsonRpcClient } from './rpc.js';
import { decodeFunctionResult, encodeFunctionData, Hex, stringToHex } from 'viem';

/**
 * Build a registration transaction for the ERC-6538 registry.
 * Call once after init() so senders can look up your keys.
 */
export function prepareRegisterMetaAddress(
  metaAddress: string,
  schemeId: number = 1,
): { to: Hex; data: Hex } {
  const data = encodeFunctionData({
    abi: ERC6538_REGISTRY_ABI,
    functionName: 'registerKeys',
    args: [BigInt(schemeId), stringToHex(metaAddress)],
  });

  return { to: ERC6538_REGISTRY_ADDRESS, data };
}

/**
 * Build a transaction to remove your registered meta-address.
 * Use when keys are compromised or rotating them.
 */
export function prepareRemoveMetaAddress(
  schemeId: number = 1,
): { to: Hex; data: Hex } {
  const data = encodeFunctionData({
    abi: ERC6538_REGISTRY_ABI,
    functionName: 'registerKeys',
    args: [BigInt(schemeId), '0x'],
  });

  return { to: ERC6538_REGISTRY_ADDRESS, data };
}

/**
 * Look up someone's stealth meta-address from the ERC-6538 registry.
 */
export async function lookupMetaAddress(
  rpcOrUrl: JsonRpcClient | string,
  registrant: Hex,
  schemeId: number = 1,
): Promise<string | null> {
  const data = encodeFunctionData({
    abi: ERC6538_REGISTRY_ABI,
    functionName: 'stealthMetaAddressOf',
    args: [registrant, BigInt(schemeId)],
  });

  const rpc = typeof rpcOrUrl === 'string' ? new JsonRpcClient(rpcOrUrl) : rpcOrUrl;

  try {
    const result = await rpc.ethCall(ERC6538_REGISTRY_ADDRESS, data);
    if (!result || result === '0x') return null;

    const decodedBytes = decodeFunctionResult({
      abi: ERC6538_REGISTRY_ABI,
      functionName: 'stealthMetaAddressOf',
      data: result,
    }) as Hex;

    if (!decodedBytes || decodedBytes === '0x') return null;

    const metaHex = decodedBytes.replace(/^0x/, '');
    return `st:eth:${metaHex}`;
  } catch {
    return null;
  }
}