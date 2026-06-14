## 7.3 Escrow Accounting

When a relayer accepts a mesh transaction for broadcast, the paymaster's on-chain deposit must cover the transaction's worst-case gas cost. But the relayer does not immediately know the actual cost — it only knows the prefund amount (the maximum). The actual cost is only known after the transaction is included in a block and executed.

This creates a timing problem: between the moment the relayer accepts the transaction and the moment the on-chain reconciliation occurs, the paymaster's deposit is "committed" but not yet charged. During this window, the relayer must ensure it does not over-commit the paymaster's deposit.

### 7.3.1 In-Flight Debt Accumulator

The relayer maintains an in-memory `paymasterDebtAccumulator`, which tracks the aggregate worst-case liability of all pending (in-flight) transactions associated with a given paymaster.

For a paymaster \(p\), the accumulated liability is:

$$
\text{InFlightDebt}_p=\sum_{i=1}^{n}
\text{WorstCaseCost}_i
$$

where each term represents the maximum possible settlement cost of a pending transaction.

Before accepting a new relay request, the relayer computes the paymaster's available sponsorship capacity:

$$
\text{AvailableCapacity}_p=
\text{Deposit}_p-\text{InFlightDebt}_p
$$

The worst-case execution cost of the candidate transaction is:

$$
\text{WorstCaseCost}=
\left(
G_{\text{verification}}
+
G_{\text{execution}}
+
G_{\text{preVerification}}
\right)
\times
\text{gasPrice}
$$

The transaction is accepted only if:

$$
\text{AvailableCapacity}_p
\ge
\text{WorstCaseCost}
$$

If the condition holds, the relayer reserves the corresponding sponsorship capacity by adding the transaction's worst-case cost to the paymaster's in-flight debt accumulator and then enqueues the transaction for execution.

### 7.3.2 Consistency Guarantees

The escrow accounting system provides two critical guarantees:

1. **No over-commitment.** The sum of worst-case costs for all in-flight transactions never exceeds the paymaster's on-chain deposit.
2. **No double-spending of deposits.** Each transaction's worstCaseCost is deducted from the net available balance before the transaction is enqueued. Even if two transactions are in flight simultaneously, their combined worst-case costs cannot exceed the deposit.

### 7.3.3 Escrow Release

The escrow lock is released when the transaction is confirmed on-chain. A background poller watches for the transaction receipt and:

1. Reads the actual `totalGasCost` from the `MeshExecuted` event.
2. Subtracts `worstCaseCost` from the in-flight debt accumulator (releasing the lock).
3. The difference between `worstCaseCost` and `actualCost` is the surplus that was returned to the paymaster's deposit on-chain.

If the receipt is not observed within 120 seconds, the escrow lock is released anyway (timeout fallback). This prevents permanent deadlock in case of network issues.

### 7.3.4 Edge Cases

**Transaction reverts.** If a transaction reverts, the on-chain prefund is fully returned to the paymaster (the debit is part of the reverted state). The relayer's in-flight debt is released by the background poller when it observes the receipt.

**Transaction not mined.** If a transaction is not mined within the timeout, the escrow lock is released. The transaction may still be mined later. In this case, the on-chain reconciliation will still work correctly because the prefund debit and surplus refund are handled entirely on-chain.

**Paymaster withdrawal during flight.** If the paymaster withdraws funds while a transaction is in flight, the on-chain `InsufficientPaymasterDeposit` check will cause the transaction to revert. The relayer's escrow accounting prevents this in the normal case, but a concurrent withdrawal could create a race condition. The on-chain check is the ultimate safety net.

### 7.3.5 Future Requirement: Paymaster Staking

The current v0 escrow accounting system relies on a simple deposit model: the paymaster deposits ETH into GhostRouter, and the relayer checks that the deposit covers the worst-case cost. This works for a trusted or known paymaster operator, but it does not scale to a competitive relay market with multiple unknown paymasters.

In a multi-paymaster environment, relayers need a reliable way to assess whether a paymaster is trustworthy before accepting and broadcasting transactions. A paymaster could sign a quote, have sufficient deposit at the time of acceptance, and then withdraw funds before the transaction is included in a block — causing the transaction to revert and costing the relayer gas.

Future versions of GhostShard must implement a **paymaster staking mechanism** to address this. It is critical to understand that **staking is entirely separate from gas deposits** — they serve different purposes and exist in different contracts.

**Gas deposits** (the current v0 model) are held in GhostRouter and are used to prefund transaction gas costs. They are a working balance: debited before execution, refunded after settlement. They can be withdrawn at any time (subject to in-flight debt checks).

**Stake** is a separate economic bond locked in future router contracts. It is never used to pay for gas. Its sole purpose is to serve as a trust signal and slashing backing. The two balances are independent:

| Property | Gas Deposit | Stake |
|----------|-------------|-------|
| Contract | GhostRouter | Staking contract |
| Purpose | Prefund gas costs | Trust signal / slashing backing |
| Withdrawable | Yes (subject to in-flight checks) | Only after withdrawal delay |
| Consumed by | Transaction execution | Slashing on misbehavior |
| Amount needed | $\geq$ worst-case gas cost | Determined by relayer trust requirements |

The staking model works as follows:

1. **The paymaster locks a stake** in GhostRouter. This stake is entirely distinct from the gas deposit held. The stake cannot be withdrawn immediately — it is subject to a withdrawal delay.

2. **The relayer uses the stake as a trust signal.** Before accepting a transaction, the relayer checks two separate things: (a) the paymaster's gas deposit in GhostRouter covers the worst-case cost, and (b) the paymaster's staked amount in the staking contract meets the relayer's minimum trust threshold. A paymaster with a large, long-duration stake is less likely to behave maliciously, because the stake can be slashed if the paymaster causes relayer losses.

3. **Slashing conditions.** If a paymaster signs a quote and then withdraws its gas deposit before the transaction is included — causing the transaction to revert and the relayer to lose gas — a portion of the **stake** (not the gas deposit) is slashed and used to compensate the relayer. The gas deposit and the slashed stake are entirely separate pools of funds.

4. **Stake as a yardstick.** The staked amount and withdrawal delay give relayers a concrete metric for deciding which paymasters to trust. A relayer can configure minimum stake requirements and prefer paymasters with larger, longer-duration stakes. This creates a natural market: paymasters who want more relayer volume must stake more and commit to longer durations.

This staking mechanism transforms the relayer's trust decision from a binary "does the deposit cover the cost?" check into a continuous "how trustworthy is this paymaster?" assessment based on separate economic commitment. It is essential for a decentralized, multi-paymaster relay market.
