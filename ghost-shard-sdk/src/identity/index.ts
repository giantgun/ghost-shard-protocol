/**
 * @ghost-shard/sdk/identity
 *
 * Re-exports for the identity layer: key derivation, stealth address generation,
 * meta-address encoding, and announcement preparation.
 */

export { encodeMetaAddress, decodeMetaAddress, isMetaAddress } from '../metaAddress.js';
export { deriveKeys, entropyFromEIP712, computeSharedSecret } from '../keys.js';
export { generateStealthAddress, getNewDepositAddress } from '../stealth.js';
export { prepareAnnounceTransfer, packMetadata, decryptMetadataPayload } from '../announce.js';
export type { AnnounceOpts } from '../announce.js';
