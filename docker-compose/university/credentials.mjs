import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as vc from '@digitalbazaar/vc';
import {Ed25519VerificationKey2020} from '@digitalbazaar/ed25519-verification-key-2020';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import jsonld from 'jsonld';
import {calculateJwkThumbprint} from 'jose';
import jwsContext from './contexts/jws-2020.json' with {type: 'json'};

export const ISSUER = process.env.ISSUER_URL || 'https://university.localhost';
const issuerUrl = new URL(ISSUER);
export const ISSUER_DID = 'did:web:' + issuerUrl.host.replaceAll(':', '%3A') +
  issuerUrl.pathname.split('/').filter(Boolean).map(encodeURIComponent).map(x => ':' + x).join('');
export const CONTEXT_URL = `${ISSUER}/contexts/student-v1.jsonld`;
export const UNIVERSITY = 'Himalaya University (Demo)';
export const student = Object.freeze({
  studentId: 'HU-2026-0001', fullName: 'Aarav Sharma', university: UNIVERSITY,
  program: 'BSc Computer Science', department: 'School of Computing',
  enrollmentStatus: 'active', academicYear: '2026/27', campus: 'Kathmandu Demo Campus'
});
export const studentContext = {'@context': {
  '@version': 1.1,
  StudentIDCredential: `${ISSUER}/vocab#StudentIDCredential`,
  ...Object.fromEntries(Object.keys(student).map(key => [key, `${ISSUER}/vocab#${key}`]))
}};
export const wrapDocument = (url, document) => ({contextUrl: null, documentUrl: url, document});

export async function loadIssuerKey(directory) {
  await fs.mkdir(directory, {recursive: true});
  const filename = path.join(directory, 'student-signing-key.json');
  try {
    const key = await Ed25519VerificationKey2020.from(JSON.parse(await fs.readFile(filename, 'utf8')));
    if(key.controller !== ISSUER_DID) throw Error('Issuer URL changed: preserve the original origin or use a new isolated demo data volume');
    return key;
  }
  catch(error) {if(error.code !== 'ENOENT') throw error;}
  const key = await Ed25519VerificationKey2020.generate({controller: ISSUER_DID});
  key.id = `${ISSUER_DID}#student-key`;
  await fs.writeFile(filename, JSON.stringify(await key.export({publicKey: true, privateKey: true})), {mode: 0o600});
  return key;
}

export async function issuerDocuments(key) {
  const publicKey = {'@context': Ed25519Signature2020.CONTEXT_URL, ...await key.export({publicKey: true})};
  return {publicKey, didDocument: {
    '@context': ['https://www.w3.org/ns/did/v1', Ed25519Signature2020.CONTEXT_URL],
    id: ISSUER_DID, verificationMethod: [publicKey], assertionMethod: [publicKey.id]
  }};
}

// Only fixed, known contexts and this demonstration university are resolved.
// Credential-provided URLs cannot turn verification into an arbitrary HTTP fetch.
export function documentLoader(documents) {
  return async url => {
    if(url === CONTEXT_URL) return wrapDocument(url, studentContext);
    if(url === Ed25519Signature2020.CONTEXT_URL) return wrapDocument(url, Ed25519Signature2020.CONTEXT);
    if(url === 'https://w3id.org/security/suites/jws-2020/v1') return wrapDocument(url, jwsContext);
    if(documents && url === ISSUER_DID) return wrapDocument(url, documents.didDocument);
    if(documents && url === documents.publicKey.id) return wrapDocument(url, documents.publicKey);
    if(url === ISSUER_DID || url === `${ISSUER_DID}#student-key`) {
      const response = await fetch(`${ISSUER}/.well-known/did.json`, {signal: AbortSignal.timeout(8000)});
      if(!response.ok) throw Error('University verification key is unavailable');
      const did = await response.json();
      if(did.id !== ISSUER_DID) throw Error('Unexpected university DID document');
      const key = did.verificationMethod.find(key => key.id === `${ISSUER_DID}#student-key`);
      if(!key || !did.assertionMethod.includes(key.id)) throw Error('University signing key is not authorized');
      return wrapDocument(url, url === ISSUER_DID ? did : {'@context': Ed25519Signature2020.CONTEXT_URL, ...key});
    }
    return vc.defaultDocumentLoader(url);
  };
}

export async function issueStudentCredential({key, holder, subject = student, now = new Date(), expires}) {
  const documents = await issuerDocuments(key);
  const expirationDate = expires || new Date(now.getTime() + 365 * 86400000).toISOString();
  return vc.issue({credential: {
    '@context': ['https://www.w3.org/2018/credentials/v1', CONTEXT_URL, Ed25519Signature2020.CONTEXT_URL],
    id: `${ISSUER}/credentials/${crypto.randomUUID()}`,
    type: ['VerifiableCredential', 'StudentIDCredential'], issuer: ISSUER_DID,
    issuanceDate: now.toISOString(), expirationDate,
    credentialSubject: {id: holder, ...subject}
  }, suite: new Ed25519Signature2020({key}), documentLoader: documentLoader(documents)});
}

export function publicJwkFromDid(did) {
  const controller = did.split('#')[0];
  if(!controller.startsWith('did:jwk:')) throw Error('A holder-bound did:jwk is required');
  const key = JSON.parse(Buffer.from(controller.slice(8), 'base64url').toString());
  if(key.d || key.k || key.kty !== 'OKP' || key.crv !== 'Ed25519' || !key.x) throw Error('Unsupported public holder key');
  return key;
}

async function normalized(document, loader) {
  return jsonld.canonize(document, {algorithm: 'URDNA2015', format: 'application/n-quads', documentLoader: loader, safe: true});
}
const hash = data => crypto.createHash('sha256').update(data).digest();

// Mimoto's JsonWebSignature2020 presentations use RFC 7797 detached JWS over
// canonicalized Linked Data proof/document hashes, signed with the wallet key.
export async function verifyHolderPresentation(presentation, {nonce, domain, loader}) {
  const proof = presentation?.proof;
  if(!presentation?.type?.includes('VerifiablePresentation') || !proof || Array.isArray(proof)) throw Error('Expected one signed presentation');
  if(proof.type !== 'JsonWebSignature2020' || proof.proofPurpose !== 'authentication') throw Error('Unsupported holder proof');
  if(proof.challenge !== nonce || proof.domain !== domain) throw Error('Presentation challenge or verifier audience does not match');
  if(!presentation.holder || proof.verificationMethod?.split('#')[0] !== presentation.holder.split('#')[0]) throw Error('Holder and signing key do not match');
  const publicKey = publicJwkFromDid(presentation.holder);
  const parts = proof.jws?.split('.') || [];
  if(parts.length !== 3 || parts[1] !== '') throw Error('A detached JWS is required');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  if(header.alg !== 'EdDSA' || header.b64 !== false || !header.crit?.includes('b64') || header.crit.some(x => x !== 'b64')) throw Error('Unsupported detached JWS header');
  const options = {'@context': presentation['@context'], ...proof};
  delete options.jws;
  const document = structuredClone(presentation); delete document.proof;
  const verifyData = Buffer.concat([hash(await normalized(options, loader)), hash(await normalized(document, loader))]);
  const input = Buffer.concat([Buffer.from(parts[0] + '.'), verifyData]);
  if(!crypto.verify(null, input, crypto.createPublicKey({key: publicKey, format: 'jwk'}), Buffer.from(parts[2], 'base64url'))) throw Error('Wallet presentation signature is invalid');
  return publicKey;
}

export async function verifyStudentPresentation(presentation, {nonce, domain, documents, now = new Date()}) {
  const loader = documentLoader(documents);
  const holderKey = await verifyHolderPresentation(presentation, {nonce, domain, loader});
  const credentials = presentation.verifiableCredential;
  if(!Array.isArray(credentials) || credentials.length !== 1) throw Error('Present exactly one student credential');
  const credential = credentials[0];
  if(credential.issuer !== ISSUER_DID || !credential.type?.includes('StudentIDCredential')) throw Error('The credential is not from the trusted university');
  const verification = await vc.verifyCredential({credential, suite: new Ed25519Signature2020(), documentLoader: loader});
  if(!verification.verified) throw Error('Student credential signature or validity check failed');
  const holder = publicJwkFromDid(credential.credentialSubject?.id || '');
  if(await calculateJwkThumbprint(holder) !== await calculateJwkThumbprint(holderKey)) throw Error('The student credential belongs to another wallet');
  if(Date.parse(credential.issuanceDate) > now.getTime() || !(Date.parse(credential.expirationDate) > now.getTime())) throw Error('The student credential is outside its validity period');
  const subject = credential.credentialSubject;
  const eligible = subject.enrollmentStatus === 'active' && subject.university === UNIVERSITY && typeof subject.studentId === 'string' && /^HU-\d{4}-\d{4}$/.test(subject.studentId);
  return {approved: eligible, decision: eligible ? 'LIBRARY_ACCESS_APPROVED' : 'LIBRARY_ACCESS_DENIED',
    reason: eligible ? 'University signature, wallet ownership, validity, and active enrollment checked.' : 'A valid credential was presented, but active enrollment is required.',
    student: {fullName: subject.fullName, studentId: subject.studentId, program: subject.program,
      enrollmentStatus: subject.enrollmentStatus, university: subject.university},
    checks: {holderSignature: true, credentialSignature: true, trustedIssuer: true, holderBinding: true, validity: true, activeEnrollment: eligible}};
}
