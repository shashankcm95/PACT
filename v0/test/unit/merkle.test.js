#!/usr/bin/env node
'use strict';

// PACT v0 — merkle.test.js  (plans/15 §4: RFC-6962 conformance + the NON-VACUITY axis — every guard seen RED)
//
// The external ORACLE is the published RFC-6962 / RFC-9162 SHA-256 test vectors (NOT derived from this code):
//   * empty-tree root  = sha256("")                       (RFC-6962 §2.1)
//   * leafHash(empty)  = sha256(0x00)                     (the single-0x00-byte hash; the n=1 root)
//   * the canonical 8-entry CT reference tree roots       (kSHA256Roots, widely published)
// plus STRUCTURAL anchors (single==leaf, pair==nodeHash, n=3/n=4 splits) that hold WITHOUT any memorized
// constant — so a mis-transcribed big vector is disambiguated from a real algorithm bug (only the vector fails).

const assert = require('node:assert/strict');
const {
  leafHash, nodeHash, merkleRoot,
  inclusionProof, verifyInclusion,
  consistencyProof, verifyConsistency,
  verifySTH, sthBasis,
} = require('../../src/lib/merkle');
const { generateEdgeKeypair, signRecordId } = require('../../src/lib/edge-attestation');
const { sha256hex } = require('../../src/lib/record');
const { canonicalJsonSerialize } = require('../../src/lib/canonical-json');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// --- the canonical CT reference inputs (hex of the leaf DATA) + published SHA-256 MTH roots -------------------
const STD_INPUTS = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657', '606162636465666768696a6b6c6d6e6f'];
const SHA256_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const LEAFHASH_EMPTY = '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d'; // sha256(0x00)
const ROOT_N2 = 'fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125';
const ROOT_N8 = '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328';
function stdLeaf(i) { return leafHash(Buffer.from(STD_INPUTS[i], 'hex')); }
function stdLeaves(n) { const o = []; for (let i = 0; i < n; i++) o.push(stdLeaf(i)); return o; }
const HEX64 = /^[0-9a-f]{64}$/;

// ===================== leafHash / nodeHash: domain separation + second-preimage =====================
test('leafHash(empty) == sha256(0x00) (RFC-6962 single-0x00 vector)', () => {
  assert.equal(leafHash(Buffer.alloc(0)), LEAFHASH_EMPTY);
});
test('leafHash != nodeHash for the same bytes (0x00 vs 0x01 domain separation)', () => {
  const a = leafHash(Buffer.alloc(0));
  const b = leafHash(Buffer.from([1]));
  assert.notEqual(leafHash(Buffer.concat([Buffer.from(a, 'hex'), Buffer.from(b, 'hex')])), nodeHash(a, b));
});
test('second-preimage: leafHash(decode(nodeHash(a,b))) != nodeHash(a,b)', () => {
  const a = leafHash(Buffer.from('aa', 'hex'));
  const b = leafHash(Buffer.from('bb', 'hex'));
  const n = nodeHash(a, b);
  assert.notEqual(leafHash(Buffer.from(n, 'hex')), n);
});
test('leafHash rejects a non-Buffer (fail-closed)', () => {
  assert.throws(() => leafHash('aa'));
  assert.throws(() => leafHash(null));
});
test('nodeHash rejects non-64-hex children (fail-closed)', () => {
  assert.throws(() => nodeHash('xyz', leafHash(Buffer.alloc(0))));
  assert.throws(() => nodeHash(leafHash(Buffer.alloc(0)), 42));
});

// ===================== merkleRoot: external oracle + structural anchors =====================
test('merkleRoot([]) == sha256("") (empty-tree root)', () => {
  assert.equal(merkleRoot([]), SHA256_EMPTY);
});
test('merkleRoot single-leaf == that leaf hash (structural)', () => {
  const L = leafHash(Buffer.from('deadbeef', 'hex'));
  assert.equal(merkleRoot([L]), L);
});
test('merkleRoot pair == nodeHash(L0,L1) (structural)', () => {
  const L0 = stdLeaf(0); const L1 = stdLeaf(1);
  assert.equal(merkleRoot([L0, L1]), nodeHash(L0, L1));
});
test('merkleRoot n=3 == nodeHash(nodeHash(L0,L1), L2) (split at k=2, structural)', () => {
  const [L0, L1, L2] = stdLeaves(3);
  assert.equal(merkleRoot([L0, L1, L2]), nodeHash(nodeHash(L0, L1), L2));
});
test('merkleRoot n=4 == nodeHash(nodeHash(L0,L1), nodeHash(L2,L3)) (structural)', () => {
  const [L0, L1, L2, L3] = stdLeaves(4);
  assert.equal(merkleRoot([L0, L1, L2, L3]), nodeHash(nodeHash(L0, L1), nodeHash(L2, L3)));
});
test('merkleRoot n=2 == published RFC-6962 CT root (external oracle)', () => {
  assert.equal(merkleRoot(stdLeaves(2)), ROOT_N2);
});
test('merkleRoot n=8 == published RFC-6962 CT root (full-recursion external oracle)', () => {
  assert.equal(merkleRoot(stdLeaves(8)), ROOT_N8);
});
test('merkleRoot rejects a non-64-hex leaf (fail-closed)', () => {
  assert.throws(() => merkleRoot(['nothex']));
  assert.throws(() => merkleRoot('notanarray'));
});

// ===================== inclusionProof / verifyInclusion: round-trip GREEN + NON-VACUITY RED =====================
test('inclusion round-trip: every index in trees of size 1..8 verifies', () => {
  for (let n = 1; n <= 8; n++) {
    const leaves = stdLeaves(n);
    const root = merkleRoot(leaves);
    for (let i = 0; i < n; i++) {
      const proof = inclusionProof(leaves, i);
      assert.equal(verifyInclusion(leaves[i], i, n, proof, root), true, `n=${n} i=${i} should verify`);
    }
  }
});
test('inclusion RED: forged leaf hash does not verify', () => {
  const leaves = stdLeaves(8); const root = merkleRoot(leaves);
  const proof = inclusionProof(leaves, 3);
  const forged = leafHash(Buffer.from('ffff', 'hex'));
  assert.equal(verifyInclusion(forged, 3, 8, proof, root), false);
});
test('inclusion RED: wrong index (valid proof for a different position)', () => {
  const leaves = stdLeaves(8); const root = merkleRoot(leaves);
  const proof = inclusionProof(leaves, 3);
  assert.equal(verifyInclusion(leaves[3], 4, 8, proof, root), false);
});
test('inclusion RED: tampered path node', () => {
  const leaves = stdLeaves(8); const root = merkleRoot(leaves);
  const proof = inclusionProof(leaves, 3).slice();
  proof[0] = leafHash(Buffer.from('00ff', 'hex'));
  assert.equal(verifyInclusion(leaves[3], 3, 8, proof, root), false);
});
test('inclusion RED: a size-8 proof presented as another tree (size-7 root, or an unrelated root)', () => {
  // (lying ONLY about treeSize while keeping the matching root is NOT a vuln — the proof genuinely connects to
  //  that root; the real guard is that the proof must not verify against a DIFFERENT tree's root.)
  const leaves8 = stdLeaves(8); const root8 = merkleRoot(leaves8);
  const proof = inclusionProof(leaves8, 3);
  const root7 = merkleRoot(stdLeaves(7));
  assert.equal(verifyInclusion(leaves8[3], 3, 7, proof, root7), false); // claimed size-7 + size-7 root
  const otherRoot = merkleRoot([leafHash(Buffer.from('00', 'hex')), leafHash(Buffer.from('11', 'hex'))]);
  assert.equal(verifyInclusion(leaves8[3], 3, 8, proof, otherRoot), false); // unrelated root
  assert.equal(verifyInclusion(leaves8[3], 3, 8, proof, root8), true);       // sanity: the honest case holds
});
test('inclusion RED: sibling-order swap (no caller flag; order is derived from i)', () => {
  // a verifier that ignored the i-derived order would accept a swapped two-element proof; ours must not.
  const leaves = stdLeaves(4); const root = merkleRoot(leaves);
  const proof = inclusionProof(leaves, 1); // [L0, nodeHash(L2,L3)]
  const swapped = [proof[1], proof[0]];
  assert.equal(verifyInclusion(leaves[1], 1, 4, swapped, root), false);
});
test('inclusion RED: proof too long', () => {
  const leaves = stdLeaves(8); const root = merkleRoot(leaves);
  const proof = inclusionProof(leaves, 3);
  assert.equal(verifyInclusion(leaves[3], 3, 8, [...proof, leafHash(Buffer.from('aa', 'hex'))], root), false);
});
test('inclusion RED: proof too short', () => {
  const leaves = stdLeaves(8); const root = merkleRoot(leaves);
  const proof = inclusionProof(leaves, 3);
  assert.equal(verifyInclusion(leaves[3], 3, 8, proof.slice(0, -1), root), false);
});
test('inclusion RED: i >= treeSize / negative / non-integer', () => {
  const leaves = stdLeaves(4); const root = merkleRoot(leaves);
  const proof = inclusionProof(leaves, 0);
  assert.equal(verifyInclusion(leaves[0], 4, 4, proof, root), false);
  assert.equal(verifyInclusion(leaves[0], -1, 4, proof, root), false);
  assert.equal(verifyInclusion(leaves[0], 1.5, 4, proof, root), false);
});
test('inclusionProof rejects an out-of-range index (fail-closed)', () => {
  const leaves = stdLeaves(4);
  assert.throws(() => inclusionProof(leaves, 4));
  assert.throws(() => inclusionProof(leaves, -1));
});
test('inclusion length cap: an oversized proof is rejected (O(1) work-amplification guard)', () => {
  const leaves = stdLeaves(2); const root = merkleRoot(leaves);
  const huge = new Array(100000).fill(leafHash(Buffer.from('aa', 'hex')));
  assert.equal(verifyInclusion(leaves[0], 0, 2, huge, root), false);
});

// ===================== consistencyProof / verifyConsistency: append-only proof + anti-rewrite =====================
test('consistency round-trip: every 0<m<=n (n up to 8) verifies', () => {
  for (let n = 1; n <= 8; n++) {
    const leavesN = stdLeaves(n);
    const rootN = merkleRoot(leavesN);
    for (let m = 1; m <= n; m++) {
      const rootM = merkleRoot(leavesN.slice(0, m));
      const proof = consistencyProof(leavesN, m);
      assert.equal(verifyConsistency(m, n, proof, rootM, rootN), true, `m=${m} n=${n} should be consistent`);
    }
  }
});
test('consistency RED: a REWRITTEN past leaf breaks the proof (anti-rewrite hinge)', () => {
  const leavesN = stdLeaves(8);
  const rootM = merkleRoot(leavesN.slice(0, 5));
  // tamper leaf 2 in the size-8 tree, recompute its root + an honest proof for the tampered tree
  const tampered = leavesN.slice(); tampered[2] = leafHash(Buffer.from('deadbeefdeadbeef', 'hex'));
  const rootNt = merkleRoot(tampered);
  const proof = consistencyProof(tampered, 5);
  // the old rootM (size-5 honest prefix) is NOT consistent with the tampered size-8 tree
  assert.equal(verifyConsistency(5, 8, proof, rootM, rootNt), false);
});
test('consistency RED: m=0 cannot anchor an arbitrary extension (size-0 is not an anchor)', () => {
  const leavesN = stdLeaves(8); const rootN = merkleRoot(leavesN);
  assert.equal(verifyConsistency(0, 8, [], SHA256_EMPTY, rootN), false);
});
test('consistency m=n is trivial (empty proof + equal roots) and rejects a non-empty/forged proof', () => {
  const leavesN = stdLeaves(5); const rootN = merkleRoot(leavesN);
  assert.equal(verifyConsistency(5, 5, [], rootN, rootN), true);
  assert.equal(verifyConsistency(5, 5, [leafHash(Buffer.from('aa', 'hex'))], rootN, rootN), false);
  assert.equal(verifyConsistency(5, 5, [], rootN, SHA256_EMPTY), false); // roots differ
});
test('consistency RED: m>n is rejected', () => {
  const leavesN = stdLeaves(4); const rootN = merkleRoot(leavesN);
  assert.equal(verifyConsistency(5, 4, [], rootN, rootN), false);
});
test('consistency RED: wrong rootM (claiming a different prefix)', () => {
  const leavesN = stdLeaves(8);
  const rootN = merkleRoot(leavesN);
  const proof = consistencyProof(leavesN, 5);
  const wrongRootM = merkleRoot(leavesN.slice(0, 4)); // claim size-5 but supply size-4 root
  assert.equal(verifyConsistency(5, 8, proof, wrongRootM, rootN), false);
});
test('consistency external oracle: a (2,8) proof verifies against the PUBLISHED roots (ROOT_N2 -> ROOT_N8)', () => {
  // ties verifyConsistency to TWO externally-pinned roots (not code-computed) — the consistency analogue of the
  // ROOT_N8 inclusion oracle (VALIDATE reviewer/honesty LOW: belt-and-suspenders vs a same-wrong-proof bug).
  const proof = consistencyProof(stdLeaves(8), 2);
  assert.equal(verifyConsistency(2, 8, proof, ROOT_N2, ROOT_N8), true);
});

// ===================== verifySTH: freshness-bound basis + ed25519 (alg-pinned) =====================
function makeSTH(over, kp) {
  const { root, tree_size, timestamp, nonce } = over;
  const basisHex = sthBasis({ root, tree_size, timestamp, nonce });
  const sig = signRecordId(basisHex, { privateKeyPem: kp.privateKeyPem });
  return { root, tree_size, timestamp, nonce, sig };
}
test('verifySTH GREEN on an authentic freshness-bound STH', () => {
  const kp = generateEdgeKeypair();
  const sth = makeSTH({ root: merkleRoot(stdLeaves(3)), tree_size: 3, timestamp: 1750000000000, nonce: 'abc123' }, kp);
  assert.equal(verifySTH(sth, kp.publicKeyPem), true);
});
test('verifySTH RED on tampered root / size / timestamp / nonce (basis changes => sig fails)', () => {
  const kp = generateEdgeKeypair();
  const base = { root: merkleRoot(stdLeaves(3)), tree_size: 3, timestamp: 1750000000000, nonce: 'abc123' };
  const sth = makeSTH(base, kp);
  assert.equal(verifySTH({ ...sth, root: merkleRoot(stdLeaves(4)) }, kp.publicKeyPem), false);
  assert.equal(verifySTH({ ...sth, tree_size: 4 }, kp.publicKeyPem), false);
  assert.equal(verifySTH({ ...sth, timestamp: 1750000000001 }, kp.publicKeyPem), false); // replay-relabel defeated
  assert.equal(verifySTH({ ...sth, nonce: 'xyz' }, kp.publicKeyPem), false);
});
test('verifySTH RED on wrong key / missing sig / malformed', () => {
  const kp = generateEdgeKeypair(); const other = generateEdgeKeypair();
  const sth = makeSTH({ root: merkleRoot(stdLeaves(3)), tree_size: 3, timestamp: 1750000000000, nonce: 'abc123' }, kp);
  assert.equal(verifySTH(sth, other.publicKeyPem), false);
  assert.equal(verifySTH({ ...sth, sig: undefined }, kp.publicKeyPem), false);
  assert.equal(verifySTH({ ...sth, root: 'nothex' }, kp.publicKeyPem), false);
  assert.equal(verifySTH(null, kp.publicKeyPem), false);
});
test('sthBasis is byte-stable + key-order-independent (the borrowed freshness pattern)', () => {
  const a = sthBasis({ root: LEAFHASH_EMPTY, tree_size: 1, timestamp: 5, nonce: 'n' });
  const b = sthBasis({ nonce: 'n', timestamp: 5, tree_size: 1, root: LEAFHASH_EMPTY });
  assert.equal(a, b);
  assert.ok(HEX64.test(a));
  // it really is sha256(canonical({root,tree_size,timestamp,nonce}))
  assert.equal(a, sha256hex(canonicalJsonSerialize({ root: LEAFHASH_EMPTY, tree_size: 1, timestamp: 5, nonce: 'n' })));
});

console.log(`\n[merkle] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
