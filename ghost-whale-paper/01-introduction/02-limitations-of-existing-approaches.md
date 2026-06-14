## 1.2 Limitations of Existing Approaches

Existing EVM privacy systems generally fall into three categories:

* Mixers (e.g. Tornado Cash)
* Shielded pools (e.g. Railgun)
* Stealth address systems (e.g. ERC-5564)

Each improves privacy, but they do so by operating primarily at the transaction layer.

Mixers and shielded pools attempt to hide relationships between deposits, transfers, and withdrawals through shared anonymity sets or zero-knowledge proofs.

Stealth address systems improve recipient privacy through one-time receiving addresses.

However, none directly address the underlying visibility of ownership within the EVM.

Persistent ownership remains observable.

Addresses accumulate:

* Transaction history
* Balance history
* Relationship history
* Behavioral history

As a result, privacy is typically achieved through specialized workflows rather than existing as the default ownership state.

Users must actively enter a privacy environment by:

* Depositing into a mixer
* Shielding assets into a privacy pool
* Managing notes, commitments, or proofs
* Funding stealth addresses for future spending
* Consolidating fragmented balances
* Exiting back into public ownership when assets are ultimately used

These workflows often introduce additional complexity, delays, operational overhead, and composability constraints.

They also create usability challenges.

Users may be required to:

* Learn privacy-specific concepts and tooling
* Manage additional wallets, notes, or keys
* Understand anonymity set assumptions
* Wait for privacy-preserving withdrawal windows
* Coordinate gas funding for private accounts
* Navigate workflows that differ from standard EVM usage

Consequently, privacy becomes an explicit action the user performs rather than a property of ownership itself.

Even when transaction relationships are obscured, ownership remains a long-lived observable object.

GhostShard begins from a different premise.

Rather than hiding relationships between known owners, GhostShard makes ownership itself disposable.

Ownership is fragmented into temporary units called shards.

Shards receive, hold, spend, and retire.

No ownership unit accumulates history indefinitely.

Privacy therefore emerges from ownership topology rather than transaction concealment.

The goal is not merely to improve privacy, but to make private ownership compatible with existing EVM assets, existing wallet models, and familiar user workflows.

The remainder of this paper develops this approach and describes how disposable ownership can be implemented on the post-Pectra EVM using ERC-5564, EIP-7702, sponsored execution, and atomic mesh transactions.
