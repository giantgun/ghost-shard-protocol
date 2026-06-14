## 10.10 Security Boundary Summary

GhostShard v0 employs a defense-in-depth security architecture in which fund safety, authorization integrity, privacy, and infrastructure resilience are protected by multiple independent security mechanisms.

The protocol is intentionally designed so that no single participant—including users, relayers, paymasters, builders, or infrastructure providers—can unilaterally compromise all security properties simultaneously.

Instead, successful compromise generally requires violating multiple independent assumptions across cryptographic, protocol, and operational layers.

The following tables summarize the primary security boundaries established throughout this chapter.

---

### 10.10.1 Fund Safety

Fund safety is enforced through ownership-bound authorization, one-time-use shard semantics, replay protection, and immutable execution rules.

| Threat                  | Primary Protection                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Unauthorized spending   | Shard-private-key ownership enforced through ECDSA signature verification                 |
| Signature forgery       | Security of secp256k1 and ECDSA                                                           |
| Replay attacks          | One-time-use shard model, permanent spent-shard tracking, transient-storage deduplication |
| Cross-transaction reuse | Authorization binding to chain identifier, router address, and transfer parameters        |
| Authorization theft     | EIP-7702 delegation separated from transfer authorization                                 |
| Front-running attempts  | Atomic bundle execution and bundle-bound sponsorship                                      |
| Relayer manipulation    | Signed commands and authorization validation prevent transaction modification             |
| Paymaster abuse         | Bounded gas sponsorship and deterministic settlement accounting                           |
| Contract-level exploits | Immutable contracts, authorization validation, replay protection, and atomic execution    |

Under the assumptions defined in the threat model, asset theft requires compromise of the shard owner's private key or a failure of the underlying cryptographic assumptions.

---

### 10.10.2 Authorization Integrity

Authorization integrity ensures that valid permissions cannot be forged, reused, broadened, or repurposed beyond the intent of the signer.

| Threat                 | Primary Protection                                        |
| ---------------------- | --------------------------------------------------------- |
| Cross-contract replay  | Router-address binding                                    |
| Cross-chain replay     | Chain-identifier binding                                  |
| Recipient substitution | Transfer-parameter commitment                             |
| Amount modification    | Transfer-parameter commitment                             |
| Bundle modification    | Paymaster sponsorship binding                             |
| Authorization reuse    | One-time-use shards and delegation lifecycle              |
| Signature confusion    | Domain separation between EIP-7702 and EIP-191 signatures |
| Signature phishing     | Independent authorization domains and key separation      |

As a result, a valid authorization grants permission only for the specific action originally approved by the shard owner.

---

### 10.10.3 Privacy Protection

GhostShard's privacy model is based on unlinkable stealth addresses, encrypted metadata, one-time-use ownership structures, and recipient discovery through ECDH-derived secrets.

| Threat                     | Primary Protection                                                  |
| -------------------------- | ------------------------------------------------------------------- |
| Recipient identification   | Stealth-address construction                                        |
| Sender-recipient linkage   | Independent shard ownership and relayed execution                   |
| Metadata disclosure        | AES-256-GCM encryption using ECDH-derived secrets                   |
| Ownership reconstruction   | One-time-use shards and absence of persistent ownership identifiers |
| Transaction graph analysis | UTXO-style ownership transitions                                    |
| Meta-address discovery     | Viewing-key requirement                                             |
| Announcement scanning      | View-tag filtering                                                  |
| Wallet reconstruction      | Independent shard derivation and ownership fragmentation            |

Privacy guarantees rely on the security of secp256k1, ECDH, HKDF-SHA256, AES-256-GCM, and the assumptions described in Chapter 8.

---

### 10.10.4 Infrastructure Resilience

GhostShard minimizes trust in infrastructure providers by ensuring that relayers and paymasters participate in execution without obtaining spending authority.

| Infrastructure Component | Maximum Adversarial Capability                        | Protocol Mitigation                                   |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Relayer                  | Refuse or delay transaction broadcast                 | Multiple relayers and self-relay support              |
| Paymaster                | Refuse sponsorship or collect transaction metadata    | Alternative paymasters and self-funded execution      |
| Builder / Block Producer | Observe pending transactions and transaction ordering | Private submission channels and atomic execution      |
| RPC Provider             | Observe user requests                                 | Infrastructure diversity and self-hosted alternatives |
| Announcement Indexer     | Observe public announcements                          | Metadata encryption and viewing-key requirements      |

Compromise of any single infrastructure provider does not provide the ability to spend user assets.

---

### 10.10.5 Economic Security

GhostShard incorporates explicit protections against economic abuse targeting relayers, paymasters, and discovery infrastructure.

| Attack Class          | Mitigation                                                    |
| --------------------- | ------------------------------------------------------------- |
| Paymaster draining    | Simulation, sponsorship policies, bounded gas exposure        |
| Relayer bleeding      | Authorization validation and simulation before broadcast      |
| Bundle griefing       | Bundle-bound sponsorship and replay protection                |
| Dust-shard attacks    | Economic cost of shard creation and wallet filtering policies |
| Meta-address spam     | View tags and attacker-funded announcement publication        |
| Announcement flooding | Transaction-cost requirements and event filtering             |
| State-growth attacks  | Cost proportional to transaction creation                     |

A recurring design principle throughout the protocol is that spam and abuse require the attacker to pay normal network execution costs, creating a direct economic disincentive for large-scale attacks.

---

### 10.10.6 Known Limitations

GhostShard v0 intentionally accepts several limitations in exchange for simplicity, auditability, and protocol immutability.

These limitations include:

* No viewing-key revocation mechanism.
* No root-wallet recovery mechanism.
* No key-rotation support for existing shards.
* Permanent spent-shard storage growth.
* Immutable contract deployments.
* Dependence on at least one available transaction-broadcast path.
* Reliance on established cryptographic assumptions.
* Lack of formal verification.
* Absence of a completed third-party security audit.

These limitations do not invalidate the protocol's security model but define the boundaries within which the model is intended to operate.

---

### 10.10.7 Final Assessment

Under the assumptions established in the threat model, GhostShard v0 provides strong protections for:

* Fund safety.
* Authorization integrity.
* Ownership privacy.
* Recipient privacy.
* Metadata confidentiality.
* Replay resistance.
* Infrastructure independence.

Compromise of any single component—including a relayer, paymaster, announcement indexer, or individual shard key—does not automatically result in compromise of the entire system.

The primary security boundary remains the root wallet from which shard keys and viewing keys are derived. Consequently, protection of the root wallet represents the most critical operational security requirement for GhostShard users.

Within that boundary, the protocol's layered architecture ensures that security failures remain localized, bounded, and resistant to escalation.
