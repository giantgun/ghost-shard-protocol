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
import { Hex, } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';

const privateKey = process.env.PRIVATE_KEY! as Hex
const rpcUrl = process.env.RPC_URL!;
const paymasterUrl = process.env.PAYMASTER_URL!;
const relayerUrl = process.env.RELAYER_URL!;
const chain = arbitrumSepolia;
const tokenAddress = process.env.TOKEN_ADDRESS! as Hex;

if (!privateKey || !rpcUrl || !paymasterUrl || !relayerUrl || !tokenAddress) {
  throw new Error('Please set PRIVATE_KEY, RPC_URL, PAYMASTER_URL, RELAYER_URL, and TOKEN_ADDRESS in .env');
}

async function main() {
    const account = privateKeyToAccount(privateKey);
    console.log("EOA Address:", account.address);

    console.log("account", account.address);

    const ghost = new GhostClient({
        chain,
        rpcUrl: rpcUrl,
        startBlock: 272_798_021n,
        paymasterUrl,
        relayerUrl,
    });

    await ghost.init(account);
    
    await ghost.syncWithChain();

    const amt =  190000000000000000000n
    
    const metaAddress = ghost.getMetaAddress();
    // const balance = ghost.getBalance("ERC20", tokenAddress);
    // console.log("Ghost ERC20 balance: ", balance)
    console.log(`sending ${amt} of token ${tokenAddress} to ${metaAddress}`)
    const tx = await ghost.relayTransfer(
        {
            metaAddress, //to: "0x32dc5a575271Ee205Cb57fe6CDf34D7380c729e2",
            amount:  amt, // 0.001 ETH
            type: 'ERC20',
            tokenAddress
        },
        account,
    );

    console.log("awaiting receipt for tx hash: ",`https://sepolia.arbiscan.io/tx/${tx.transactionHash}`);

    const receipt = await tx.wait();
    console.log("Transaction receipt: ", receipt);
    console.log("Input shard length:", tx.shardAddresses.length)
    console.log("Announcements length:", tx.announcements.length)
    console.log("transfers length:", tx.commands.length)

    await ghost.syncWithChain();
    console.log("Ghost ERC20 balance: ", ghost.getBalance("ERC20", tokenAddress));

    process.exit(0);
};

main()