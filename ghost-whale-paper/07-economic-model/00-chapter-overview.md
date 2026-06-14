# 7. Economic Model

GhostShard is designed not only as a privacy protocol, but also as an economically sustainable system.

While cryptographic mechanisms establish ownership, authorization, and privacy, the long-term viability of the protocol depends on aligning the incentives of its participants. Users, paymasters, and relayers must each have clear economic motivations to participate, while the costs and risks associated with protocol operation remain predictable and bounded.

This chapter examines the economic structure of GhostShard, including sponsored execution, relayer incentives, paymaster funding, cost allocation, and risk management. The objective is to ensure that protocol participation remains practical, sustainable, and economically rational for all actors.

## Economic Principles

The GhostShard economic model is designed around four core principles.

### 1. Rational Participation

Protocol participants should maximize expected utility by following the protocol rather than deviating from it.

Users obtain privacy and usability benefits, paymasters control sponsorship policies, and relayers receive compensation for transaction inclusion. The protocol is structured so that honest participation provides the clearest path to economic benefit.

### 2. Bounded Economic Exposure

The financial risk faced by any participant should remain predictable and constrained.

Gas sponsorship, relayer reimbursement, and execution settlement are all designed with explicit limits that prevent unbounded losses and allow participants to reason about worst-case outcomes before committing resources.

### 3. Sustainable Cost Allocation

Execution costs should be allocated transparently to the parties responsible for incurring them.

Sponsored transactions, relayer compensation, and settlement accounting ensure that protocol operation remains economically sustainable without requiring custodial intermediaries, lockups, or protocol-level inflation.

### 4. Incentive Alignment

The incentives of protocol participants should reinforce the reliability and availability of the system.

Paymasters are incentivized to sponsor legitimate activity, relayers are incentivized to process valid transactions, and users are incentivized to construct transactions that can be executed successfully. The resulting incentive structure promotes efficient protocol operation while minimizing coordination requirements.

## Economic Foundations

GhostShard combines several complementary mechanisms to achieve these goals:

* **Cryptographic guarantees**, which prevent unauthorized spending and signature forgery.
* **Protocol-level constraints**, which bound execution outcomes and settlement behavior.
* **Sponsored execution mechanisms**, which enable gas abstraction while maintaining predictable cost allocation.
* **Market-based participation**, which allows relayers and paymasters to operate as independent service providers.

Together, these mechanisms create an ecosystem in which privacy, usability, and economic sustainability reinforce one another.

## Status

| Component                               | Status      |
| --------------------------------------- | ----------- |
| Paymaster deposit and withdrawal system | Implemented |
| Relayer reimbursement mechanism         | Implemented |
| Escrow debt accounting                  | Implemented |
| Relayer FIFO execution queue            | Implemented |
| Double Simulation gas engine            | Implemented |
| Competitive relay market                | Planned     |
| Paymaster staking mechanism             | Planned     |
| Decentralized relayer networks          | Research    |
| Alternative sponsorship markets         | Research    |

The remainder of this chapter analyzes how these components interact to allocate costs, manage risk, and align incentives across the GhostShard ecosystem.
