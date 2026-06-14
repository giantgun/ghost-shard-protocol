## 11.8 Limitations

The results presented in this evaluation provide evidence that GhostShard scales linearly across the tested transaction range and that protocol costs can be decomposed into predictable pre-verification, verification, and execution components. However, several limitations should be considered when interpreting these results.

### Dataset Size

The evaluation is based on 22 measured mesh transactions executed on Arbitrum Sepolia.

These transactions span:

* 1–29 transfer commands
* 1–9 input shards
* 1–8 output announcements
* Native ETH, ERC-20, and ERC-721 assets

While the observed relationships exhibit strong linearity, the dataset remains relatively small compared to the space of possible transaction configurations.

Future evaluations should include larger transaction corpora covering hundreds or thousands of mesh executions to further validate the reported regression models.

---

### Asset Coverage

Native ETH and ERC-20 transfers constitute the majority of measured transactions.

ERC-721 measurements are limited to two single-transfer transactions.

Consequently:

* ERC-721 baseline costs are measured.
* ERC-721 scaling behavior is not empirically validated.
* Multi-transfer ERC-721 mesh executions remain future work.

The conclusions regarding linear execution scaling therefore apply most strongly to Native ETH and ERC-20 transfers.

---

### Network Environment

All measurements were collected on Arbitrum Sepolia.

Gas accounting is expected to remain structurally similar across EVM-compatible networks; however:

* calldata pricing differs across chains,
* base transaction costs vary,
* execution environments evolve over time,
* future protocol upgrades may affect gas accounting.

Absolute gas values should therefore be interpreted as implementation-specific measurements rather than universal constants.

The scaling relationships are expected to be more portable than the absolute gas numbers.

---

### Discovery Performance

Announcement discovery results are derived from protocol structure and ERC-5564 view-tag mechanics rather than direct large-scale network measurements.

The evaluation demonstrates the theoretical reduction in cryptographic workload:

$$
256\times
$$

through view-tag filtering.

However:

* million-announcement datasets were not generated,
* large-scale wallet synchronization was not benchmarked,
* RPC latency effects were not directly measured.

The discovery analysis should therefore be interpreted as an analytical scalability evaluation rather than a production-scale benchmark.

---

### Compression Behavior

The compression examples demonstrate the reduction in shard count achievable through mesh execution.

However, long-term compression equilibrium was not evaluated.

Specifically:

* user deposit patterns were not simulated,
* user withdrawal patterns were not simulated,
* adversarial fragmentation behavior was not simulated,
* multi-month shard evolution was not modeled.

As a result, the observed compression efficiency should be viewed as representative examples rather than equilibrium measurements.

---

### Throughput and Concurrency

This evaluation focuses on per-transaction cost rather than network throughput.

The following metrics were not measured:

* paymaster throughput,
* relayer throughput,
* bundler throughput,
* concurrent user activity,
* announcement propagation rates,
* sustained network load.

Consequently, the results establish transaction-level scalability but do not characterize maximum network capacity.

---

### Implementation Version

All measurements reflect the current GhostShard implementation.

Future protocol improvements may materially alter observed costs, including:

* authorization compression,
* announcement aggregation,
* calldata optimization,
* verification-path improvements,
* compression heuristics.

Therefore, the reported values should be interpreted as measurements of the evaluated implementation rather than permanent protocol limits.

---

### Threats to Validity

Several factors may influence the generality of the reported results:

* Limited ERC-721 sampling.
* Testnet execution environment.
* Absence of large-scale user simulations.
* Absence of production-scale discovery benchmarks.
* Absence of long-term compression modeling.

Despite these limitations, the strongest findings of the evaluation remain consistent across the entire dataset:

* Total gas scales approximately linearly with transfer count.
* Verification gas scales approximately linearly with transfer count.
* Execution gas scales approximately linearly with transfer count.
* Gas-per-transfer decreases as bundle size increases.
* View-tag filtering reduces discovery workload by approximately 256×.

These observations support the central claim that GhostShard achieves scalable privacy-preserving asset transfer through transfer-count-driven execution rather than shard-count-driven execution.
