## 1.3 Design Goals

GhostShard is designed around eight core principles:

**1. Privacy as a property of ownership.** Privacy should emerge from ownership structure rather than transaction concealment. Assets should be private by default, not through explicit privacy actions. Users should not enter or exit privacy systems; ownership itself should be ambiguous.

**2. Self-custodial privacy.** Users retain full control of their assets. No trusted operators, custodial pools, delegated ownership, or trusted intermediaries are required.

**3. Privacy beyond fungible assets.** Privacy must extend to any ownership unit—including ERC-20 tokens, ERC-721 NFTs, and native assets—without requiring separate privacy systems for different asset classes.

**4. Privacy as the default state.** Privacy should not depend on user expertise, specialized operational knowledge, or explicit privacy workflows. Users should obtain privacy through normal ownership and transfer activity.

**5. Compatibility with existing EVM infrastructure.** The protocol should operate on existing EVM chains using existing wallets, existing assets, and existing developer tooling. No new chain, virtual machine, consensus mechanism, or execution environment should be required.

**6. Composable privacy primitives.** GhostShard is infrastructure rather than an application. Its contracts, SDK, services, relayers, and paymasters should be independently usable and composable with existing DeFi protocols and applications.

**7. Economically sustainable privacy.** Privacy should emerge from ordinary asset movement rather than requiring a separate privacy economy. Costs should remain comparable to normal transfers, with no percentage-based privacy fees, staking requirements, lockup periods, or participation incentives.

**8. Compliant privacy without total anonymity.** Privacy should support selective disclosure. Users must be able to prove specific ownership relationships or transactions to auditors, regulators, counterparties, or other authorized parties without exposing their complete financial history. Privacy does not imply opacity; it implies controlled cryptographic disclosure on the user's terms.

The Design Rationale chapter (Chapter 2) traces how these goals constrain and ultimately shape the architecture—from ownership topology to disposable ownership, shards, mesh transactions, recipient/change ambiguity, sponsored execution, and protocol infrastructure.
