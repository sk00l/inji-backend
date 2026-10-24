import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import jsonld from 'jsonld';
import {issueStudentCredential, loadIssuerKey, issuerDocuments, documentLoader,
  verifyStudentPresentation, student} from '../credentials.mjs';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'student-issuer-test-'));
const issuerKey = await loadIssuerKey(directory);
const documents = await issuerDocuments(issuerKey);
const loader = documentLoader(documents);
const pair = crypto.generateKeyPairSync('ed25519');
const publicJwk = pair.publicKey.export({format: 'jwk'});
const holder = 'did:jwk:' + Buffer.from(JSON.stringify(publicJwk)).toString('base64url');
const nonce = 'fresh-library-request-challenge';
const domain = 'university-library';

async function signPresentation(credential, options = {}) {
  const proof = {type: 'JsonWebSignature2020', created: new Date().toISOString(),
    challenge: nonce, domain, proofPurpose: 'authentication', verificationMethod: `${holder}#0`, ...options};
  const p = {'@context': ['https://www.w3.org/2018/credentials/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
    type: ['VerifiablePresentation'], holder, verifiableCredential: [credential]};
  const canonize = data => jsonld.canonize(data, {algorithm: 'URDNA2015', format: 'application/n-quads', documentLoader: loader, safe: true});
  const hash = text => crypto.createHash('sha256').update(text).digest();
  const verifyData = Buffer.concat([hash(await canonize({'@context': p['@context'], ...proof})), hash(await canonize(p))]);
  const header = Buffer.from(JSON.stringify({alg: 'EdDSA', b64: false, crit: ['b64']})).toString('base64url');
  const signature = crypto.sign(null, Buffer.concat([Buffer.from(header + '.'), verifyData]), pair.privateKey).toString('base64url');
  return {...p, proof: {...proof, jws: `${header}..${signature}`}};
}
const options = {nonce, domain, documents};

test('a valid university credential held by its student grants demo library access', async() => {
  const credential = await issueStudentCredential({key: issuerKey, holder});
  const result = await verifyStudentPresentation(await signPresentation(credential), options);
  assert.equal(result.approved, true);
  assert.equal(result.student.studentId, 'HU-2026-0001');
  assert.ok(Object.values(result.checks).every(Boolean));
});
test('a changed credential fails even when its containing presentation is correctly signed', async() => {
  const credential = await issueStudentCredential({key: issuerKey, holder});
  credential.credentialSubject.fullName = 'Changed after issuance';
  await assert.rejects(verifyStudentPresentation(await signPresentation(credential), options), /credential signature or validity/);
});
test('a modified wallet signature is rejected', async() => {
  const credential = await issueStudentCredential({key: issuerKey, holder});
  const p = await signPresentation(credential);
  const parts = p.proof.jws.split('.'); parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1); p.proof.jws = parts.join('.');
  await assert.rejects(verifyStudentPresentation(p, options), /presentation signature is invalid/);
});
test('a proof made for another challenge or verifier cannot be reused', async() => {
  const credential = await issueStudentCredential({key: issuerKey, holder});
  const p = await signPresentation(credential);
  await assert.rejects(verifyStudentPresentation(p, {...options, nonce: 'another-request'}), /challenge or verifier audience/);
  await assert.rejects(verifyStudentPresentation(p, {...options, domain: 'another-verifier'}), /challenge or verifier audience/);
});
test('a credential bound to another wallet is rejected', async() => {
  const another = crypto.generateKeyPairSync('ed25519').publicKey.export({format: 'jwk'});
  const anotherHolder = 'did:jwk:' + Buffer.from(JSON.stringify(another)).toString('base64url');
  const credential = await issueStudentCredential({key: issuerKey, holder: anotherHolder});
  await assert.rejects(verifyStudentPresentation(await signPresentation(credential), options), /belongs to another wallet/);
});
test('a valid graduate credential does not establish active enrollment', async() => {
  const credential = await issueStudentCredential({key: issuerKey, holder, subject: {...student, enrollmentStatus: 'graduated'}});
  const result = await verifyStudentPresentation(await signPresentation(credential), options);
  assert.equal(result.approved, false);
  assert.equal(result.decision, 'LIBRARY_ACCESS_DENIED');
  assert.equal(result.checks.credentialSignature, true);
  assert.equal(result.checks.activeEnrollment, false);
});
test('an untrusted issuer and an expired validity period are rejected', async() => {
  const credential = await issueStudentCredential({key: issuerKey, holder});
  const p = await signPresentation(credential);
  await assert.rejects(verifyStudentPresentation(p, {...options, now: new Date(Date.parse(credential.expirationDate) + 1000)}), /validity period/);
  const untrusted = structuredClone(credential); untrusted.issuer = 'did:web:another-university.example';
  await assert.rejects(verifyStudentPresentation(await signPresentation(untrusted), options), /trusted university/);
});
test('issuer key survives service restarts', async() => {
  const again = await loadIssuerKey(directory);
  assert.deepEqual(await again.export({publicKey: true}), await issuerKey.export({publicKey: true}));
});
