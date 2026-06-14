# 5. Cryptographic Foundation

### 5.1 Overview

GhostShard's privacy model is built on a layered cryptographic architecture that combines deterministic identity derivation, stealth addressing, encrypted metadata, and selective disclosure.

Rather than introducing a new cryptographic primitive, GhostShard composes established standards and techniques—including ERC-5564, elliptic-curve Diffie-Hellman (ECDH) key exchange, authenticated encryption, and deterministic key derivation—into a unified ownership model for the EVM.

The cryptographic layer serves four primary purposes:

* Deriving protocol-specific keys from a user's root identity.
* Creating unlinkable stealth ownership units (shards).
* Enabling private recipient discovery and metadata exchange.
* Supporting selective disclosure without exposing unrelated activity.

These mechanisms provide the foundation upon which higher-level protocol properties are built. Recipient privacy, shard ownership, announcement discovery, encrypted asset metadata, and compliance-oriented disclosure all originate from the cryptographic layer.

However, cryptography alone does not provide the complete GhostShard privacy model. Ownership ambiguity, mesh execution, transaction propagation privacy, gas sponsorship, and economic incentives emerge from the protocol architecture described in later chapters.

This chapter follows the lifecycle of a shard from key generation to optional disclosure. It begins with identity and key derivation, proceeds through stealth address creation and discovery, then concludes with metadata protection, selective disclosure mechanisms, and the resulting security properties.

By the end of this chapter, the reader will understand how GhostShard transforms a conventional EVM account into a system capable of private ownership, private discovery, and controlled disclosure while remaining compatible with existing Ethereum infrastructure.
