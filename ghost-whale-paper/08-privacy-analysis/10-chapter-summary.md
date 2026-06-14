## 8.10 Privacy Summary: Ownership Unlinkability

The primary privacy objective of GhostShard is **ownership unlinkability**: preventing observers from reliably determining which on-chain assets, outputs, and transactions belong to the same ownership domain.

Unlike privacy systems that attempt to conceal transaction existence, GhostShard operates under the assumption that observers possess complete visibility of blockchain state. Transactions, announcements, execution traces, and ownership transitions remain publicly observable.

The protocol instead focuses on preventing reliable reconstruction of ownership relationships from that information.

Ownership unlinkability emerges from the composition of several independent ambiguity layers, each obstructing a different stage of the ownership-reconstruction process.

An observer attempting to reconstruct ownership relationships must simultaneously answer the following questions:

| Ambiguity Layer     | Observer's Question                                                  |
| ------------------- | -------------------------------------------------------------------- |
| Partition Ambiguity | Which outputs are recipient payments and which are sender change?    |
| Ownership Ambiguity | Which recipient-owned shards belong to the same recipient?           |
| Amount Ambiguity    | Which shards collectively represent a logical payment amount?        |
| Temporal Ambiguity  | Which transactions and future spends belong to the same participant? |

Partition ambiguity prevents reliable classification of outputs into recipient and change domains.

Ownership ambiguity prevents recipient clustering by obscuring how recipient-owned shards should be grouped into ownership sets.

Amount ambiguity prevents observers from using value-based heuristics to reconstruct ownership relationships between shards.

Temporal ambiguity prevents reliable linkage of ownership activity across time, weakening transaction graph analysis and longitudinal tracking.

Importantly, these ambiguity layers are not independent. They reinforce one another.

Solving any single inference problem does not reveal ownership relationships unless the remaining inference problems are also solved.

For example:

* Identifying a recipient-owned shard set does not reveal how many recipients participated.
* Reconstructing a logical payment amount does not reveal which recipient owns that amount.
* Linking transactions across time does not reveal how outputs should be partitioned into ownership domains.

Consequently, ownership reconstruction becomes a multi-dimensional inference problem rather than a direct observation problem.

GhostShard therefore derives privacy not from hiding transactions themselves, but from preventing reliable reconstruction of ownership relationships between transaction outputs, recipients, and future ownership transitions.

The resulting privacy guarantee is ownership unlinkability: the inability of an observer to confidently determine which assets, outputs, or transactions belong to the same participant despite complete access to on-chain information.

Under the cryptographic assumptions described in Chapter 5, ownership attribution remains an inference problem with multiple unresolved dimensions rather than a deterministic consequence of blockchain transparency.
