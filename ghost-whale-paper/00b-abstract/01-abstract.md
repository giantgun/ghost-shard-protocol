
# Abstract

GhostShard is a privacy protocol for post-Pectra Ethereum Virtual Machine (EVM) chains that introduces UTXO-style privacy to standard externally owned accounts (EOAs) without requiring zero-knowledge circuits, trusted setup ceremonies, mixer pools, shielded state trees, or custom execution environments.

The protocol is based on the observation that privacy can emerge from **ownership topology** rather than cryptographic hiding of transaction contents. GhostShard decomposes account ownership into one-time-use stealth accounts called *shards*. Every deposit creates a new shard, while every spend consumes existing shards and creates fresh replacement shards. Asset transfers are executed through **mesh transactions**: atomic EIP-7702 transactions that combine multiple input shards, multiple output stealth addresses, and multiple ERC-5564 announcements into a single execution unit. This many-to-many transaction structure eliminates deterministic relationships between inputs and outputs while preserving full self-custody.

GhostShard combines ERC-5564 stealth addressing, EIP-7702 delegation, and sponsored transaction execution to provide private transfers for native assets, ERC-20 tokens, and ERC-721 NFTs. The protocol introduces a randomized coin-selection engine, opportunistic shard compression, recipient/change indistinguishability, and selective disclosure mechanisms for optional auditability.

An implementation of GhostShard v0 was deployed on Arbitrum Sepolia and evaluated across twenty-two measured transactions spanning native ETH, ERC-20, and ERC-721 transfers. Experimental results show that total gas consumption scales linearly with transfer count, with transfer commands explaining approximately 97% of observed gas variance. Verification and execution costs exhibit predictable linear behavior, while transaction bundling produces substantial amortization benefits, reducing effective gas per transfer by more than 3× across the measured range. Analytical evaluation further shows that ERC-5564 view tags reduce announcement-discovery cryptographic workload by approximately 256× relative to naive scanning.

These results demonstrate that disposable ownership can be implemented within the existing EVM account model while maintaining self-custody, preserving composability, and achieving predictable scaling characteristics without relying on zero-knowledge systems.

**Keywords:** Privacy, EIP-7702, ERC-5564, Stealth Addresses, Account Abstraction, Ethereum, UTXO, NFT Privacy, Gas Sponsorship, Disposable Ownership.
