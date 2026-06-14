import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes, type Hex } from 'viem';

const META_ADDRESS_PREFIX = 'st:eth:';
const STANDARD_SCHEME_ID = 1; // 1 = secp256k1 with view tags

export interface KeySet {
  spendingPublicKey: Uint8Array;
  viewingPublicKey: Uint8Array;
}

export interface DecodedMetaAddress extends KeySet {
  schemeId: number;
}

/**
 * Encode keypair set into standard ERC-5564 meta-address string.
 * Payload Format: st:eth:0x<schemeId(1B)><spendingPubKey(33B)><viewingPubKey(33B)>
 */
export function encodeMetaAddress(keys: KeySet): string {
  if (keys.spendingPublicKey.length !== 33 || keys.viewingPublicKey.length !== 33) {
    throw new Error('Public keys must be compressed 33-byte Uint8Arrays');
  }

  // 1 byte schemeId + 33 bytes spending + 33 bytes viewing = 67 bytes total
  const data = new Uint8Array(1 + 33 + 33);
  
  data[0] = STANDARD_SCHEME_ID;
  data.set(keys.spendingPublicKey, 1);
  data.set(keys.viewingPublicKey, 34);

  return META_ADDRESS_PREFIX + bytesToHex(data);
}

/**
 * Decode standard meta-address back into raw public key buffers and scheme ID.
 * Validates prefix, exact length (67 bytes), scheme type, and curve points.
 */
export function decodeMetaAddress(metaAddress: string): DecodedMetaAddress {
  if (!metaAddress.startsWith(META_ADDRESS_PREFIX)) {
    throw new Error(`Invalid meta-address: must start with ${META_ADDRESS_PREFIX}`);
  }

  const hex = metaAddress.slice(META_ADDRESS_PREFIX.length) as Hex;
  const data = hexToBytes(hex);

  // Must be exactly 67 bytes (1 scheme byte + 66 key bytes)
  if (data.length !== 67) {
    throw new Error('Invalid meta-address payload: must be exactly 67 bytes');
  }

  const schemeId = data[0];
  if (schemeId !== STANDARD_SCHEME_ID) {
    throw new Error(`Unsupported stealth cryptographic scheme ID: ${schemeId}`);
  }

  const spendingPublicKey = data.slice(1, 34);
  const viewingPublicKey = data.slice(34, 67);

  // Validate points on the secp256k1 curve
  try {
    secp256k1.Point.fromHex(spendingPublicKey);
    secp256k1.Point.fromHex(viewingPublicKey);
  } catch {
    throw new Error('Invalid meta-address: public keys are not valid secp256k1 points');
  }

  return { schemeId, spendingPublicKey, viewingPublicKey };
}

/** Check if a string matches basic stealth meta-address format boundaries. */
export function isMetaAddress(str: string): boolean {
  // Regex ensures it starts with st:eth:0x followed by exactly 134 hex chars (67 bytes)
  return /^st:eth:0x[0-9a-fA-F]{134}$/.test(str);
}
