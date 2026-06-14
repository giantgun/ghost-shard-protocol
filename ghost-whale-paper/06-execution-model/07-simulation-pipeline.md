## 6.7 Simulation Pipeline

GhostShard replaces heuristic gas estimation with a simulation-driven execution model.

Before a transaction is approved or broadcast, both the paymaster and relayer independently simulate execution. This approach allows gas limits to be derived from actual protocol behavior rather than static estimates, improving accuracy while reducing the risk of underfunded execution.

This section describes the Double Simulation engine used for gas estimation and the relayer-side simulation process used for execution validation.

---

### 6.7.1 Double Simulation

GhostShard v0 derives gas limits through native node simulation rather than heuristic gas formulas.

#### Motivation

Traditional gas estimators often rely on hardcoded models of the form:

```text
gas =
baseCost
+ perShardCost × shardCount
+ perCommandCost × commandCount
+ ...
```

Such approaches require protocol-specific gas accounting logic that must be maintained as contracts evolve, gas schedules change, and execution environments differ across networks.

GhostShard aims to remain compatible with existing EVM infrastructure while avoiding unnecessary protocol complexity. Rather than maintaining custom estimation formulas, the protocol derives gas limits directly from node execution through simulation.

This approach provides a simpler operational model, automatically adapts to future protocol upgrades, and captures chain-specific costs such as rollup data fees without requiring continual recalibration of estimation heuristics.

#### Architecture

The Double Simulation engine performs two independent simulations, one with state overrides.

**Simulation 1 — Execution Simulation**

```text
eth_call
```
The Router returns the following:

* Inner mesh gas used $$(G_{\text{inner}})$$
* Contract level gas used $$(G_{\text{execution}})$$

Measures pure EVM execution costs, including:

* Signature verification
* Delegation integrity checks
* Transient storage operations
* Asset transfer execution
* ERC-5564 announcement processing

**Simulation 2 — Total Cost Simulation**

```text
eth_estimateGas
```
derives:

The total node level gas $$(G_{\text{totalEstimate}})$$

Measures the complete node-level transaction cost, including:

* EVM execution
* EIP-7702 authorization overhead
* Calldata costs
* L1 data fees on rollups(If applicable)
* Client-specific transaction overhead

#### Gas Layer Separation

Combining the two simulations isolates the major gas components.

Pre-verification overhead is derived as:

$$
G_{\text{preVerification}}=G_{\text{totalEstimate}}-G_{\text{execution}}
$$

Verification overhead is derived as:

$$
G_{\text{verification}}=G_{\text{execution}}-G_{\text{inner}}
$$

The execution gas limit is then computed as:

$$
G_{\text{call}}=1.3
\times
G_{\text{inner}}
+
40{,}000
$$

The 30% multiplier provides tolerance for minor execution variance, while the fixed buffer accounts for storage initialization and settlement overhead.

#### State Overrides

Both simulations execute against identical temporary state overrides.

**Synthetic Relayer Balance**

A temporary balance is assigned to the simulated relayer address, ensuring sponsorship checks cannot fail due to insufficient funds.

**Delegation Overrides**

Input shard accounts are temporarily assigned delegated runtime code:

```text
0xef0100 || SHARD_IMPLEMENTATION
```

This reproduces the post-authorization execution environment without modifying chain state.

#### Properties

The Double Simulation architecture provides several advantages.

**Execution Accuracy**

Gas limits are derived from actual execution behavior rather than heuristic assumptions.

**Protocol Adaptability**

Gas schedule changes automatically propagate into estimates without requiring protocol updates.

**Rollup Compatibility**

Network-specific costs such as calldata pricing and L1 settlement fees are captured automatically.

**Deterministic Estimation**

Paymasters and relayers execute the same simulation pipeline and therefore derive identical gas parameters.

#### Limitations

Simulation remains an approximation of future execution.

Minor differences may arise from storage warming effects, state changes between simulation and inclusion, or client-specific execution details.

The execution cushion is intended to absorb these variations.

---

### 6.7.2 Relayer Simulation

Before broadcasting a transaction, the relayer independently validates that execution is expected to succeed.

This simulation serves as a relayer-side safety mechanism and is separate from paymaster gas estimation.

#### Execution Validation

The relayer performs an execution simulation using the same state-override environment employed by the Double Simulation engine.

The simulation verifies that:

* Delegation integrity checks succeed.
* Sponsorship validation succeeds.
* Transfer signatures are valid.
* Mesh execution completes without reverting.

Transactions that fail simulation are rejected before broadcast.

This prevents relayers from submitting transactions that are known to fail.

#### FIFO Scheduling

Accepted transactions are inserted into a first-in-first-out execution queue.

Transactions are broadcast sequentially rather than concurrently.

This design:

* Prevents relayer nonce conflicts.
* Simplifies sponsorship accounting.
* Eliminates relayer-side transaction reordering.

Receipt tracking occurs asynchronously after broadcast.

A background process monitors transaction confirmation and updates sponsorship accounting independently of queue execution.

#### Private Transaction Submission

Transactions are broadcast through private RPC infrastructure whenever available.

Private submission reduces exposure to public mempool observers and mitigates front-running and transaction-copying attacks.

Examples include builder-connected RPC endpoints and private order-flow networks.

#### Censorship Resistance

Relayers are not trusted for liveness.

A relayer may refuse to broadcast a transaction, delay execution, or selectively censor users.

GhostShard mitigates these risks through multiple submission paths:

* Users may submit to multiple relayers simultaneously.
* Users may self-relay transactions directly.
* Users may resubmit transactions if expected inclusion does not occur.

As a result, relayers can delay execution but cannot prevent users from eventually reaching the network.

#### Relayer Protection

Relayer simulation serves a defensive purpose.

By validating execution before broadcast, relayers avoid submitting transactions that would immediately fail validation.

This reduces unnecessary network load, protects sponsorship capacity, and prevents avoidable execution failures from entering the relay queue.
