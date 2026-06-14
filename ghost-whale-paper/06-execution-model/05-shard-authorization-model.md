## 6.5 Shard Authorization Model

GhostShard requires three independent authorization layers before a mesh transaction can execute:

1. **EIP-7702 delegation**, which authorizes executable code on each shard.
2. **Multi-authorization execution**, which enables multiple shards to participate in a single atomic transaction.
3. **Transfer authorization**, which authorizes specific asset movements from each shard.

Together, these layers ensure that execution authority, transaction participation, and asset transfers are independently validated.

---

### 6.5.1 EIP-7702 Delegation

Before a shard can participate in a mesh transaction, it must temporarily delegate execution to the GhostShard implementation contract.

#### Authorization Creation

For each input shard, the SDK constructs an authorization tuple:

$$
(\text{chainId}, \text{implementation}, \text{nonce})
$$

and signs it using the shard's private key.

The authorization digest is computed as:

$$
H_{\text{7702}}=\operatorname{Keccak256}
\left(
0x05
;|;
\operatorname{RLP}
(
\text{chainId},
\text{implementation},
\text{nonce}
)
\right)
$$

where (0x05) is the EIP-7702 transaction type prefix.

The resulting signature ((yParity, r, s)) is included in the transaction's authorization list.

#### Fixed Nonce Model

GhostShard adopts a UTXO-style ownership model in which every shard may be consumed at most once.

As a result,  for v0 authorization nonces remain permanently fixed at:

$$
\text{nonce} = 0
$$

Replay protection is provided by the router's permanent spent-state tracking rather than by sequential account nonces.

#### On-Chain Processing

When the EIP-7702 transaction is received, the EVM processes the authorization list before executing the transaction body.

For each authorization:

1. Verify the authorization signature.
2. Recover the shard address.
3. Install delegated code
4. Continue to the next authorization.

After authorization processing completes, every participating shard executes using the delegated GhostShard implementation.

#### Delegation Persistence

Delegations remain installed until explicitly replaced or cleared.

GhostShard does not require delegation cleanup because spent shards are permanently invalidated through router-enforced spent-state tracking.

This eliminates the need for an additional cleanup transaction and reduces overall execution costs.

---

### 6.5.2 Multi-Authorization Execution

A mesh transaction may consume multiple shards simultaneously.

To support this, a single EIP-7702 transaction carries one authorization per input shard.

All authorizations are processed before execution begins, enabling atomic multi-shard execution without requiring specialized bundler infrastructure or account-abstraction entry points.

#### Authorization Structure

```solidity
struct Authorization {
    address targetAddress;
    uint32 chainId;
    uint32 nonce;
    uint8 yParity;
    bytes32 r;
    bytes32 s;
}
```

Every authorization delegates to the same GhostShard implementation contract, while each authorization is signed by a different shard private key.

#### Transient Storage Deduplication

A single shard may appear in multiple transfer commands within the same mesh transaction.

For example, one shard may fund several payment outputs and several change outputs simultaneously.

To prevent false double-spend detection, GhostRouter uses EIP-1153 transient storage to distinguish:

* shards already consumed in a previous transaction; and
* shards already processed within the current transaction.

The first occurrence of a shard performs permanent spent-state validation.

Subsequent occurrences within the same transaction are permitted through transient tracking.

This allows a shard to participate in multiple transfer commands while preserving global single-spend guarantees.

#### Authorization Uniformity

During execution, the router verifies that each shard's delegated implementation matches the implementation authorized by the corresponding EIP-7702 authorization.

This prevents delegated code substitution and guarantees execution consistency across all participating shards.

---

### 6.5.3 Transfer Authorization

Delegation authorizes code execution.

Transfer authorization authorizes the specific movement of assets.

Every transfer command is signed independently using the shard's private key under EIP-191.

#### Command Structure

```solidity
struct TransferCommand {
    address shard;
    AssetType assetType;
    address token;
    address to;
    uint256 value;
    bytes signature;
    Authorization authorization;
}
```

Each command represents a single asset transfer originating from a specific shard.

#### Signature Construction

The SDK constructs a transaction-specific authorization digest:

$$
H_{\text{cmd}}=\operatorname{Keccak256}
\Big(
\text{chainId},
\text{router},
\text{shard},
\text{assetType},
\text{token},
\text{recipient},
\text{value},
\text{announcements}
\Big)
$$

The shard private key signs this digest using EIP-191.

#### Announcement Binding

The complete announcement set is included in the signed payload.

As a result, a valid transfer authorization is inseparable from the stealth addresses and encrypted metadata created during transaction construction.

An attacker cannot modify announcement data, substitute recipients, or redirect outputs without invalidating the signature.

#### Domain Separation

The inclusion of:

* `chainId`, and
* `router`

provides domain separation.

This prevents:

* cross-chain replay attacks;
* cross-router replay attacks; and
* accidental interpretation as a valid Ethereum transaction.

#### On-Chain Verification

During execution, GhostRouter performs the following validation steps:

1. Reconstruct the command digest.
2. Apply the EIP-191 message prefix.
3. Recover the signing address.
4. Verify that the recovered address equals the command's shard address.

If verification fails, execution reverts immediately.

#### Command Fusion

After transaction construction, commands sharing the same:

$$
(\text{shard},\ \text{assetType},\ \text{token},\ \text{recipient})
$$

may be merged into a single command by summing transfer amounts.

Fusion reduces signature verification costs and transfer overhead while preserving execution semantics.

ERC-721 commands are excluded from fusion because token identifiers are non-additive.

All signatures are produced after fusion, ensuring that the final aggregated transfer amount is cryptographically authorized.
