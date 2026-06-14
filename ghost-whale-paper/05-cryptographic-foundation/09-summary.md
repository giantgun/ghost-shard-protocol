## 5.10 Summary

This chapter defined the cryptographic foundations of GhostShard.

Beginning from a single EOA-derived root identity, the protocol deterministically derives independent spending, viewing, and encryption keys while preserving recoverability and key separation.

Using ERC-5564 meta-addresses, recipients publish a reusable receiving identifier from which senders can derive one-time stealth shards. Through ECDH-based stealth address generation, ownership is established without requiring recipient interaction and without exposing recipient identities on-chain.

ERC-5564 announcements provide the discovery mechanism that allows recipients to locate newly created shards and recover associated metadata. Metadata confidentiality is achieved through authenticated encryption derived from transaction-specific shared secrets, enabling private sender attribution and payment references.

The chapter also introduced GhostShard's selective disclosure model, in which transaction-specific cryptographic boundaries allow users to reveal individual payments without exposing unrelated activity. Finally, it described deterministic shared key generation as a future extension for institutional auditing and compliance workflows.

Together, these mechanisms provide the cryptographic primitives required for private ownership, recipient discovery, metadata protection, and bounded disclosure.

The next chapter builds on these primitives to describe how shards are combined into mesh transactions and how ownership is transferred within the GhostShard execution model.
