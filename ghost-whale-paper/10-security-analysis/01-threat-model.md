## 10.1 Threat Model

This section defines the security objectives, adversary classes, and threat assumptions used throughout the remainder of the security analysis.

The purpose of the threat model is to establish who the protocol is attempting to defend against, what capabilities those adversaries possess, and which classes of attacks are considered within scope for GhostShard v0.

Unless otherwise stated, all subsequent security claims are evaluated relative to the adversaries defined in this section.

---

### 10.1.1 Security Objectives

GhostShard v0 is designed to achieve the following security objectives.

#### Fund Safety

Only the legitimate owner of a shard can authorize its spending.

No relayer, paymaster, block builder, smart contract, or other infrastructure participant can unilaterally transfer user assets without possession of the required authorization keys.

#### Double-Spend Prevention

Each shard can be consumed exactly once.

GhostShard enforces this property through permanent on-chain spend tracking (`isShardSpent`) together with transient-storage deduplication that prevents duplicate consumption attempts within the same transaction execution context.

#### Sender Privacy

Observers should not be able to reliably link a user's externally owned account (EOA) to the shards they control or the transfers they initiate.

#### Recipient Privacy

Recipients should not be identifiable through publicly observable transaction data.

Stealth-address derivation and encrypted announcement metadata are designed to prevent recipient identification by passive observers.

#### Metadata Confidentiality

Sender-specific metadata should remain confidential to authorized participants.

Metadata confidentiality is provided through AES-256-GCM encryption using keys derived from transaction-specific ECDH shared secrets.

#### Authorization Integrity

Valid authorizations should be usable only for their intended purpose.

Authorizations are bound to specific actions, contracts, chains, and execution contexts, preventing cross-contract, cross-chain, and cross-transaction replay.

#### Censorship Resistance

Users should retain the ability to submit transactions even when individual relayers refuse service.

GhostShard therefore permits direct user submission and does not require reliance on any single relaying provider.

#### Infrastructure Safety

Protocol participants operating relayers or paymasters should be protected from protocol-level resource exhaustion and economic-draining attacks.

The protocol seeks to ensure that valid participation cannot be weaponized to force infrastructure providers into sustained economic loss.

---

### 10.1.2 Adversary Classes

GhostShard considers several classes of adversaries with different capabilities and objectives.

#### Passive Observer

A passive observer has access to all publicly available blockchain information, including:

* Complete transaction history.
* ERC-5564 announcements.
* Authorization lists.
* Shard creation events.
* Shard consumption events.
* Smart-contract state.

A passive observer cannot:

* Forge signatures.
* Modify transactions.
* Access viewing keys.
* Access spending keys.

This adversary class models blockchain analytics companies, researchers, and public observers attempting to reconstruct ownership relationships from observable data.

---

#### Active Protocol Participant

An active protocol participant operates within the GhostShard ecosystem as a relayer, paymaster, RPC provider, or similar infrastructure service.

Such an adversary may observe:

* Transaction submission timing.
* Sponsorship requests.
* Bundle contents.
* Network metadata.
* User information collected during onboarding.

The participant may act maliciously within the permissions of its role, including:

* Logging user activity.
* Refusing service.
* Attempting censorship.
* Performing transaction-ordering attacks.

However, the participant cannot forge valid authorizations or modify signed transaction contents without invalidating the associated signatures.

---

#### Counterparty Adversary

A counterparty adversary participates directly in economic activity with the target user.

The adversary may possess:

* Knowledge of transfers sent.
* Knowledge of transfers received.
* Expected payment schedules.
* Commercial relationships.
* Off-chain contextual information.

Because of repeated interaction, counterparties may accumulate substantially more information than passive observers.

However, counterparties do not automatically obtain:

* Viewing-key access.
* Ownership discovery capabilities.
* Visibility into unrelated transactions.
* Visibility into unrelated counterparties.

---

#### Infrastructure Adversary

An infrastructure adversary controls network-level services such as:

* RPC endpoints.
* Mempool access.
* Transaction-routing systems.
* Builder relationships.

Such an adversary may attempt:

* Timing analysis.
* Transaction correlation.
* Network-level attribution.
* Observation of unconfirmed transaction activity.

GhostShard assumes these adversaries may possess significant observational capabilities but cannot break the underlying cryptographic primitives.

---

#### Economic Adversary

An economic adversary seeks financial advantage by exploiting protocol incentives or imposing costs on other participants.

Potential objectives include:

* Draining paymaster deposits.
* Bleeding relayer resources.
* Triggering excessive computation.
* Creating denial-of-service conditions.
* Exploiting protocol economics.
* Griefing users or infrastructure providers.

Unlike purely external attackers, economic adversaries may possess fully valid protocol credentials and may submit valid transactions if doing so creates costs for others.

---

#### Cryptographic Adversary

A cryptographic adversary attempts to violate the security assumptions underlying the protocol.

Potential objectives include:

* Recovering private keys from public information.
* Forging signatures.
* Decrypting metadata without authorization.
* Linking stealth addresses to identities.
* Breaking authorization schemes.

GhostShard assumes the security of:

* secp256k1 discrete logarithms.
* Elliptic-Curve Diffie-Hellman (ECDH).
* HKDF-SHA256.
* AES-256-GCM.

The protocol's security guarantees are contingent upon the continued security of these primitives.

---

### 10.1.3 Out-of-Scope Threats

The following threats are considered outside the scope of GhostShard v0 protocol-level protections.

#### Endpoint Compromise

GhostShard does not protect users whose devices are compromised.

Examples include:

* Malware.
* Keyloggers.
* Remote-access trojans.
* Root-seed theft.
* Memory extraction attacks.

#### Social Engineering

The protocol cannot prevent users from voluntarily authorizing malicious actions.

Examples include:

* Phishing attacks.
* Fraudulent signing requests.
* Impersonation attacks.
* User deception outside protocol controls.

#### Physical Attacks

GhostShard does not address:

* Device theft.
* Coercion.
* Hardware tampering.
* Physical extraction of secrets.

#### Global Network Surveillance

Nation-state or ISP-level surveillance capable of monitoring large portions of internet traffic is considered outside the scope of v0 protections.

#### Large-Scale Quantum Adversaries

GhostShard v0 does not claim resistance against fault-tolerant quantum computers capable of executing:

* Shor's algorithm against secp256k1.
* Large-scale quantum attacks against current public-key cryptography.

#### Malicious Wallet Interfaces

GhostShard assumes that wallets present signing information honestly.

A wallet intentionally displaying incorrect transaction information to a user is considered outside protocol scope.

---

Threats in these categories require operational security measures, trusted hardware, user education, future cryptographic upgrades, or wallet-level protections rather than protocol-level modifications.
