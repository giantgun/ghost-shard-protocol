import type { PersistedState, ShardStorage } from "@ghost-shard/sdk"

const STORAGE_KEY = 'shard_persisted_state';
const ALGORITHM = "AES-GCM";
const CHUNK_SIZE = 0xffff; // 65535 - Safe maximum chunk size for the call stack

export const shardLocalStorage: ShardStorage = {
  /** 
   * Loads state from localStorage.
   * Fails or returns empty if decryption fails.
   */
  async load(encryptionKey: Uint8Array): Promise<PersistedState> {
    const rawData = localStorage.getItem(STORAGE_KEY);
    
    if (!rawData) {
      return { shards: [], lastSyncedBlock: null };
    }

    try {
      // OPTIMIZED: Replaced slow .split('').map() loop with an efficient typed array population
      const binaryString = atob(rawData);
      const combined = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        combined[i] = binaryString.charCodeAt(i);
      }

      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const key = await window.crypto.subtle.importKey(
        "raw", 
        encryptionKey as BufferSource, 
        ALGORITHM, 
        false, 
        ["decrypt"]
      );

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        ciphertext as BufferSource
      );

      const jsonString = new TextDecoder().decode(decryptedBuffer);
      
      return JSON.parse(jsonString, (_, value) => {
        if (value && typeof value === 'object' && value.type === 'BigInt') {
          return BigInt(value.value);
        }
        return value;
      }) as PersistedState;

    } catch (error) {
      return { shards: [], lastSyncedBlock: null };
    }
  },

  /** 
   * Saves state to localStorage.
   */
  async save(state: PersistedState, encryptionKey: Uint8Array): Promise<void> {
    try {
      const jsonString = JSON.stringify(state, (_, value) => {
        if (typeof value === 'bigint') {
          return { type: 'BigInt', value: value.toString() };
        }
        return value;
      });

      const encodedData = new TextEncoder().encode(jsonString);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      
      const key = await window.crypto.subtle.importKey(
        "raw", 
        encryptionKey as BufferSource, 
        ALGORITHM, 
        false, 
        ["encrypt"]
      );
      
      const ciphertext = await window.crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encodedData as BufferSource
      );

      const combined = new Uint8Array(iv.length + ciphertext.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(ciphertext), iv.length);
      
      // FIXED: Replaced ...combined with a safe chunked loop to prevent call stack overflow
      let binaryString = '';
      for (let i = 0; i < combined.length; i += CHUNK_SIZE) {
        binaryString += String.fromCharCode.apply(
          null,
          combined.subarray(i, i + CHUNK_SIZE) as unknown as number[]
        );
      }
      
      const base64String = btoa(binaryString);
      
      localStorage.setItem(STORAGE_KEY, base64String);

    } catch (error) {
      throw error;
    }
  }
};
