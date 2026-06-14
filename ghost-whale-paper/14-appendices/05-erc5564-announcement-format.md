## Appendix E — ERC-5564 Announcement Format

Binary layout and structure of ERC-5564 stealth address announcements as used by GhostShard v0.

---

### E.1 Meta-Address Format

A meta-address is the public receiving identifier that allows anyone to derive stealth shards for a recipient.

| Component           | Size         | Description                                     |
| ------------------- | ------------ | ----------------------------------------------- |
| Scheme ID           | 1 byte       | Cryptographic scheme identifier (1 = secp256k1) |
| Spending Public Key | 33 bytes     | Compressed secp256k1 point (`pk_spend`)         |
| Viewing Public Key  | 33 bytes     | Compressed secp256k1 point (`pk_view`)          |
| **Total**           | **67 bytes** |                                                 |

Human-readable encoding (ERC-5564):

```text
st:<chainIdentifier>:0x<schemeId><spendingPubKey><viewingPubKey>
```

---

### E.2 Announcement Structure

Each mesh transaction output publishes one ERC-5564 announcement.

#### Plaintext Header (54 bytes)

| Offset | Size     | Field             | Description                                  |
| ------ | -------- | ----------------- | -------------------------------------------- |
| 0      | 1 byte   | View Tag          | First byte of shared secret (scan filter)    |
| 1      | 1 byte   | Asset Type        | 0 = Native, 1 = ERC-20, 2 = ERC-721          |
| 2      | 20 bytes | Token Address     | Zero address for native assets               |
| 22     | 32 bytes | Amount / Token ID | Transfer amount (fungible) or token ID (NFT) |

#### Encrypted Section (Variable Length)

| Field      | Size     | Description                       |
| ---------- | -------- | --------------------------------- |
| IV         | 12 bytes | AES-256-GCM initialization vector |
| Ciphertext | Variable | Encrypted `senderInfo` payload    |
| Auth Tag   | 16 bytes | GCM authentication tag            |

#### Metadata Encryption

```text
sharedSecret =
Keccak256(
  x(ephemeralPrivate * pk_view_recipient)
)

K_meta =
HKDF-SHA256(
  sharedSecret,
  "ghost-shard-metadata"
)

(IV, ciphertext, authTag) =
AES-256-GCM(
  K_meta,
  random(96),
  senderInfo
)
```

Only the intended recipient, possessing `sk_view`, can derive `sharedSecret` and decrypt the metadata.

---

### E.3 View Tag Filtering

The view tag enables efficient announcement scanning without performing full ownership verification for every announcement.

```text
Scanning Wallet

1. Read viewTag from announcement
2. Compute candidateSharedSecret
   = sk_view * ephemeralPubKey

3. Compute candidateTag
   = firstByte(
       Keccak256(
         x(candidateSharedSecret)
       )
     )

4. If candidateTag != viewTag
      Skip announcement

5. If candidateTag == viewTag
      Perform full ownership verification
```

Expected reduction factor:

```text
Approximately 256-to-1 fewer
full ownership checks
```

---

### E.4 Example Announcement (Hex)

```text
Plaintext Header

View Tag:
0xA7

Asset Type:
0x01 (ERC-20)

Token Address:
0x6B175474E89094C44Da98b954EedeAC495271d0F

Amount:
0x0000000000000000000000000000000000000000000000010A7C...

Encrypted Section

IV:
0x3F2A...

Ciphertext:
0x8B71...

Authentication Tag:
0xE4C9...
```

---

### E.5 Announcement Lifecycle

```text
1. Sender derives stealth address
   from recipient meta-address

2. Sender generates ephemeral keypair
   (e, E)

3. Sender computes shared secret
   using ECDH

4. Sender encrypts metadata
   using an HKDF-derived key

5. Sender publishes announcement
   together with the transfer

6. Recipient scans announcements

7. Recipient reconstructs
   the shared secret

8. Recipient decrypts metadata

9. Recipient adds the discovered
   shard to local wallet state
```

---

### E.6 Compatibility

GhostShard uses ERC-5564 Scheme ID 1 (secp256k1).

The scheme ID field allows future migration to alternative cryptographic schemes without modifying the announcement infrastructure.

Examples include:

* Post-quantum key exchange schemes
* Hybrid secp256k1 plus post-quantum deployments
* Future ERC-5564-compatible cryptographic systems

Dual-scheme announcements, where both secp256k1 and post-quantum announcements are published for the same recipient, remain compatible with the ERC-5564 announcement model.
