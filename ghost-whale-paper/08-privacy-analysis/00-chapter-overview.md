# 8. Privacy Analysis

> **Question:** What information is hidden, from whom, and under what assumptions?

This chapter analyzes the privacy properties of GhostShard v0 and the information available to different classes of observers.

GhostShard does not attempt to achieve perfect anonymity or conceal the existence of transactions. Instead, it seeks to make ownership relationships, payment relationships, and wallet reconstruction computationally difficult by restructuring how ownership is represented and transferred on-chain.

The analysis is organized around the privacy properties that emerge from GhostShard's central design thesis:

> **Privacy is a property of ownership topology rather than transaction concealment.**

Accordingly, this chapter focuses on what observers can infer from publicly visible protocol activity, what information remains hidden, and the assumptions under which those privacy guarantees hold.
