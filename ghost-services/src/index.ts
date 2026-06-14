import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { sendError } from './common/errors.js';
import { sanitizeBigint } from './common/helper.js';
import {
  signQuote,
  estimateGasLimitsWithOverride,
  ensureUserAllowed,
} from './paymaster/service.js';
import { relay, getQueueStatus } from './relayer/service.js';
import type { PaymasterQuoteRequest, RelayerRelayRequest } from './types.js';

// ---------------------------------------------------------------------------
// Unified Ghost Services — single Express app
//
// Merges the former Paymaster (port 3001) and Relayer (port 3002) into one
// service sharing a single viem publicClient, walletClient, and config state.
// Transactions are submitted sequentially via an internal queue.
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ---------------------------------------------------------------------------
// Helpers — deserialize JSON payloads with stringified bigints
// ---------------------------------------------------------------------------

function deserializeCommands(raw: Array<Record<string, unknown>>) {
  return raw.map((c: Record<string, unknown>) => ({
    shard: c.shard,
    assetType: c.assetType,
    token: c.token,
    to: c.to,
    value: BigInt(c.value as string),
    signature: c.signature,
    authorization: {
      targetAddress: (c.authorization as Record<string, unknown>).targetAddress,
      chainId: Number((c.authorization as Record<string, unknown>).chainId),
      nonce: Number((c.authorization as Record<string, unknown>).nonce),
      yParity: Number((c.authorization as Record<string, unknown>).yParity),
      r: (c.authorization as Record<string, unknown>).r,
      s: (c.authorization as Record<string, unknown>).s,
    },
  }));
}

function deserializeAnnouncements(raw: Array<Record<string, unknown>>) {
  return raw.map((a: Record<string, unknown>) => ({
    schemeId: BigInt(a.schemeId as string),
    stealthAddress: a.stealthAddress,
    ephemeralPubKey: a.ephemeralPubKey,
    metadata: a.metadata,
  }));
}

function deserializeLimits(raw: Record<string, unknown>) {
  return {
    verificationGasLimit: Number(raw.verificationGasLimit),
    callGasLimit: Number(raw.callGasLimit),
    preVerificationGas: Number(raw.preVerificationGas),
    maxFeePerGas: BigInt(raw.maxFeePerGas as string),
  };
}

// ---------------------------------------------------------------------------
// PAYMASTER ROUTES
// ---------------------------------------------------------------------------

/**
 * POST /api/v0/paymaster/sign
 *
 * Quotes gas via the Double Simulation engine, then signs a paymaster
 * sponsorship approval for the bundle.
 */
app.post('/api/v0/paymaster/sign', async (req, res) => {
  try {
    const body = req.body as Omit<PaymasterQuoteRequest, 'limits'>;

    if (!body.commands || !body.announcements || !body.userSignature) {
      res.status(400).json({
        error:
          'Missing required fields: commands, announcements, userSignature',
      });
      return;
    }

    const commands = deserializeCommands(
      body.commands as unknown as Array<Record<string, unknown>>,
    );
    const announcements = deserializeAnnouncements(
      body.announcements as unknown as Array<Record<string, unknown>>,
    );

    // await ensureUserAllowed(
    //   commands as never,
    //   announcements as never,
    //   body.userSignature,
    // );

    // Double Simulation gas estimation (replaces all heuristic math)
    const { limits, validUntil } = await estimateGasLimitsWithOverride(
      commands as never,
      announcements as never,
    );

    const result = await signQuote({
      commands: commands as never,
      announcements: announcements as never,
      limits: limits as never,
      userSignature: body.userSignature,
      validUntil,
    });

    res.json(sanitizeBigint(result));
  } catch (err) {
    console.log(err);
    sendError(res, err);
  }
});

app.get('/api/v0/paymaster/health', (_req, res) => {
  res.json({ status: 'ok', service: 'paymaster' });
});

// ---------------------------------------------------------------------------
// RELAYER ROUTES
// ---------------------------------------------------------------------------

/**
 * POST /api/v0/relay
 *
 * Submits a signed, paymaster-sponsored bundle as an EIP-7702 type 4
 * transaction. The request is enqueued and transactions are broadcast
 * strictly one-after-another by the internal queue worker.
 */
app.post('/api/v0/relay', async (req, res) => {
  try {
    const body = req.body as RelayerRelayRequest;

    if (
      !body.commands ||
      !body.announcements ||
      !body.paymaster ||
      !body.validUntil ||
      !body.paymasterSignature ||
      !body.limits
    ) {
      res.status(400).json({
        error:
          'Missing required fields: commands, announcements, paymaster, validUntil, paymasterSignature, limits',
      });
      return;
    }

    const commands = deserializeCommands(
      body.commands as unknown as Array<Record<string, unknown>>,
    );
    const announcements = deserializeAnnouncements(
      body.announcements as unknown as Array<Record<string, unknown>>,
    );
    const limits = deserializeLimits(
      body.limits as unknown as Record<string, unknown>,
    );

    const result = await relay({
      commands: commands as never,
      announcements: announcements as never,
      paymaster: body.paymaster,
      validUntil: body.validUntil,
      paymasterSignature: body.paymasterSignature,
      limits: limits as never,
    });

    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/v0/relayer/health', (_req, res) => {
  const queueStatus = getQueueStatus();
  res.json({
    status: 'ok',
    service: 'relayer',
    queue: {
      length: queueStatus.queueLength,
      processing: queueStatus.processing,
    },
  });
});

// ---------------------------------------------------------------------------
// Unified health check
// ---------------------------------------------------------------------------

app.get('/api/v0/health', (_req, res) => {
  const queueStatus = getQueueStatus();
  res.json({
    status: 'ok',
    service: 'ghost-relayer',
    chain: config.chain.id,
    router: config.routerAddress,
    queue: {
      length: queueStatus.queueLength,
      processing: queueStatus.processing,
    },
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(config.port, () => {
  console.log(
    `[Ghost Services] Unified service listening on port ${config.port}`,
  );
  console.log(
    `[Ghost Services] Paymaster: http://localhost:${config.port}/api/v0/paymaster/sign`,
  );
  console.log(
    `[Ghost Services] Relayer:   http://localhost:${config.port}/api/v0/relay`,
  );
  console.log(
    `[Ghost Services] Chain:     ${config.chain.name} (${config.chain.id})`,
  );
  console.log(
    `[Ghost Services] Router:    ${config.routerAddress}`,
  );
});

export default app;
