## Appendix D — Example Mesh Transaction

A complete step-by-step walkthrough of a single mesh transaction, from user intent to on-chain execution. This appendix expands on the abbreviated examples in Chapters 2, 5, and 6.

---

### D.1 Scenario

Alice wants to pay Bob 2.5 ETH privately. Alice's wallet holds 7 shards across 3 ETH denominations. Bob has published his ERC-5564 meta-address.

---

### D.2 Transaction Lifecycle

#### Step 1 — Coin Selection

Alice's SDK filters her shard pool for Native ETH shards and shuffles them:

| Shard   | Balance | Selected?         |
| ------- | ------- | ----------------- |
| Shard A | 0.8 ETH | Yes (payment)     |
| Shard B | 1.0 ETH | Yes (payment)     |
| Shard C | 0.3 ETH | Yes (compression) |
| Shard D | 0.7 ETH | Yes (payment)     |
| Shard E | 0.4 ETH | No                |
| Shard F | 1.2 ETH | No                |
| Shard G | 0.6 ETH | No                |

Selected: Shards A, B, C, D (total: 2.8 ETH).

Shard C is included for compression and is not strictly required to satisfy the payment amount.

#### Step 2 — Allocation Engine

The 2.8 ETH is distributed across payment and change outputs:

| Output   | Type    | Amount   | Recipient             |
| -------- | ------- | -------- | --------------------- |
| Output 1 | Payment | 1.2 ETH  | Bob (stealth shard)   |
| Output 2 | Payment | 1.3 ETH  | Bob (stealth shard)   |
| Output 3 | Change  | 0.15 ETH | Alice (stealth shard) |
| Output 4 | Change  | 0.15 ETH | Alice (stealth shard) |

Payment is split across two outputs to obscure the 2.5 ETH total.

Change is split across two outputs to match the output count.

#### Step 3 — Stealth Address Generation

For each output, the sender generates a fresh ephemeral keypair and derives a stealth address:

```text
For Output 1 (Bob):

ephemeralPrivate e1 <- random
ephemeralPublic  E1 = e1 * G

sharedSecret
s1 = Keccak256(x(e1 * pk_view_Bob))

shardPublic
pk1 = pk_spend_Bob + s1 * G

shardAddress
A1 = last20(Keccak256(pk1_uncompressed))
```

The same process is repeated for Outputs 2, 3, and 4.

Each output produces a unique unlinkable stealth address.

#### Step 4 — Announcement Generation

Each output receives an ERC-5564 announcement:

```text
Announcement 1

schemeId         = 1
stealthAddress   = A1
ephemeralPubKey  = E1
viewTag          = firstByte(s1)
metadata         = AES-256-GCM(K_meta, IV, senderInfo)
```

`senderInfo` contains encrypted payment references such as invoice identifiers and memos.

Only Bob can decrypt this information using his viewing key.

#### Step 5 — Authorization Generation

Each input shard signs two authorizations.

##### EIP-7702 Authorization

Delegates execution to the GhostShard implementation.

```text
authDigest =
Keccak256(
  0x05 ||
  RLP(chainId, implementation, nonce)
)

authSig =
ECDSA(shardPrivateKey, authDigest)
```

##### Transfer Command Signature

Authorizes the specific transfer operation.

```text
cmdDigest =
Keccak256(
  chainId,
  router,
  shard,
  assetType,
  token,
  to,
  value,
  announcements
)

cmdSig =
ECDSA(
  shardPrivateKey,
  EIP-191(cmdDigest)
)
```

#### Step 6 — Command Fusion

Commands targeting the same shard and asset type may be merged.

If Shard A funds multiple outputs, the commands can be fused into a single aggregated transfer.

#### Step 7 — Command Randomization

Transfer commands are shuffled before submission.

Output ordering therefore carries no semantic meaning.

#### Step 8 — Paymaster Quote

The SDK submits the bundle to a paymaster.

The paymaster:

1. Verifies Alice's identity.
2. Runs Double Simulation.
3. Computes gas limits with an execution cushion.
4. Signs a sponsorship quote.

#### Step 9 — Relayer Validation

The relayer:

1. Checks paymaster escrow sufficiency.
2. Simulates execution.
3. Inserts the bundle into the relay queue.
4. Broadcasts an EIP-7702 transaction.

#### Step 10 — On-Chain Execution

```text
EVM processes EIP-7702 authorizations

Shard A delegates to GhostShard
Shard B delegates to GhostShard
Shard C delegates to GhostShard
Shard D delegates to GhostShard

GhostRouter.executeMesh()

1. Pre-scan
   - Verify delegated code

2. Prefund
   - Reserve maximum gas cost

3. Validate
   - Verify paymaster quote

4. innerExecuteMesh()

   For each command:

   - Check transient deduplication
   - Verify shard not already spent
   - Mark shard as spent
   - Recover signer
   - Execute transfer

   For each announcement:

   - Validate format
   - Emit ERC-5564 announcement

5. Settlement

   - Measure actual gas
   - Refund surplus
   - Pay relayer
```

#### Step 11 — Post-Execution Synchronization

##### Alice

Alice's SDK:

* Removes consumed shards A, B, C, and D.
* Adds change shards (Outputs 3 and 4).
* Advances the sync cursor.

##### Bob

Bob's SDK:

* Scans new ERC-5564 announcements.
* Uses view-tag filtering.
* Trial decrypts surviving announcements.
* Recovers Outputs 1 and 2.
* Adds two new shards (1.2 ETH and 1.3 ETH).

---

### D.3 On-Chain Visibility

| Visible                       | Hidden                                  |
| ----------------------------- | --------------------------------------- |
| Four input shards consumed    | Controller of input shards              |
| Four output shards created    | Controller of output shards             |
| Four ERC-5564 announcements   | Decrypted sender metadata               |
| Relayer as transaction sender | Alice's identity                        |
| Total gas consumed            | Individual transfer amounts             |
| MeshExecuted event            | Which outputs are payment versus change |

The observer sees four inputs and four outputs.

There are:

```text
2^4 - 2 = 14
```

possible partitions of payment outputs and change outputs.

The actual payment of 2.5 ETH spread across two outputs is therefore obscured among many valid interpretations.
