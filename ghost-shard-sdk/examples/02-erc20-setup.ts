/**
 * Example 1: Basic SDK Setup
 *
 * Initializes the SDK, derives keys from a wallet signer, generates meta-address
 * and deposit addresses, and prepares an announcement transaction.
 *
 * Dependencies: @ghost-shard/sdk, viem
 *
 * ```bash
 * tsx examples/01-basic-setup.ts
 * ```
 */
import 'dotenv/config'
import { GhostClient } from '@ghost-shard/sdk';
import { preparePrivateDeposit } from '@ghost-shard/sdk/utils';
import { decodeErrorResult, decodeFunctionResult, Hex, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, sepolia } from 'viem/chains';

import {
  createPublicClient,
  zeroAddress,
} from "viem";
import { getUserOperationGasPrice } from "@zerodev/sdk/actions"
import {
  getEntryPoint,
  KERNEL_V3_3,
} from "@zerodev/sdk/constants";
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";

if (!process.env.ZERODEV_RPC) {
  throw new Error("ZERODEV_RPC is not set");
}

const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_3;

// We use the Sepolia testnet here, but you can use any network that
// supports EIP-7702.
const chain = arbitrumSepolia;
const ZERODEV_RPC = process.env.ZERODEV_RPC;

const publicClient = createPublicClient({
  transport: http(),
  chain,
});

const privateKey = process.env.PRIVATE_KEY! as Hex
const rpcUrl = process.env.RPC_URL!;
const tokenAddress = process.env.TOKEN_ADDRESS! as Hex;

if (!privateKey || !rpcUrl || !tokenAddress) {
  throw new Error('Please set PRIVATE_KEY, RPC_URL, and TOKEN_ADDRESS in .env');
}

async function main() {

  const eip7702Account = privateKeyToAccount(privateKey);
  console.log("EOA Address:", eip7702Account.address);

  const account = await createKernelAccount(publicClient, {
    eip7702Account,
    entryPoint,
    kernelVersion,
  })
  console.log("account", account.address);

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(ZERODEV_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(ZERODEV_RPC),
    paymaster: paymasterClient,
    client: publicClient,
  })

  const ghost = new GhostClient({
    chain,
    rpcUrl: rpcUrl,
    startBlock: 10_949_751n,
  });

  
  await ghost.init(eip7702Account);

  console.log("GhostClient initialized.");

  const metaAddress = ghost.getMetaAddress();
  const tx = await preparePrivateDeposit({
    metaAddress: "st:eth:0x01025fe6df442c2c429066de85e266e95fa49afb7120711122f4c3fb685b629b2ce802b98a024a5d95eb85805634eb4da8091a0103f3c6c6b0b950418f0e0c84c21420",
    amount: 30n * 10n ** 18n, // 1 ETH
    tokenAddress,
    type: 'ERC20',
    senderAddress: account.address,
  });

  console.log("Sending to Meta Address:", "st:eth:0x01025fe6df442c2c429066de85e266e95fa49afb7120711122f4c3fb685b629b2ce802b98a024a5d95eb85805634eb4da8091a0103f3c6c6b0b950418f0e0c84c21420");
  const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      ...tx.calls
    ]),
  });

  console.log("UserOp sent:", userOpHash);
  console.log("Waiting for UserOp to be completed...");

  const result = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log(
    "UserOp completed succes:", result.success,
    `${chain.blockExplorers.default.url}/tx/${result.receipt.transactionHash}`
  );

  process.exit(0);
};

main()