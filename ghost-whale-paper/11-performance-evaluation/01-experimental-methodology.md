## 11.1 Experimental Methodology

This chapter evaluates the performance characteristics of the GhostShard v0 reference implementation. The objective of the evaluation is not to establish optimal gas costs, but rather to analyze protocol behavior, cost decomposition, scalability characteristics, and transaction amortization under realistic operating conditions.

All measurements were collected from real protocol executions on a public Ethereum-compatible network.

---

### 11.1.1 Test Network

All experiments were conducted on **Arbitrum Sepolia** (Chain ID 421614).

Arbitrum Sepolia was selected because it supports EIP-7702, provides deterministic transaction receipts, and enables reproducible testing under realistic execution conditions.

All reported measurements were obtained from successful on-chain transactions and can be independently verified using the corresponding transaction hashes included in the evaluation dataset.

---

### 11.1.2 Implementation Versions

| Component          | Compiler Version  | Contract Address                             |
| ------------------ | ----------------- | -------------------------------------------- |
| GhostRouter        | Solidity 0.8.24^  | `0x6f67E047D1Fe5de0b62b187c28dB1cf1F4f560fb` |
| GhostShard         | Solidity 0.8.24^  | `0x295549A545E41af6cbCe09AbF012de172AC321AE` |
| ERC-5564 Announcer | Solidity 0.8.23   | `0x55649E01B5Df198D18D95b5cc5051630cfD45564` |

All contracts were compiled with the Solidity optimizer enabled:

$$
[
\texttt{runs}=200
]
$$

External dependencies include OpenZeppelin implementations of:

* ERC-20
* ERC-721
* ECDSA
* SafeERC20
* ReentrancyGuard

---

### 11.1.3 Evaluation Scope

The evaluation focuses on three primary questions:

1. How does transaction cost scale with protocol complexity?
2. Where is gas consumed during execution?
3. Does batching multiple transfers within a mesh transaction provide amortization benefits?

The analysis therefore concentrates on:

* Input shard count
* Output count
* Transfer count
* Authorization overhead
* Execution overhead
* Asset-type differences

rather than absolute gas minimization.

It is important to note that **GhostShard v0 is a correctness-oriented reference implementation and has not undergone gas optimization**. Consequently, the reported measurements should be interpreted as observations of architectural behavior rather than lower bounds on protocol cost.

---

### 11.1.4 Data Collection

Gas measurements were obtained directly from transaction receipts and protocol telemetry emitted by the `MeshExecuted` event during execution.

Conceptually, the event records:

$$
[
\texttt{MeshExecuted}
(
\texttt{totalGasUsed},
\texttt{innerCallGasUsed},
\ldots
)
]
$$

For each transaction, the following metrics were recorded:

| Metric          | Description                              |
| --------------- | ---------------------------------------- |
| $(G_{total})$     | Total transaction gas consumed           |
| $(G_{contract})$ | Gas consumed by contract logic |
| $(G_{execution})$ | Gas consumed inside `innerExecuteMesh()` |
| $(N_i)$           | Number of input shards                   |
| $(N_o)$           | Number of output announcements           |
| $(N_t)$           | Number of transfers executed             |
| Asset Type      | Native ETH, ERC-20, or ERC-721           |

From these measurements, two additional quantities are derived:

### Preverification Gas

Preverification gas captures costs imposed by transaction-level authorization processing, EIP-7702 authorization handling, calldata validation, and node-level execution overhead.

$$
[
G_{preverification}=G_{total}-G_{contract}
]
$$

where:

$$
[
G_{contract}
]
$$

represents total gas consumed after execution enters the router contract.

### Verification Gas

Verification gas captures protocol-level validation costs performed by the router prior to asset movement.

Examples include:

* Signature verification
* Delegation validation
* Authorization checks
* Replay protection checks
* State validation

Verification gas is computed as:

$$
[
G_{verification}=G_{contract}-G_{execution}
]
$$

where:

$$
[
G_{execution}
]
$$

represents gas consumed by actual mesh execution and asset-transfer logic.

---

### 11.1.5 Asset Classes

Measurements were collected across all asset types currently supported by GhostShard v0.

#### Native ETH

Native asset transfers are executed through:

$$
[
\texttt{transferNative()}
]
$$

#### ERC-20

Token transfers are executed through:

$$
[
\texttt{transferERC20()}
]
$$

#### ERC-721

NFT transfers are executed through:

$$
[
\texttt{transferERC721()}
]
$$

Evaluating multiple asset classes allows the analysis to distinguish protocol overhead from asset-specific execution costs.

---

### 11.1.6 Transaction Sample Construction

The evaluation dataset was generated using the GhostShard SDK operating under realistic wallet conditions.

Transaction structure was not manually engineered for benchmarking purposes.

Instead:

* Coin selection determined input shard counts.
* Compression logic determined transfer structure.
* Recipient generation determined output counts.
* Wallet state influenced mesh composition.

Consequently, the values of

$$
[
N_i,
\quad
N_o,
\quad
N_t
]
$$

vary naturally across the dataset.

This methodology ensures that measurements reflect actual protocol behavior rather than artificially constructed benchmark scenarios.

The resulting dataset therefore captures realistic execution patterns likely to be encountered by future GhostShard versions.

---

### 11.1.7 Reproducibility

All measurements originate from publicly verifiable on-chain transactions executed on Arbitrum Sepolia.

The complete evaluation dataset includes:

* Transaction hashes
* Gas measurements
* Input counts
* Output counts
* Transfer counts
* Asset classifications

This enables independent verification and reproduction of all reported results.
