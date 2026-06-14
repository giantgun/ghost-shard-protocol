## Appendix C — Threat Model Assumptions

Explicit security assumptions underlying the GhostShard v0 security analysis (Chapter 10). All security claims in the paper are contingent on these assumptions holding.

---

### C.1 Cryptographic Assumptions

| ## | Assumption | Primitive | Consequence if Broken |
| --- | --- | --- | --- |
| C.1.1 | secp256k1 discrete logarithm problem remains hard | ECDSA, ECDH | Shard private keys recoverable; all ownership and authorization broken |
| C.1.2 | Computational Diffie-Hellman (CDH) holds on secp256k1 | ECDH | Shared secrets recoverable; stealth addresses linkable to recipients |
| C.1.3 | Keccak-256 preimage resistance | Hashing | Address derivation reversible |
| C.1.4 | SHA-256 preimage and collision resistance | HKDF | Derived keys recoverable from sibling keys |
| C.1.5 | HMAC-SHA256 security | HKDF | Domain separation between derived keys fails |
| C.1.6 | AES-256-GCM satisfies IND-CPA + INT-CTXT | Symmetric encryption | Metadata confidentiality broken; ciphertext forgeable |
| C.1.7 | AES-256 retains ~128-bit security against Grover's algorithm | Symmetric encryption | Post-quantum metadata security maintained |

---

### C.2 Protocol Assumptions

| ## | Assumption | Description |
| --- | --- | --- |
| C.2.1 | EIP-7702 behaves as specified | Delegation semantics, nonce handling, and authorization processing follow the EIP-7702 specification |
| C.2.2 | Paymaster signatures cannot be forged | Only the legitimate paymaster can produce valid sponsorship quotes |
| C.2.3 | Users protect viewing keys | Viewing key material remains confidential on user devices |
| C.2.4 | Users protect root seeds | Root seed is not extracted by malware, keyloggers, or physical attacks |
| C.2.5 | Relayers may be malicious | Relayers can censor, delay, or observe bundles but cannot forge authorizations |
| C.2.6 | At least one broadcast path is available | Users can always reach the network through some relayer or self-relay |
| C.2.7 | ERC-5564 announcer contract is correct | Announcements are emitted atomically with transfers |
| C.2.8 | CREATE2 deployment is deterministic | GhostRouter and GhostShard deploy at expected addresses on all target chains |

---

### C.3 Out-of-Scope Assumptions

The following are explicitly **not** covered by the v0 security model:

| ## | Threat | Mitigation Layer |
| --- | --- | --- |
| C.3.1 | Endpoint compromise (malware, keyloggers) | Operational security |
| C.3.2 | Social engineering and phishing | User education, wallet UI |
| C.3.3 | Physical device theft or coercion | Hardware wallets, duress protocols |
| C.3.4 | Global network surveillance (nation-state) | VPN, Tor, private relay infrastructure |
| C.3.5 | Large-scale fault-tolerant quantum computers | Post-quantum migration (future work) |
| C.3.6 | Malicious wallet interfaces | Wallet audit, user verification |
| C.3.7 | ERC-7702 specification changes | Protocol upgrade (no admin keys in v0) |

---

### C.4 Adversary Capability Summary

| Adversary Class | Can Observe | Can Modify | Cannot |
| --- | --- | --- | --- |
| Passive Observer | All on-chain data | Nothing | Forge signatures, access keys |
| Active Protocol Participant | Bundles, timing, metadata | Censor, delay | Forge authorizations |
| Counterparty | Own transaction history | Nothing | View unrelated transactions |
| Infrastructure | Network metadata, mempool | Reorder, censor | Break cryptography |
| Economic | Protocol economics | Submit valid txs | Spend without keys |
| Cryptographic | All public data | Nothing | Break secp256k1, AES-GCM, SHA-256 |
