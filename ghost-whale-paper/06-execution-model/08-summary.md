## 6.8 Chapter Summary

GhostShard executes transactions through atomic mesh execution built on EIP-7702 delegation.

Transaction construction begins with coin selection, compression, and mesh assembly inside the SDK. Input shards authorize execution through EIP-7702 delegations and transfer signatures, while paymasters and relayers coordinate sponsored execution.

On-chain, GhostRouter validates authorizations, verifies delegation integrity, coordinates announcements, executes transfers through delegated GhostShard implementations, and settles gas sponsorships. All execution occurs atomically: if any validation, announcement, or transfer fails, the entire transaction reverts.

To support reliable sponsored execution, GhostShard employs simulation-driven gas estimation rather than heuristic gas models. Paymasters and relayers independently simulate transactions before approval and broadcast, ensuring that execution limits closely reflect actual network costs.

Together, these components transform GhostShard's ownership model into an executable privacy-preserving transaction system while maintaining self-custody, atomicity, and compatibility with existing EVM infrastructure.
