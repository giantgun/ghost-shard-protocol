## 11.7 Discovery Performance

GhostShard inherits the ERC-5564 announcement discovery model.

Under ERC-5564, every announcement contains a one-byte view tag that allows wallets to reject approximately 255 out of every 256 announcements before performing an expensive ECDH computation.

Consequently, for a network containing N announcements:

$$
\text{ECDH}_{\text{without}} = N
$$

$$
\text{ECDH}_{\text{with}} = \frac{N}{256}
$$

This produces an expected cryptographic workload reduction of approximately:

$$
256\times
$$

The discovery complexity therefore becomes:

$$
O(N)
\text{ byte comparisons}
+
O\left(\frac{N}{256}\right)
\text{ ECDH computations}
$$

A detailed analysis of ERC-5564 discovery performance and view-tag filtering can be found in the ERC-5564 specification and associated reference implementations.

Because GhostShard does not modify the ERC-5564 discovery algorithm, its discovery performance inherits these properties directly.