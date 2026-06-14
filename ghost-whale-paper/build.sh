#!/bin/bash

set -e

OUTPUT="GhostWhale.md"
TMP="GhostWhale.tmp.md"

# Title page

cat > "$TMP" <<'EOF'
# The Ghost Whale: Practical Privacy with Selective Disclosure on the Post-Pectra EVM

**Author:** Benjamin Ofem  
**X:** @CulturedBadBoy1  
**LinkedIn:** https://www.linkedin.com/in/benjamin-ofem-894a5a318/  
**Date:** June 2026  
**Protocol:** GhostShard 
**Repository:** https://github.com/giantgun/ghost-shard-protocol

---

## Table of Contents

<!-- toc -->

<!-- tocstop -->

---

EOF

# Append chapters

cat \
00-abstract/*.md \
01-introduction/*.md \
02-design-rationale/*.md \
03-comparison-with-existing-systems/*.md \
04-system-overview/*.md \
05-cryptographic-foundation/*.md \
06-execution-model/*.md \
07-economic-model/*.md \
08-privacy-analysis/*.md \
09-compliance-and-selective-disclosure/*.md \
10-security-analysis/*.md \
11-performance-evaluation/*.md \
12-roadmap-and-future-work/*.md \
13-conclusion/*.md \
14-appendices/*.md \
>> "$TMP"

# Generate TOC if markdown-toc is installed

if command -v markdown-toc >/dev/null 2>&1; then
    # --maxdepth 2 limits the TOC to H1 and H2 headers
    markdown-toc --maxdepth 2 -i "$TMP"
fi

mv "$TMP" "$OUTPUT"

echo "Built $OUTPUT"
