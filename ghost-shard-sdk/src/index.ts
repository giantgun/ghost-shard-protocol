import type {
  GhostConfig, Shard, TransferRequest,
  AssetType, ShardStorage, AnnouncementLog, NFT,
  GhostEventMap, GhostEventName, GhostEventHandler, KeySet,
  PersistedState,
  PrivateTransferRequest,
  TransferCommand,
  Announcement,
  PreparedTransfer,
  GhostIdentitySigner,
  GhostTransactionSigner,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { entropyFromEIP712, deriveKeys } from './keys.js';
import { encodeMetaAddress } from './metaAddress.js';
import { generateRandomKeypair, generateStealthAddress, getNewDepositAddress } from './stealth.js';
import { prepareAnnounceTransfer } from './announce.js';
import type { AnnounceOpts } from './announce.js';
import { ShardStore } from './shard.js';
import { selectCoins } from './coinSelection.js';
import { checkInnerExecutionStatus, preparePrivateTransfer, prepareTransfer } from './transaction.js';
import { processAnnouncements as processLogs, announcementTopics } from './discovery.js';
import type { ProcessAnnouncementsResult } from './discovery.js';
import { parseLog } from './parse.js';
import {
  prepareRegisterMetaAddress,
  prepareRemoveMetaAddress,
  lookupMetaAddress,
} from './registry.js';
import { JsonRpcClient } from './rpc.js';
import {
  buildBalanceVerificationBatch,
} from './multicall.js';
import {
  ERC20_ABI,
  ERC5564_ANNOUNCE_ADDRESS,
  ERC721_ABI,
  GHOST_ROUTER_ABI,
  GHOST_ROUTER_ADDRESS,
  MULTICALL3_ABI,
  MULTICALL3_ADDRESS,
} from './abi.js'
import { decodeFunctionResult, encodeFunctionData, Hex, isAddressEqual, Log, WalletClient } from 'viem';
import { bytesToHex, encodeAbiParameters, hashMessage, keccak256, publicKeyToAddress, toHex } from 'viem/utils';
import { Account, privateKeyToAccount } from 'viem/accounts';

export type {
  KeySet, GhostConfig, Shard, PreparedTransfer, PrivateTransferRequest, Announcement,
  StealthAddressResult, AnnounceTransaction, Authorization, TransferCommand, MeshExecutionResult,
  TransferRequest, AssetType, PersistedState, PreparedRouterTransaction, GhostTransactionSigner,
  AssetBalance, ShardStorage, AnnouncementLog, NonceCheck, NFT, GhostIdentitySigner, NativeBalance, ERC20Balance, ERC721Balance,
} from './types.js';

export { ShardStore } from './shard.js';
export { selectCoins } from './coinSelection.js';
export { prepareTransfer, signAuthorization, deriveShardPrivateKeyFromAnnouncement } from './transaction.js';
export { processAnnouncements, announcementTopic, announcementTopics, parseAssetMetadata } from './discovery.js';
export type { DiscoveredShard } from './discovery.js';
export {
  prepareRegisterMetaAddress,
  prepareRemoveMetaAddress,
  lookupMetaAddress,
} from './registry.js';

export { buildBalanceVerificationBatch } from './multicall.js';
export { MULTICALL3_ADDRESS } from './abi.js';
export type { Multicall3Call, Multicall3Result, BalanceCall } from './multicall.js';

export class GhostClient {
  private config: GhostConfig;
  private shardStore: ShardStore;
  private storage: ShardStorage | undefined;
  private storageLoaded = false;
  private rpc: JsonRpcClient | null = null;
  public keys: KeySet | null = null;
  private listeners = new Map<string, Set<Function>>();

  constructor(config: GhostConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = this.config.storage;
    this.shardStore = new ShardStore();
    if (this.config.rpcUrl) {
      this.rpc = new JsonRpcClient(this.config.rpcUrl, this.config.relayerUrl, this.config.paymasterUrl);
    }
  }

  async initFromStorage(): Promise<void> {
    if (this.storage && !this.storageLoaded) {
      this.ensureInitialized()
      const saved = await this.storage.load(this.keys!.dbEncryptionKey);
      if (saved.shards.length > 0) this.shardStore.importState(saved);
      this.storageLoaded = true;
    }
  }

  async init(signer: GhostIdentitySigner): Promise<void> {
    // Pull chain ID safely from your existing SDK configuration instance
    const chainId = this.config.chain.id;

    const { rootSeed } = await entropyFromEIP712(signer, chainId);

    this.keys = deriveKeys(rootSeed);
    await this.initFromStorage();
  }

  private async resolveInternalSigner(input: Account) {
    // Assert that the client actually has the signing function available
    if (!input.signTypedData) {
      throw new Error('GhostClient: The provided WalletClient does not support signTypedData.');
    }

    if (!input.signMessage) {
      throw new Error('GhostClient: The provided WalletClient does not support signMessage.');
    }

    // Check if it's a WalletClient (looks for the getAddresses mechanism)
    if ('getAddresses' in input && typeof input.getAddresses === 'function') {
      const addresses = await input.getAddresses();
      if (!addresses || addresses.length === 0) {
        throw new Error('GhostShardSDK: Provided WalletClient contains no active accounts.');
      }
      return input;
    }

    // Check if it's a structural Account object (PrivateKey, JSON-RPC, Smart Account)
    if ('address' in input && 'signTypedData' in input) {
      return input;
    }

    throw new Error('GhostShardSDK: Provided signer engine is invalid or unsupported.');
  }

  isInitialized(): boolean {
    return this.keys !== null;
  }

  on<E extends GhostEventName>(event: E, handler: GhostEventHandler<E>): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off<E extends GhostEventName>(event: E, handler: GhostEventHandler<E>): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit<E extends GhostEventName>(
    event: E, payload: GhostEventMap[E],
  ): void {
    this.listeners.get(event)?.forEach((h) => h(payload));
  }

  getMetaAddress(): string {
    this.ensureInitialized();
    return encodeMetaAddress(this.keys!);
  }

  generateStealthAddress(metaAddress: string) {
    return generateStealthAddress(metaAddress);
  }

  getNewDepositAddress() {
    this.ensureInitialized();
    return getNewDepositAddress(this.keys!);
  }

  prepareAnnounceTransfer(
    stealthAddress: Hex,
    ephemeralPubKey: Hex,
    schemeId: number = 1,
    opts?: AnnounceOpts,
  ) {
    return prepareAnnounceTransfer(stealthAddress, ephemeralPubKey, ERC5564_ANNOUNCE_ADDRESS, schemeId, opts);
  }

  prepareRegisterMetaAddress(schemeId: number = 1) {
    this.ensureInitialized();
    return prepareRegisterMetaAddress(this.getMetaAddress(), schemeId);
  }

  prepareRemoveMetaAddress(schemeId: number = 1) {
    return prepareRemoveMetaAddress(schemeId);
  }

  async lookupMetaAddress(registrant: Hex, schemeId: number = 1) {
    const url = this.config.rpcUrl;
    if (!url) throw new Error('rpcUrl required to lookup meta addresses');
    return lookupMetaAddress(url, registrant, schemeId);
  }

  private async persist(): Promise<void> {
    this.ensureInitialized()
    const state: PersistedState = this.shardStore.exportState();
    if (this.storage) await this.storage.save(state, this.keys!.dbEncryptionKey);
  }

  async addShard(shard: Shard): Promise<void> {
    this.shardStore.add(shard);
    await this.persist();
  }

  async addShards(shards: Shard[]): Promise<void> {
    this.shardStore.addMany(shards);
    await this.persist();
  }

  getBalance(type?: AssetType, tokenAddress?: Hex): bigint {
    if (!type || type === 'NATIVE') {
      return this.shardStore.getBalanceForAsset('NATIVE');
    }
    return this.shardStore.getBalanceForAsset(type, tokenAddress);
  }

  listNFTs(): NFT[] {
    return this.shardStore.getNFTs();
  }

  getShards(includeZeroBalances: boolean = false): Shard[] {
    const allShards = this.shardStore.getAll();

    if (includeZeroBalances) {
      return allShards;
    }

    return allShards.filter(shard => {
      return shard.assets.some(asset => {
        if (asset.type === 'NATIVE' || asset.type === 'ERC20') {
          return asset.balance !== undefined && asset.balance > 0n;
        } else if (asset.type === 'ERC721') {
          return asset.tokenIds && asset.tokenIds.length > 0;
        }
        return false;
      });
    });
  }


  exportShards(): PersistedState {
    return this.shardStore.exportState();
  }

  async importShards(state: PersistedState): Promise<void> {
    this.shardStore.importState(state);
    await this.persist();
  }

  async confirmTransaction(addresses: Hex[]): Promise<void> {
    this.shardStore.removeMany(addresses);
    await this.persist();
    for (const address of addresses) {
      this.emit('shard:spent', { address });
    }
  }

  async confirmFailed(addresses: Hex[], changeAddress?: Hex): Promise<void> {
    this.shardStore.confirmFailed(addresses, changeAddress);
    await this.persist();
  }

  async processAnnouncements(logs: AnnouncementLog[]): Promise<ProcessAnnouncementsResult> {
    this.ensureInitialized();
    const result = await processLogs(logs, this.keys!);
    for (const shard of result.shards) {
      if (this.shardStore.get(shard.address)) continue;
      const newShard: Shard = {
        address: shard.address,
        ephemeralPubKey: shard.ephemeralPubKey,
        spent: false,
        pending: false,
        assets: shard.assets ?? [],
      };
      this.shardStore.add(newShard);
      this.emit('shard:discovered', { shard: newShard });
    }
    await this.persist();
    return { ...result, matches: result.shards.length };
  }

  /**
   * Check isShardSpent on GhostRouter via Multicall3 batching.
   * Removes spent shards from the store.
   */
  async syncSpentShards(): Promise<void> {
    const rpc = this.rpc;
    if (!rpc) throw new Error('RPC URL required for checking shard spent status');

    const unspent = this.shardStore.getUnspent();
    if (unspent.length === 0) return;

    const chunkSize = GhostClient.MULTICALL_CHUNK_SIZE;
    const allAddresses = unspent.map((s) => s.address);

    const spentStatuses = new Array<boolean>(allAddresses.length).fill(false);

    for (let i = 0; i < allAddresses.length; i += chunkSize) {
      const chunk = allAddresses.slice(i, i + chunkSize);

      const calls = chunk.map((addr) => ({
        target: GHOST_ROUTER_ADDRESS,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: GHOST_ROUTER_ABI,
          functionName: 'isShardSpent',
          args: [addr],
        }),
      }));

      const encoded = encodeFunctionData({
        abi: MULTICALL3_ABI,
        functionName: 'aggregate3',
        args: [calls],
      });

      try {
        const response = await rpc.ethCall(MULTICALL3_ADDRESS, encoded);
        const results = decodeFunctionResult({
          abi: MULTICALL3_ABI,
          functionName: 'aggregate3',
          data: response,
        }) as readonly { success: boolean; returnData: Hex }[];

        for (let j = 0; j < results.length; j++) {
          const res = results[j];
          if (res.success) {
            const isSpent = decodeFunctionResult({
              abi: GHOST_ROUTER_ABI,
              functionName: 'isShardSpent',
              data: res.returnData,
            }) as boolean;

            spentStatuses[i + j] = isSpent;
          }
        }
      } catch {
        // Chunk failure — shards in this chunk stay false (unspent)
      }
    }

    const spentAddresses: Hex[] = [];
    for (let i = 0; i < allAddresses.length; i++) {
      if (spentStatuses[i]) {
        spentAddresses.push(allAddresses[i]);
      }
    }

    if (spentAddresses.length > 0) {
      this.shardStore.removeMany(spentAddresses);
      await this.persist();

      for (const address of spentAddresses) {
        this.emit('shard:spent', { address });
      }
    }
  }

  /**
   * Full sync pipeline:
   *   1. Fetch logs from announcer
   *   2. Parse and process announcements via trial-decrypt
   *   3. Sync spent shards from GhostRouter
   *   4. Verify balances via Multicall3
   *
   * @param syncFromStart — if true, ignores lastSyncedBlock cursor
   */
  async syncWithChain(syncFromStart = false): Promise<ProcessAnnouncementsResult | null> {
    const rpc = this.rpc;
    if (!rpc) return null;
    this.ensureInitialized();

    const lastSynced = this.shardStore.getLastSyncedBlock();

    let startCursor = this.config.startBlock ?? 0n;
    if (!syncFromStart) {
      startCursor = lastSynced !== null ? lastSynced : startCursor;
    }

    const topics = announcementTopics();
    const allLogs: Array<Log> = [];

    for (const topic of topics) {
      try {
        const logs = await rpc.getLogs(
          ERC5564_ANNOUNCE_ADDRESS,
          startCursor,
          'latest',
          [[topic]],
        );
        allLogs.push(...logs);
      } catch (err) {
        throw err
      }
    }

    const announceLogs: AnnouncementLog[] = [];
    let highestProcessedBlock = startCursor;

    for (const log of allLogs) {
      const parsed = parseLog(log);
      if (parsed) announceLogs.push(parsed);

      if (log.blockNumber !== null && log.blockNumber !== undefined) {
        const logBlock = BigInt(log.blockNumber);
        if (logBlock >= highestProcessedBlock) {
          highestProcessedBlock = logBlock;
        }
      }
    }

    const snapshot = this.shardStore.exportState();

    try {
      const discoveryResult = await this.processAnnouncements(announceLogs);

      if (highestProcessedBlock >= startCursor) {
        this.shardStore.setLastSyncedBlock(highestProcessedBlock);
      }

      await this.syncSpentShards();

      const activeInventory = this.shardStore.getUnspent();
      if (activeInventory.length > 0) {
        await this.verifyShardBalances(activeInventory);
      }

      await this.persist();

      const discCount = discoveryResult?.shards?.length ?? 0;
      this.emit('sync:complete', { discovered: discCount });
      return discoveryResult;
    } catch (err) {
      this.shardStore.importState(snapshot);
      await this.persist();
      throw err;
    }
  }

  private syncTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Start background sync loop at a controlled interval.
   * unref() in Node.js to avoid preventing process exit.
   */
  startAutoSync(intervalMs: number = 15000): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(async () => {
      try {
        await this.syncWithChain();
      } catch (err) {
        this.emit('sync:error', { error: err });
      }
    }, intervalMs);

    if (this.syncTimer && typeof (this.syncTimer as any).unref === 'function') {
      (this.syncTimer as any).unref();
    }
  }

  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  static readonly MULTICALL_CHUNK_SIZE = 300;

  /**
   * Verify shard balances against on-chain state via Multicall3.
   * Overwrites metadata balances with on-chain truth.
   * Removes unowned ERC721 tokenIds.
   */
  async verifyShardBalances(shards: Shard[]): Promise<void> {
    const rpc = this.rpc;
    if (!rpc) throw new Error('RPC URL required for balance verification');

    const { calls, mapping } = buildBalanceVerificationBatch(
      shards.map((s) => s.address),
      shards.map((s) => s.assets),
    );

    if (calls.length === 0) return;

    const chunkSize = GhostClient.MULTICALL_CHUNK_SIZE;
    const deadTokens: Array<{ shardIndex: number; assetIndex: number; tokenIdIndex: number }> = [];

    const chunkPromises: Promise<void>[] = [];
    for (let i = 0; i < calls.length; i += chunkSize) {
      const chunkCalls = calls.slice(i, i + chunkSize);
      const chunkMapping = mapping.slice(i, i + chunkSize);

      chunkPromises.push(
        (async () => {
          let results: readonly { success: boolean; returnData: Hex }[];
          try {
            const encoded = encodeFunctionData({
              abi: MULTICALL3_ABI,
              functionName: 'aggregate3',
              args: [chunkCalls.map(c => ({
                target: c.target,
                allowFailure: c.allowFailure,
                callData: c.callData,
              }))],
            });

            const response = await rpc.ethCall(MULTICALL3_ADDRESS, encoded);

            results = decodeFunctionResult({
              abi: MULTICALL3_ABI,
              functionName: 'aggregate3',
              data: response,
            }) as readonly { success: boolean; returnData: Hex }[];
          } catch {
            return;
          }

          for (let j = 0; j < results.length; j++) {
            const { success, returnData } = results[j];
            if (!success) continue;
            const m = chunkMapping[j];
            const shard = shards[m.shardIndex];
            const asset = shard.assets[m.assetIndex];

            if ((m.type === 'NATIVE' || m.type === 'ERC20') && (asset.type === 'NATIVE' || asset.type === 'ERC20')) {
              asset.balance = decodeFunctionResult({
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                data: returnData,
              }) as bigint;
            } else if (m.type === 'ERC721' && m.tokenIdIndex !== undefined) {
              const owner = decodeFunctionResult({
                abi: ERC721_ABI,
                functionName: 'ownerOf',
                data: returnData,
              }) as string;

              if (!isAddressEqual(owner as Hex, shard.address as Hex)) {
                deadTokens.push({
                  shardIndex: m.shardIndex,
                  assetIndex: m.assetIndex,
                  tokenIdIndex: m.tokenIdIndex,
                });
              }
            }
          }
        })(),
      );
    }

    await Promise.all(chunkPromises);

    deadTokens.sort((a, b) =>
      a.assetIndex !== b.assetIndex
        ? a.assetIndex - b.assetIndex
        : b.tokenIdIndex - a.tokenIdIndex,
    );
    for (const { shardIndex, assetIndex, tokenIdIndex } of deadTokens) {
      const asset = shards[shardIndex].assets[assetIndex];
      if (asset.type === 'ERC721') asset.tokenIds.splice(tokenIdIndex, 1);
    }

    await this.persist();
  }

  private buildUserHash(
    commands: TransferCommand[],
    announcements: Announcement[],
  ): Hex {
    // 1. Encode the entire commands array natively
    const commandsEncoded = encodeAbiParameters(
      [{
        type: 'tuple[]',
        name: 'commands',
        components: [
          { name: 'shard', type: 'address' },
          { name: 'assetType', type: 'uint8' },
          { name: 'token', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'signature', type: 'bytes' },
          {
            name: 'authorization',
            type: 'tuple',
            components: [
              { name: 'targetAddress', type: 'address' },
              { name: 'chainId', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'yParity', type: 'uint8' },
              { name: 'r', type: 'bytes32' },
              { name: 's', type: 'bytes32' }
            ]
          }
        ]
      }] as const,
      [
        commands.map(c => ({
          shard: c.shard,
          assetType: Number(c.assetType),
          token: c.token,
          to: c.to,
          value: BigInt(c.value),
          signature: c.signature,
          authorization: {
            targetAddress: c.authorization.targetAddress,
            chainId: BigInt(c.authorization.chainId),
            nonce: BigInt(c.authorization.nonce),
            yParity: Number(c.authorization.yParity),
            r: c.authorization.r,
            s: c.authorization.s,
          }
        }))
      ]
    );

    // 2. Encode the entire announcements array natively
    const announcementsEncoded = encodeAbiParameters(
      [{
        type: 'tuple[]',
        name: 'announcements',
        components: [
          { name: 'schemeId', type: 'uint256' },
          { name: 'stealthAddress', type: 'address' },
          { name: 'ephemeralPubKey', type: 'bytes' },
          { name: 'metadata', type: 'bytes' }
        ]
      }] as const,
      [
        announcements.map(a => ({
          schemeId: BigInt(a.schemeId),
          stealthAddress: a.stealthAddress,
          ephemeralPubKey: a.ephemeralPubKey,
          metadata: a.metadata,
        }))
      ]
    );

    // 4. Wrap elements matching a global raw bytes layout
    const bundleEncoded = encodeAbiParameters(
      [
        { type: 'bytes' },
        { type: 'bytes' },
      ] as const,
      [commandsEncoded, announcementsEncoded],
    );

    const bundleHash = keccak256(bundleEncoded);
    return hashMessage({ raw: bundleHash });
  }

  private async getUserSignature(
    account: GhostTransactionSigner, // 💡 Specific interface
    commands: TransferCommand[],
    announcements: Announcement[]
  ): Promise<Hex> {
    const callerHash = this.buildUserHash(commands, announcements);

    const signature = await account.signMessage({
      message: { raw: callerHash }
    });

    return signature;
  }


  /**
   * Build transaction (read-only — no state mutation).
   * Returns full calldata for GhostRouter.executeMesh.
   */
  async buildTransaction(
    request: TransferRequest,
  ): Promise<PreparedTransfer> {
    this.ensureInitialized();

    const {
      shards: selectedShards,
      paymentSplitsByShard,
      changeSplitsByShard
    } = selectCoins(
      this.shardStore.getUnspentForAsset(
        request.type,
        request.type === 'NATIVE' ? undefined : request.tokenAddress,
        request.type === 'ERC721' ? request.tokenId : undefined,
      ),
      request
    );

    return await prepareTransfer(
      selectedShards,
      request,
      paymentSplitsByShard,
      changeSplitsByShard,
      this.keys!,
      this.config.chain.id
    );
  }

  /**
   * Build transaction to a stealth recipient (privacy mode).
   * Read-only until confirmPrepared is called.
   */
  async buildPrivateTransaction(
    request: PrivateTransferRequest,
  ): Promise<PreparedTransfer> {
    this.ensureInitialized();

    const {
      shards: selectedShards,
      paymentSplitsByShard,
      changeSplitsByShard
    } = selectCoins(
      this.shardStore.getUnspentForAsset(
        request.type,
        request.type === 'NATIVE' ? undefined : request.tokenAddress,
        request.type === 'ERC721' ? request.tokenId : undefined,
      ),
      request
    );

    return await preparePrivateTransfer(
      selectedShards,
      request,
      paymentSplitsByShard,
      changeSplitsByShard,
      this.keys!,
      this.config.chain.id
    );
  }

  /**
   * Confirm a prepared transaction after submission.
   * Marks input shards as pending, adds change shards to the store.
   */
  async confirmPrepared(
    tx: PreparedTransfer,
    request: TransferRequest | PrivateTransferRequest
  ): Promise<void> {
    this.shardStore.markPending(tx.shardAddresses);

    if (tx.changeShards && tx.changeShards.length > 0) {
      for (const out of tx.changeShards) {
        this.shardStore.add({
          address: out.address,
          ephemeralPubKey: out.ephemeralPubKey,
          spent: false,
          pending: false,
          assets: [
            request.type === 'ERC721'
              ? { type: 'ERC721', tokenAddress: request.tokenAddress!, balance: 0n, tokenIds: [] }
              : request.type === 'ERC20'
                ? { type: 'ERC20', tokenAddress: request.tokenAddress!, balance: out.amount }
                : { type: 'NATIVE', balance: out.amount }
          ],
        });
      }
    }

    await this.persist();

    for (const address of tx.shardAddresses) {
      this.emit('shard:pending', { shard: { address } as Shard });
    }
  }

  /**
   * One-step: build + confirm transaction.
   */
  async prepareTransfer(
    request: TransferRequest,
  ): Promise<PreparedTransfer> {
    const tx = await this.buildTransaction(request);
    await this.confirmPrepared(tx, request);
    return tx;
  }

  /**
   * One-step: build + confirm private transaction (stealth recipient).
   */
  async preparePrivateTransfer(
    request: PrivateTransferRequest,
  ): Promise<PreparedTransfer> {
    const tx = await this.buildPrivateTransaction(request);
    await this.confirmPrepared(tx, request);
    return tx;
  }

  async relayTransfer(
    request: TransferRequest | PrivateTransferRequest,
    signer: GhostTransactionSigner,
  ) {
    let preparedTransfer: PreparedTransfer;
    if ('to' in request) {
      preparedTransfer = await this.prepareTransfer(request);
    } else {
      preparedTransfer = await this.preparePrivateTransfer(request);
    }

    if (!this.rpc) throw new Error('GhostClient: RPC client uninitialized.');

    const userSignature = await this.getUserSignature(
      signer,
      preparedTransfer.commands,
      preparedTransfer.announcements
    );

    const relayerRequest = await this.rpc.callPaymaster({
      commands: preparedTransfer.commands,
      announcements: preparedTransfer.announcements,
      userSignature
    });

    // ... (Your maxFeePerGas Ceiling Protection Checks Here) ...

    // 1. Broadcast the transaction and get the hash immediately
    const relayerResponse = await this.rpc.callRelayer({ ...relayerRequest });
    const txHash = relayerResponse.transactionHash as Hex;

    // 2. Return the data instantly so the UI can react, but pack a wait function
    return {
      txHash,
      ...preparedTransfer,
      ...relayerResponse,

      // Decoupled promise runner
      wait: async () => {
        if (!this.rpc) throw new Error('GhostClient: RPC client uninitialized.');
        try {
          const receipt = await this.rpc.waitForTransactionReceipt(txHash);
          const executionStatus = checkInnerExecutionStatus(receipt);

          if (executionStatus.success) {
            await this.confirmTransaction(preparedTransfer.shardAddresses);
          } else {
            await this.confirmFailed(preparedTransfer.shardAddresses);
          }

          return executionStatus;
        } catch (error) {
          throw error;
        }
      }
    };
  }

  private ensureInitialized(): void {
    if (!this.keys) {
      throw new Error(
        'GhostShard not initialized. Call await ghost.init(signer) first.',
      );
    }
  }
}