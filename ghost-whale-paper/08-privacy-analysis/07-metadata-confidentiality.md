## 8.7 Metadata Confidentiality

> **Question:** What information is revealed through announcements, and what remains confidential?

GhostShard uses ERC-5564 announcements as the recipient-discovery mechanism. Because announcements are publicly visible, privacy depends on carefully controlling which information must remain observable and which information can be concealed.

The objective is not to hide the existence of a transfer, but to minimize the amount of information that can be learned from the announcement itself.

---

### 8.7.1 Announcement Structure

Every output shard is accompanied by an ERC-5564 announcement containing:

| Field | Visibility |
|---------|---------|
| `schemeId` | Public |
| `stealthAddress` | Public |
| `ephemeralPubKey` | Public |
| `metadata` | Partially encrypted |

The public fields are required for recipient discovery and protocol interoperability.

The `metadata` field contains both publicly visible and encrypted components.

---

### 8.7.2 Public Information

An observer can determine:

* That an announcement was emitted.
* The stealth address associated with the new shard.
* The ephemeral public key used during stealth-address derivation.
* The transaction in which the announcement was created.
* The timing of the announcement.

These values are necessary for recipients to discover newly created shards and therefore cannot be fully concealed.

Importantly, visibility of these fields does not reveal ownership.

As discussed in Sections 8.1 and 8.3, a stealth address remains unlinkable to a recipient identity without the corresponding viewing key.

---

### 8.7.3 Encrypted Information

Certain announcement data is encrypted using keys derived from the shared secret established during stealth-address derivation.

Only parties capable of reconstructing that shared secret can decrypt the protected contents.

Examples include:

* Optional sender-identifying information.
* Recipient-specific transfer metadata.
* Future protocol extensions requiring selective disclosure.

To external observers, this information appears as authenticated ciphertext.

Consequently, the existence of metadata is visible, but its contents remain confidential.

---

### 8.7.4 Metadata Length Considerations

Metadata length can itself become a side channel.

If different announcement types produce ciphertexts of different sizes, observers may infer information about the underlying transfer even without decrypting the contents.

Future versions of GhostShard may standardize encrypted metadata lengths through padding mechanisms.

Such an approach would prevent observers from distinguishing announcements based on payload size and would reduce metadata-based fingerprinting opportunities.

This remains future work and is not required for the core privacy guarantees described in this paper.

---

### 8.7.5 Privacy Implications

Metadata confidentiality complements the privacy properties discussed throughout this chapter.

Announcements reveal that ownership objects were created, but do not reveal:

* Who owns them.
* Who created them.
* How outputs should be interpreted.
* The ownership relationships between announcements.

As a result, announcements function primarily as discovery signals rather than ownership disclosures.

The blockchain records that new shards exist, while the information required to interpret those shards remains accessible only to the intended recipients.