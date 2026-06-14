## 8.9 Trust Assumptions and Privacy Boundaries

As of the time of this paper, no privacy system provides absolute protection against every possible adversary.

The privacy properties described throughout this chapter are subject to explicit trust assumptions, infrastructure assumptions, and cryptographic assumptions. This section defines the primary privacy boundaries of GhostShard v0 and identifies the information that may still be available to certain participants.

---

### 8.9.1 Paymaster Visibility

In the current architecture, a sponsoring paymaster performs user verification before issuing sponsorship approval.

As part of this process, the paymaster may learn:

* The user's identity according to its verification model.
* The sponsored transaction bundle.
* Transaction timing.
* Asset transfer details.

Consequently, a malicious or compromised paymaster may associate user identities with protocol activity.

This visibility is a consequence of the sponsorship model rather than a weakness in the privacy architecture itself.

> GhostShard hides users from public observers, not necessarily from infrastructure providers that participate directly in transaction authorization.

**Potential Mitigations**

* Self-funded execution.
* Multiple competing paymasters.
* Future threshold-signing architectures.
* Future privacy-preserving sponsorship mechanisms.

---

### 8.9.2 Network-Level Metadata Leakage

Transaction bundles are submitted to relayers before appearing on-chain.

A relayer may therefore observe:

* Submission timing.
* Network metadata.
* IP-address information.
* Request patterns.

Even when transaction contents remain private, network-level observations may provide additional attribution signals.

This class of attack exists independently of GhostShard and affects most blockchain systems that rely on network communication.

**Potential Mitigations**

* VPNs.
* Tor.
* Private relay infrastructure.
* Future peer-to-peer submission networks.

---

### 8.9.3 Value Correlation Attacks

An observer possessing external knowledge about expected transfer values may attempt to reduce ambiguity by analyzing observable asset movements.

For example, if an observer knows:

* The approximate value being transferred.
* The assets entering a transaction.
* The assets leaving a transaction.

then some recipient–change interpretations may become less plausible than others.

GhostShard does not eliminate this possibility entirely.

However, ownership fragmentation, output partition ambiguity, and randomized output construction significantly reduce the effectiveness of simple value-tracing techniques.

**Potential Mitigations**

* Larger ownership fragmentation.
* Multi-shard spending.
* Larger output sets.
* Shared infrastructure usage.

---

### 8.9.4 Temporal Correlation

Timing information remains publicly observable.

An observer may attempt to correlate:

* Receipt of an output shard.
* Subsequent spending activity.
* Related external events.

For example, rapidly spending a newly received shard may provide additional information to a determined observer.

Temporal observations do not directly reveal ownership, but they may reduce uncertainty when combined with external knowledge.

**Potential Mitigations**

* Delayed spending.
* Ownership fragmentation.
* Independent transaction timing.
* Increased network usage and participant diversity.

---

### 8.9.5 Shard Visibility

Input shards participating in execution are visible on-chain.

Observers can determine:

* Which shards were consumed.
* Which shards were created.
* Which shards participated in a transaction.

If an external party independently links a shard to an identity through off-chain information, that shard's participation in a transaction becomes observable.

This limitation is inherent to ownership-transition systems that publish transaction activity on a public ledger.

GhostShard mitigates the impact through disposable ownership:

* Shards are spent once.
* Shards are permanently retired after use.
* Ownership information does not naturally propagate forward.

Consequently, even successful attribution of a historical shard provides limited visibility into future ownership.

---

---

### 8.9.6 Counterparty Knowledge Accumulation

Repeated counterparties may possess information unavailable to ordinary blockchain observers.

Over time, a recurring recipient can accumulate knowledge about:

* Historical payments they received.
* Expected payment schedules.
* Typical transfer amounts.
* Business relationships.
* External contextual information.

This information may allow a counterparty to make stronger ownership inferences than a passive observer relying solely on public blockchain data.

For example, a supplier receiving regular payments from the same organization may gradually develop a more accurate model of that organization's transaction behavior than an external analyst.

Such observations may improve:

* Temporal correlation.
* Amount correlation.
* Ownership inference.

However, these observations arise from direct participation in economic activity rather than from weaknesses in GhostShard's privacy architecture.

Importantly, counterparties still do not automatically obtain:

* Viewing-key access.
* Ownership discovery capabilities.
* Wallet reconstruction capabilities.
* Visibility into unrelated counterparties.
* Visibility into unrelated transactions.

Their knowledge remains limited to information acquired through repeated interaction.

This behavior closely resembles privacy in physical cash systems.

> Individuals who repeatedly transact with one another naturally accumulate contextual knowledge that external observers do not possess.

GhostShard preserves this property while preventing those observations from expanding into protocol-wide ownership visibility.

---

### 8.9.7 Infrastructure Collusion

A paymaster and relayer operating together may possess substantially more information than either party individually.

Such an entity could potentially combine:

* User identity information.
* Transaction details.
* Network metadata.
* Timing information.

GhostShard does not currently prevent this form of infrastructure-level correlation.

Mitigating collusion requires either:

* Independent infrastructure operators.
* Competitive infrastructure markets.
* Future cryptographic protocols that minimize infrastructure trust.

---

### 8.9.8 Cryptographic Assumptions

The privacy guarantees of GhostShard ultimately depend on the security of the cryptographic primitives described in Chapter 5.

In particular:

* Stealth-address privacy relies on the hardness of elliptic-curve discrete logarithms over secp256k1.
* Shared-secret derivation relies on the security of ECDH.
* Metadata confidentiality relies on HKDF-SHA256 and AES-256-GCM.

If these assumptions fail, ownership privacy may be compromised.

The encrypted metadata component is expected to remain secure against known practical attacks for the foreseeable future.

However, large-scale fault-tolerant quantum computers would threaten secp256k1-based constructions and could potentially weaken ownership unlinkability.

Post-quantum migration remains future work.
