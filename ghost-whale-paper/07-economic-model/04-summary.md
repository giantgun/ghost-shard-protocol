## 7.4 Chapter Summary

GhostShard's economic model is designed to align the incentives of all protocol participants while ensuring that financial exposure remains bounded throughout execution.

The protocol separates transaction execution from transaction funding through sponsored execution. Users authorize transfers, paymasters provide execution funding, and relayers provide transaction inclusion. Each participant performs a narrowly scoped role with clearly defined incentives and responsibilities.

### Economic Roles

| Participant | Primary Responsibility        | Economic Incentive                                                            |
| ----------- | ----------------------------- | ----------------------------------------------------------------------------- |
| User        | Authorize asset movement      | Obtain privacy-preserving transfers without managing execution infrastructure |
| Paymaster   | Sponsor transaction execution | Support users, applications, or future fee-based sponsorship models           |
| Relayer     | Broadcast transactions        | Capture execution margin while receiving gas reimbursement                    |                                                  |

### Risk Allocation

The protocol intentionally distributes risk according to participant responsibilities.

| Participant | Primary Economic Risk                                               |
| ----------- | ------------------------------------------------------------------- |
| User        | Failed execution of self-funded transactions                        |
| Paymaster   | Sponsorship costs bounded by prefunded limits                       |
| Relayer     | Broadcasting transactions that later become unprofitable or invalid |

No participant is exposed to unbounded financial liability.

Sponsored execution is constrained through paymaster deposits, escrow accounting, prefunding, and settlement reconciliation. Relayers independently verify execution conditions before broadcasting, while paymasters retain explicit control over sponsorship authorization.

### Economic Properties

The resulting system provides four key properties:

1. **Execution costs remain bounded and predictable.**
2. **Sponsorship capacity cannot be over-allocated.**
3. **Participants retain control over their own economic exposure.**
4. **Honest participation is economically preferable to deviation.**

These properties allow GhostShard to provide gas abstraction and privacy-preserving transfers without introducing custodial intermediaries, trusted operators, or protocol-level economic dependencies.

### Future Evolution

The current v0 model prioritizes simplicity and deployability.

Future versions may introduce:

* Paymaster staking mechanisms.
* Competitive sponsorship markets.
* ERC-20-denominated gas payment systems.
* Decentralized relay ecosystems.
* Alternative sponsorship and reimbursement models.

These extensions are intended to strengthen market formation and participant incentives without changing the protocol's core execution architecture.

In summary, GhostShard's economic model ensures that transaction execution, sponsorship, and settlement remain economically sustainable while preserving the protocol's broader goals of self-custody, privacy, and compatibility with existing EVM infrastructure.
