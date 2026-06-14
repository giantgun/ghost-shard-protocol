> **v0 — Testnet Only.** Not audited, not production-ready, and subject to change. Refer to the future paper for the full picture. Do not use with real funds.

# GhostShard Contracts

**GhostRouter** (singleton entry point) and **GhostShard** (EIP-7702 delegation target) — the on-chain core of the GhostShard Protocol.

Both contracts are deployed via CREATE2 for deterministic addresses across all EVM chains. No admin keys, no proxy, no upgrade mechanism.

---

## Contracts

### GhostRouter

The singleton entry point through which all mesh transactions execute. Holds paymaster gas deposits, validates EIP-7702 delegations, and atomically processes transfer commands and shard announcements.

**Source:** `src/GhostRouter.sol`

#### `executeMesh()`

The primary entry point. Processes a batch of transfer commands and shard announcements atomically.

```solidity
function executeMesh(
    TransferCommand[] calldata commands,
    Announcement[] calldata announcements,
    address paymaster,
    uint256 validUntil,
    bytes calldata paymasterSignature,
    GasLimits calldata limits
) external payable returns (
    uint256 totalGasUsed,
    uint256 totalGasCost,
    uint256 innerCallGasUsed,
    uint256 innerCallGasCost,
    bool success,
    bytes memory revertReason
);
```

**Execution flow:**

1. **Pre-scan code integrity** — reads 23 bytes of code at each shard address via `extcodecopy`, extracts the implementation address from the `0xef0100||target` EIP-7702 designator, and verifies it matches `authorization.targetAddress`. Reverts `TargetCodeMismatch` on mismatch.

2. **Gas prefund debit** — computes `requiredPrefund = (verificationGasLimit + callGasLimit + preVerificationGas) * tx.gasprice` and debits `paymasterDeposits[paymaster]`.

3. **Paymaster signature validation** — verifies `block.timestamp <= validUntil`, computes the paymaster hash (matching `keccak256(abi.encode(chainId, router, commandsHash, announcementsHash, validUntil, limitsHash))`), applies EIP-191 prefix, recovers the signer, and verifies it matches the paymaster address.

4. **Sandboxed inner execution** — calls `innerExecuteMesh(commands, announcements)` with `callGasLimit` gas. Only callable by `address(this)`.

5. **Gas reconciliation** — computes actual gas used, clamps cost to prefund, refunds surplus to paymaster, pays relayer, and emits `MeshExecuted`.

#### `innerExecuteMesh()`

Sandboxed execution routine. Can only be called by `address(this)` (enforced by `require(msg.sender == address(this))`).

```solidity
function innerExecuteMesh(
    TransferCommand[] calldata commands,
    Announcement[] calldata announcements
) external;
```

- Announces all new shards via the ERC-5564 Announcer (reverts `CannotAnnounceSpentShard` if already spent).
- For each transfer command:
  - Transient storage (`tload`/`tstore`) deduplication for shards appearing multiple times in one batch.
  - Permanently marks `isShardSpent[shard] = true`.
  - Recovers the signer from the EIP-191 transfer hash and verifies it matches the shard address.
  - Dispatches: `transferNative`, `transferERC20`, or `transferERC721` on the shard.

#### `depositGas()` / `withdrawGas()`

Paymaster gas management.

```solidity
function depositGas() external payable;
function withdrawGas(uint256 amount, address payable to) external;
```

- `depositGas`: adds `msg.value` to `paymasterDeposits[msg.sender]`.
- `withdrawGas`: debits `paymasterDeposits[msg.sender]` and transfers `amount` to `to`. Debit happens before the external call (checks-effects-interactions).

#### View Functions

```solidity
function isShardSpent(address) external view returns (bool);
function paymasterDeposits(address) external view returns (uint256);
function ERC5564_ANNOUNCER() external view returns (address);
function POST_EXECUTION_OVERHEAD() external view returns (uint256);
```

#### Structs

```solidity
enum AssetType { Native, ERC20, ERC721 }

struct TransferCommand {
    address shard;
    AssetType assetType;
    address token;
    address to;
    uint256 value;
    bytes signature;
    Authorization authorization;
}

struct Authorization {
    address targetAddress;  // GhostShard implementation
    uint32 chainId;
    uint32 nonce;           // always 0 (UTXO model)
    uint8 yParity;
    bytes32 r;
    bytes32 s;
}

struct Announcement {
    uint256 schemeId;
    address stealthAddress;
    bytes ephemeralPubKey;
    bytes metadata;
}

struct GasLimits {
    uint32 verificationGasLimit;
    uint32 callGasLimit;
    uint32 preVerificationGas;
    uint256 maxFeePerGas;
}
```

#### Events

```solidity
event GasDeposited(address indexed paymaster, uint256 amount);
event GasWithdrawn(address indexed paymaster, uint256 amount, address to);
event MeshExecuted(
    address indexed relayer,
    address indexed paymaster,
    uint256 totalGasUsed,
    uint256 totalGasCost,
    uint256 innerCallGasUsed,
    uint256 innerCallGasCost,
    bool success,
    bytes revertReason
);
```

#### Custom Errors

| Error | Condition |
|-------|-----------|
| `CannotAnnounceSpentShard(stealthAddress)` | Announcing a shard that is already spent |
| `ShardAlreadySpent(shard)` | Transferring from an already-spent shard |
| `InvalidSignature(shard)` | EIP-191 signature recovery does not match shard address |
| `MeshExecutionFailed(shard)` | Unknown asset type or transfer failure |
| `PaymasterExpired()` | `block.timestamp > validUntil` |
| `InvalidPaymasterSignature()` | Recovered signer does not match paymaster |
| `InsufficientPaymasterDeposit()` | Paymaster deposit < required prefund |
| `GasPriceTooHigh()` | `tx.gasprice > limits.maxFeePerGas` |
| `TargetCodeMismatch(shard)` | Shard's runtime code does not match claimed delegation target |

#### Constants

```solidity
address public constant ERC5564_ANNOUNCER = 0x55649E01B5Df198D18D95b5cc5051630cfD45564;
uint256 public constant POST_EXECUTION_OVERHEAD = 20000;
```

---

### GhostShard

The EIP-7702 delegation target. When a shard EOA authorizes delegation to this contract, it gains the ability to transfer its native ETH, ERC20 tokens, and ERC721 NFTs — but only when called by GhostRouter.

**Source:** `src/GhostShard.sol`

#### Constructor

```solidity
constructor(address _router);
```

Sets `GHOST_ROUTER` as an immutable. Cannot be changed after deployment.

#### Functions

```solidity
function transferNative(address payable to, uint256 amount) external onlyRouter;
function transferERC20(address token, address to, uint256 amount) external onlyRouter;
function transferERC721(address token, address to, uint256 tokenId) external onlyRouter;
```

All functions are gated by the `onlyRouter` modifier (`require(msg.sender == GHOST_ROUTER)`).

- `transferNative`: low-level call forwarding `amount` wei to `to`.
- `transferERC20`: calls `IERC20(token).transfer(to, amount)`. Handles non-standard ERC20 tokens (no return value) via `SafeERC20`.
- `transferERC721`: calls `transferFrom(address(this), to, tokenId)`.

```solidity
function GHOST_ROUTER() external view returns (address);
receive() external payable;  // accepts direct native deposits
```

#### Security Properties

- **Immutable router**: `GHOST_ROUTER` is set once in the constructor and cannot be changed.
- **Single authorized caller**: Only `GHOST_ROUTER` can trigger asset transfers.
- **No self-destruct, no delegatecall**: Minimal attack surface.
- **SafeERC20**: Handles non-standard ERC20 tokens safely.

---

## Deployment

### Prerequisites

- [Foundry](https://book.getfoundry.sh/) installed
- `.env` file with:
  ```
  DEPLOYER_PRIVATE_KEY=0x...
  RPC_URL=https://...
  ETHERSCAN_API_KEY=...
  ```

### Commands

```bash
# Compile
forge build

# Deploy GhostRouter (CREATE2)
forge script script/DeployGhostRouter.s.sol --rpc-url $RPC_URL --broadcast --verify

# Deploy GhostShard implementation (CREATE2, requires GHOST_ROUTER_ADDRESS in .env)
forge script script/DeployGhostShard.s.sol --rpc-url $RPC_URL --broadcast --verify

# Run tests
forge test
```

### CREATE2 Address Derivation

Both contracts are deployed with deterministic salts, producing the same address on every EVM chain:

```
GhostRouter salt: keccak256("GhostRouter_v0")
GhostShard  salt: keccak256("GhostShard_v0")
```

### Deployed Addresses (Arbitrum Sepolia)

| Contract | Address |
|----------|---------|
| GhostRouter | `0x51e492BdABC67C0b9A17C9d1bf1ee4A350B2eD2F` |
| GhostShard | `0x595CA02aa2B7aCef699a773a4572Dc4AaD8b4Fe3` |

---

## Dependencies

| Library | Usage |
|---------|-------|
| OpenZeppelin `ECDSA` | Signature recovery in `executeMesh` and `innerExecuteMesh` |
| OpenZeppelin `MessageHashUtils` | EIP-191 message hash prefixing |
| OpenZeppelin `SafeERC20` | Safe ERC20 transfers in GhostShard |
| OpenZeppelin `IERC20` | ERC20 interface |
| forge-std `Script`, `Test` | Deployment scripts and test utilities |

---

## License

MIT
