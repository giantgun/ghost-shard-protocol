# 11. Performance Evaluation

> **Question:** What are the measurable operational costs and scaling properties of the protocol?

This chapter evaluates GhostShard v0 on a test Network. The evaluation is structured around three themes:

1. **Gas decomposition** — where is gas spent?
2. **Scaling behavior** — how do costs grow with transaction complexity?
3. **Amortization** — how does effective cost per transfer change as more work is bundled?

The number of transfer commands $N_t$, input shards $N_i$, and output shards $N_o$ are **observed variables** determined by the coin-selection and compression algorithms. Gas costs are analyzed as they emerge from real protocol behavior. All transaction hashes are provided for independent verification.

