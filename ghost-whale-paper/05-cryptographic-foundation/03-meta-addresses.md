## 5.3 Meta-Addresses

A meta-address is a reusable public receiving identifier that allows third parties to derive stealth ownership units for a recipient without learning the recipient's ownership graph.

Unlike a conventional EVM address, a meta-address does not hold assets, sign transactions, or participate directly in protocol execution. Instead, it serves as a cryptographic template from which fresh one-time shard addresses are deterministically derived.

The meta-address is therefore best understood as a receiving identity rather than an ownership identity.

---

### 5.3.1 Overview

GhostShard adopts the meta-address construction defined by ERC-5564.

Each user publishes two public keys:

* A spending public key
* A viewing public key

Together these keys form a reusable receiving identifier.

Let

$$
pk_{\text{spend}}
$$

denote the spending public key and

$$
pk_{\text{view}}
$$

denote the viewing public key.

The user's meta-address is defined as

$$
M=(pk_{\text{spend}}, pk_{\text{view}})
$$

A sender uses

$$
M
$$

to derive a unique stealth shard for each transfer.

The recipient uses the corresponding private keys to discover and control the resulting shard.

---

### 5.3.2 ERC-5564 Meta-Address Structure

GhostShard v0 uses ERC-5564 Scheme ID 1, which specifies secp256k1 stealth addresses with view tags.

The encoded payload consists of:

$$
M=(\texttt{schemeId},
pk_{\text{spend}},
pk_{\text{view}})
$$

where

$$
\texttt{schemeId}=1
$$

and both public keys are compressed secp256k1 points.

The resulting binary representation contains:

| Component           | Size     |
| ------------------- | -------- |
| Scheme ID           | 1 byte   |
| Spending Public Key | 33 bytes |
| Viewing Public Key  | 33 bytes |

for a total payload size of

$$
67 \text{ bytes}
$$

The human-readable ERC-5564 representation is encoded as

```text
st:<chainIdentifier>:0x<schemeId><spendingPubKey><viewingPubKey>
```

where the payload is hex encoded.

---

### 5.3.3 Public Key Construction

The meta-address is derived from the spending and viewing private keys introduced in Section 5.2.

Let

$$
sk_{\text{spend}}
$$

and

$$
sk_{\text{view}}
$$

denote the corresponding private scalars.

Their public keys are

$$
pk_{\text{spend}}=sk_{\text{spend}}G
$$

and

$$
pk_{\text{view}}=sk_{\text{view}}G
$$

where

$$
G
$$

is the secp256k1 generator point.

Both public keys are stored in compressed form before inclusion in the meta-address.

---

### 5.3.4 Publishing Meta-Addresses

Meta-addresses may be distributed through either off-chain or on-chain mechanisms.

### Off-Chain Distribution

The preferred approach is direct sharing.

Examples include:

* QR codes
* Contact exchange
* Messaging applications
* Application-level address books

Because no on-chain registration occurs, no public relationship exists between the user's EOA and receiving identity.

This provides the strongest privacy guarantees.

### ERC-6538 Registration

Users may optionally register their meta-address through the ERC-6538 Registry.

The registry maps an EOA to a meta-address using:

```solidity
registerKeys(
    uint256 schemeId,
    bytes stealthMetaAddress
)
```

Registration simplifies discovery but introduces an explicit public link between:

$$
\text{EOA}
\longrightarrow
M
$$

This trade-off improves usability at the cost of additional public metadata.

GhostShard therefore treats registration as optional rather than mandatory.

---

### 5.3.5 Receiving Identity Separation

A fundamental property of the design is the separation between receiving identities and ownership identities.

The meta-address itself:

* Cannot hold assets
* Cannot authorize transactions
* Cannot execute protocol actions
* Cannot spend shards

Its sole purpose is the derivation of future ownership units.

This separation ensures that publication of a meta-address does not expose any spendable asset.

Even complete knowledge of

$$
M=(pk_{\text{spend}}, pk_{\text{view}})
$$

provides no ability to control shards.

Only possession of the corresponding private keys grants ownership.

---

### 5.3.6 Dual-Key Architecture

GhostShard inherits ERC-5564's dual-key model.

The spending key and viewing key serve distinct purposes.

The spending key participates in stealth ownership generation.

The viewing key participates in recipient discovery.

Formally,

$$
pk_{\text{spend}}
\neq
pk_{\text{view}}
$$

and

$$
sk_{\text{spend}}
\neq
sk_{\text{view}}
$$

with both keys derived independently through the domain-separated hierarchy described in Section 5.2.

This separation ensures that ownership discovery and asset spending remain independent capabilities.

Consequently:

* Discovery authority does not imply spending authority.
* Spending authority does not reveal viewing secrets.
* Auditing workflows can be implemented without exposing ownership control.

This property becomes important for selective disclosure mechanisms introduced later in this chapter.

---

### 5.3.7 Privacy Properties

Meta-addresses provide several important privacy guarantees.

### Reusable Receiving Identity

A single meta-address can safely receive an unlimited number of transfers.

Each transfer produces a distinct stealth shard.

Observers cannot determine whether two shards originated from the same meta-address.

### Recipient Unlinkability

Given a stealth shard address

$$
A_s
$$

an observer cannot efficiently determine which recipient meta-address generated it.

The derivation process requires knowledge of private viewing material unavailable to third parties.

### No Ownership Exposure

The meta-address itself never appears as the owner of any asset.

Only derived shards hold assets.

Ownership therefore remains separated from public receiving identities.

### Optional Public Discoverability

Users may choose whether to register their meta-address publicly.

This allows privacy and usability requirements to be balanced according to application needs.

---

### 5.3.8 Future Extensions

ERC-5564 intentionally supports multiple cryptographic schemes through the scheme identifier field.

Future GhostShard versions may introduce:

* Post-quantum stealth address schemes
* Alternative elliptic curves
* Threshold ownership constructions
* Hardware-backed receiving identities

The meta-address abstraction remains unchanged.

Only the underlying cryptographic scheme associated with the scheme identifier would change.

This design provides a forward-compatible migration path while preserving the remainder of the GhostShard architecture.

---

### 5.3.9 Summary

Meta-addresses provide the public receiving layer of GhostShard.

They allow recipients to publish a reusable receiving identity while keeping ownership distributed across independent stealth shards.

By separating receiving identities from ownership identities, GhostShard avoids exposing long-lived ownership relationships while preserving compatibility with the ERC-5564 ecosystem.

The next section describes how senders use a recipient's meta-address to derive one-time shard addresses through elliptic-curve Diffie-Hellman key exchange.
