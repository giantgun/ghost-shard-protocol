# 1. Introduction

## 1.1 Motivation

Every transaction executed on a public Ethereum Virtual Machine (EVM) network permanently records the core parameters of a state transition: the sender, receiver, execution data, transferred amount, token contract, and timestamp. This transparency is a fundamental property of public blockchain systems and enables independent verification of network state. However, within the EVM's account-based model, transparency comes at the cost of persistent ownership visibility.

Unlike UTXO-based systems, where ownership can be distributed across many independent outputs, an EVM Externally Owned Account (EOA) functions simultaneously as a user's execution origin, asset container, and public identity. Over time, this creates a persistent financial profile that can be observed, analyzed, and correlated across the entire history of the chain.

The current state of EVM privacy introduces several significant challenges:

### Deterministic Transfer Transparency

Every transfer of native assets or ERC-20 tokens is publicly observable. Standardized events such as:

```solidity
Transfer(address indexed from, address indexed to, uint256 value)
```

allow observers to reconstruct the exact flow of assets across the network. Any participant operating a standard RPC node can index and analyze these transfers in real time.

### Address Clustering and Identity Correlation

Chain analysis systems employ clustering heuristics to associate multiple addresses with a single entity. Common signals include:

* Shared funding sources
* Exchange withdrawal patterns
* Co-spend behavior
* Temporal transaction correlation
* Repeated interaction patterns

Over time, these techniques allow observers to build increasingly accurate ownership maps linking seemingly independent addresses.

### NFT Ownership Exposure

The ERC-721 and ERC-1155 standards expose ownership through public view functions such as `ownerOf()` and `balanceOf()`. As a result, any observer can enumerate the complete non-fungible asset portfolio of a target address.

Because NFTs often represent unique assets, memberships, identities, achievements, or event attendance records, they can become powerful correlation anchors that connect on-chain activity to real-world personas.

### Wealth Inference and Economic Targeting

Public state visibility enables observers to estimate a user's financial position by aggregating balances across native assets, tokens, staking positions, and yield-bearing protocols.

This transparency creates opportunities for:

* Targeted phishing campaigns
* Social engineering attacks
* Competitive intelligence gathering
* MEV exploitation
* Real-world coercion and extortion

### Transaction Graph Analysis

The transaction graph reveals far more than balances. Counterparty relationships, business operations, interaction frequency, and behavioral patterns can all be inferred from historical activity.

By analyzing contract interactions, trading patterns, lending activity, bridge usage, and transaction timing, adversaries can construct behavioral profiles capable of identifying users and predicting future actions.

### The Ownership Visibility Problem

The consequence of these properties is not merely transaction transparency but persistent ownership transparency.

An observer can often determine:

* What assets a user owns
* How much they own
* Who they interact with
* How they use their assets
* How their holdings evolve over time

As a result, privacy failures on the EVM are fundamentally ownership failures rather than transaction failures.

GhostShard begins from the observation that meaningful privacy cannot be achieved solely by obscuring individual transactions. Instead, privacy should emerge from the structure of ownership itself. The remainder of this paper explores an ownership-centric privacy model designed to preserve self-custody, maintain EVM compatibility, and provide practical privacy for both fungible and non-fungible assets.
