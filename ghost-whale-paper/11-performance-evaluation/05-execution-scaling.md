## 11.5 Execution Cost Scaling

This section isolates the **asset movement layer** of GhostShard — the gas consumed by actual asset transfers, announcement publication, and mesh settlement logic.

Execution gas is measured directly from the `inner_execution_gas` value emitted by the `MeshExecuted` event:

$$
G_{\text{execution}}
$$

Unlike preverification and verification costs, execution gas reflects productive protocol work rather than authorization overhead. As a result, execution gas constitutes the largest component of total gas consumption across all measured transactions.

---

### Figure 11.5.1 — Exxecution Gas vs Transfer Count

![Figure 11.4.2 — Verification Gas vs Transfer Commands](../figures/transfer-vs-png.png)

---

#### Observation

Execution gas exhibits a strong positive linear relationship with transfer count.

Across the measured dataset:

* Minimum execution gas: **98,909 gas**
* Maximum execution gas: **1,301,237 gas**
* Transfer count range: **1–29 transfers**

The relationship appears highly linear throughout the observed operating range, with no visible evidence of super-linear growth.

Approximate regression:

$$
G_{\text{execution}}
\approx
83,001
+
44,476 \cdot N_t
$$

with:

$$
R^2 \approx 0.96
$$

This indicates that transfer count explains nearly all observed execution-gas variance.

#### Interpretation

Execution cost scales primarily with the number of transfer commands executed inside the mesh.

The fixed intercept represents:

* Mesh execution setup.
* Internal routing overhead.
* Initial state preparation.

The linear term represents per-transfer work, including:

* Asset transfer execution.
* Announcement generation.
* Output creation.
* Settlement bookkeeping.

The absence of visible curvature in the regression suggests that GhostShard's execution layer scales linearly over the measured range.

---

### Figure 11.5.2 — Execution Gas vs Output Shards

![Figure 11.4.2 — Verification Gas vs Transfer Commands](../figures/output-vs-execution.png)

---

#### Observation

Execution gas also increases with output count.

Approximate regression:

$$
G_{\text{execution}}
\approx
155,426 \cdot N_o
-
23,038
$$

with:

$$
R^2 \approx 0.72
$$

The relationship is positive but noticeably weaker than the transfer-count relationship.

#### Interpretation

Output count influences execution gas because every output typically requires:

* Output construction.
* Ownership assignment.
* ERC-5564 announcement publication.
* Settlement bookkeeping.

However, output count is not an independent driver of protocol work.

Many transactions with identical output counts exhibit significantly different execution costs because transfer counts vary substantially.

As a result:

$$
R^2_{N_t}

>

R^2_{N_o}
$$

demonstrating that transfer count remains the dominant execution-cost predictor.

---

### Figure 11.5.3 — Average Execution Gas Composition by Asset Type

![Figure 11.4.2 — Verification Gas vs Transfer Commands](../figures/avg-exec-gas-by-asset.png)

---

### Table 11.5.1 — Average Execution Gas grouped by Asset Type.

| Asset Type | Average Execution Gas |
| ---------- | --------------------: |
| ERC-721    |                98,909 |
| Native     |               738,512 |
| ERC-20     |               776,367 |

#### Observation

Execution gas differs across asset classes.

Several observations emerge:

* ERC-20 transactions exhibit the highest average execution gas.
* Native transfers are slightly cheaper than ERC-20 transfers.
* ERC-721 transfers are substantially cheaper in absolute terms due to the measured sample consisting only of single-input, single-output transfers.

The relatively small gap between Native and ERC-20 execution costs suggests that GhostShard amortizes much of its protocol overhead across both asset classes.

---

### Figure 11.5.4 — Execution Share of Total Gas

![Figure 11.4.2 — Verification Gas vs Transfer Commands](../figures/execution-share.png)

---

#### Observation

Execution gas is the dominant contributor to total gas consumption across all asset classes.

### Table 11.5.2 — Average Execution Share of Total Gas.

| Asset Type | Execution Share |
| ---------- | --------------: |
| ERC-721    |           42.7% |
| Native     |           63.9% |
| ERC-20     |           60.5% |

#### Interpretation

Several conclusions follow:

* Execution consistently represents the largest gas component.
* Verification and preverification overheads remain bounded.
* As transaction complexity increases, productive protocol work dominates total cost.
* GhostShard spends the majority of gas on asset movement rather than authorization logic.

This behavior is desirable because it indicates that gas consumption scales primarily with useful work rather than administrative overhead.

---

### Execution Scaling Summary

| Relationship                    | Approximate $R^2$ | Interpretation      |
| ------------------------------- | ----------------: | ------------------- |
| $G_{\text{execution}}$ vs $N_t$ |              0.96 | Strongest predictor |
| $G_{\text{execution}}$ vs $N_o$ |              0.72 | Secondary predictor |

The results demonstrate that execution gas scales linearly with protocol activity.

Transfer command count remains the fundamental unit of work inside GhostShard's execution layer and explains nearly all observed execution-gas variance.

Consequently, transaction complexity is best characterized by:

$$
N_t
$$

rather than input count or output count, reinforcing the conclusion reached in Section 11.3.
