## Appendix A — Protocol Parameters

Constants, thresholds, caps, and derivation paths that define GhostShard v0 behavior. A reviewer should be able to reproduce protocol behavior from this appendix.

---

### A.1 Deployment Parameters

| Parameter | Value | Description |
| --- | --- | --- |
| Chain | Arbitrum Sepolia (421614) | Testnet deployment |
| GhostRouter | `0x6f67E047D1Fe5de0b62b187c28dB1cf1F4f560fb` | Singleton execution coordinator |
| GhostShard | `0x295549A545E41af6cbCe09AbF012de172AC321AE` | EIP-7702 delegation target |
| ERC-5564 Announcer | `0x55649E01B5Df198D18D95b5cc5051630cfD45564` | Announcement publisher |
| Solidity Version | 0.8.24^ | Compiler version (GhostRouter, GhostShard) |
| Solidity Version | 0.8.23 | Compiler version (ERC-5564 Announcer) |
| Optimizer Runs | 200 | Solidity optimizer setting |

---

### A.2 CREATE2 Salts

| Contract | Salt | Notes |
| --- | --- | --- |
| GhostRouter | `0x...` | Deterministic deployment address |
| GhostShard | `0x...` | Deterministic deployment address |

*Full salt values to be published upon mainnet deployment.*

---

### A.3 Dust Thresholds

| Parameter | Value | Description |
| --- | --- | --- |
| `minDustThreshold` | 10,000 wei | Fixed minimum output value (v0) |

*Planned: Per-token dust thresholds derived from paymaster quotes (see Section 2.8).*

---

### A.4 Compression Caps

| Parameter | Value | Description |
| --- | --- | --- |
| `extraShards` formula | `random(floor(sqrt(walletSize) * 0.8))` | Compression shard count |
| Hard cap | 15 | Maximum compression shards per transaction |

---

### A.5 Transaction Limits

| Parameter | Value | Description |
| --- | --- | --- |
| Max transfer commands (`N_t`) | 29 | Largest measured transaction |
| Max input shards (`N_i`) | 9 | Largest measured transaction |
| Max output announcements (`N_o`) | 8 | Largest measured transaction |
| Max fee per gas | `baseFee * 2 + 1.5 gwei` | Fixed gas price strategy (v0) |

---

### A.6 Viewing Key Derivation Paths

| Key | HKDF Info String | Purpose |
| --- | --- | --- |
| Spending Key | `"ghost-shard-spending-key"` | Shard ownership, transfer authorization |
| Viewing Key | `"ghost-shard-viewing-key"` | Announcement discovery, metadata decryption |
| DB Encryption Key | `"ghost-shard-db-encryption-key"` | Local storage encryption |
| Metadata Key | `"ghost-shard-metadata"` | Announcement metadata encryption |
| Ephemeral Key | `"ghost-shard-ephemeral"` | Deterministic ephemeral key derivation (planned) |
| Audit Key | `"ghost-shard-audit-key"` | Time-bounded viewing key derivation (planned) |

All derived via `HKDF-SHA256(rootSeed, info)`.

---

### A.7 Scheme IDs

| Scheme ID | Scheme | Curve | Status |
| --- | --- | --- | --- |
| 1 | ERC-5564 Stealth Address | secp256k1 | v0 |

*Additional scheme IDs may be registered for post-quantum alternatives (see Section 10.9.7).*

---

### A.8 Asset Type Encoding

| Value | Asset Type |
| --- | --- |
| 0 | Native ETH |
| 1 | ERC-20 |
| 2 | ERC-721 |

---

### A.9 Gas Settlement Constants

| Parameter | Value | Description |
| --- | --- | --- |
| `POST_EXECUTION_OVERHEAD` | Protocol-defined | Fixed allowance for settlement gas |
| Execution cushion | `1.3 × G_inner + 40,000` | Gas limit multiplier from Double Simulation |
| Escrow timeout | 120 seconds | In-flight debt release timeout |
