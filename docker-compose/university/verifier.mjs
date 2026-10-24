import express from 'express';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {generateKeyPair, exportJWK, importJWK, SignJWT} from 'jose';
import {ISSUER_DID, verifyStudentPresentation} from './credentials.mjs';
import QRCode from 'qrcode';

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({extended: false, limit: '2mb'}));
app.use(express.json({limit: '2mb'}));
app.use((req, res, next) => {res.set('Cache-Control', 'no-store'); next();});
const BASE = process.env.BASE_URL || 'https://verifier.localhost';
const BROWSER = process.env.BROWSER_URL || 'http://localhost:3000';
const MOBILE = process.env.MOBILE_DEMO === 'true';
const LOGO = process.env.ISSUER_LOGO_URL || 'http://university.localhost:3006/static/seal.svg';
const WALLET = 'http://localhost:3004/user/authorize';
const CLIENT = 'university-library';
const directory = process.env.DATA_DIR || '/data';
await fs.mkdir(directory, {recursive: true});
const keyFile = path.join(directory, 'library-request-key.json');
let signingJwk;
try {signingJwk = JSON.parse(await fs.readFile(keyFile, 'utf8'));}
catch(error) {
  if(error.code !== 'ENOENT') throw error;
  signingJwk = await exportJWK((await generateKeyPair('EdDSA', {extractable: true})).privateKey);
  await fs.writeFile(keyFile, JSON.stringify(signingJwk), {mode: 0o600});
}
const signingKey = await importJWK(signingJwk, 'EdDSA');
const publicJwk = {...signingJwk, kid: `${BASE}/keys/library-key`, alg: 'EdDSA', use: 'sig'};
delete publicJwk.d;
const requests = new Map(), results = new Map();
let latestLegacyResult = null;
setInterval(() => {
  for(const map of [requests, results]) for(const [key, value] of map) if(value.expires < Date.now()) map.delete(key);
}, 60000).unref();
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const definition = {
  id: 'university-library-student-id', name: 'Campus library student access',
  purpose: 'Check a university-issued student ID, active enrollment, validity, and ownership before granting demo library access. The full ID is shared with your consent.',
  input_descriptors: [{id: 'student-id', name: 'University Student ID',
    purpose: 'A student ID issued by Himalaya University (Demo).',
    format: {ldp_vc: {proof_type: ['Ed25519Signature2020']}},
    constraints: {fields: [
      {path: ['$.credentialSubject.studentId']},
      {path: ['$.credentialSubject.enrollmentStatus']},
      {path: ['$.issuer'], filter: {type: 'string', pattern: '^' + ISSUER_DID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'}}
    ]}}]
};
const legacyDefinition = {
  id: 'local-identity-tour', input_descriptors: [{id: 'mock-identity',
    format: {ldp_vc: {proof_type: ['Ed25519Signature2020', 'RsaSignature2018']}},
    constraints: {fields: [{path: ['$.credentialSubject.fullName']}]}}]
};
function createRequest(legacy = false) {
  const state = crypto.randomBytes(24).toString('base64url');
  const nonce = crypto.randomBytes(24).toString('base64url');
  requests.set(state, {state, nonce, legacy, consumed: false, expires: Date.now() + 5 * 60000});
  const inputData = {
    client_id: legacy ? 'mock-client' : CLIENT, client_id_scheme: 'pre-registered',
    request_uri: `${BASE}/university/request/${state}`, request_uri_method: 'post'
  };
  return {state, walletUrl: WALLET, mobileUrl: 'openid4vp://authorize?' + new URLSearchParams(inputData),
    qrUrl: `/university/request-qr/${state}`, inputData};
}
app.get('/', asyncRoute(async(req, res) => {
  let html = await fs.readFile(new URL('./public/library.html', import.meta.url), 'utf8');
  if(MOBILE) html = html.replace('<body>', '<body data-mobile="true">')
    .replaceAll('http://university.localhost:3006/static/seal.svg', LOGO)
    .replaceAll('http://localhost:3006', `${BROWSER}/issuer`)
    .replaceAll('Inji Web', 'Inji Mobile')
    .replace('New student:', 'College login:')
    .replace('Create your wallet and PIN, then add your student ID from the college issuer before presenting.', 'Set up Inji Mobile, then add your student ID from the college issuer before presenting.');
  res.type('html').send(html);
}));
app.get('/health', (req, res) => res.json({status: 'UP', service: 'university-library-demo'}));
app.get('/.well-known/jwks.json', (req, res) => res.json({keys: [publicJwk]}));
app.get('/university/definition', (req, res) => res.json(definition));
app.get('/verifier/presentation_definition_uri', (req, res) => res.json(legacyDefinition));
app.get('/university/request', (req, res) => res.json(createRequest()));
app.get('/university/request-qr/:state', asyncRoute(async(req, res) => {
  const pending = requests.get(req.params.state);
  if(!pending || pending.legacy || pending.consumed || pending.expires < Date.now()) return res.sendStatus(410);
  const data = {client_id: CLIENT, client_id_scheme: 'pre-registered',
    request_uri: `${BASE}/university/request/${pending.state}`, request_uri_method: 'post'};
  res.type('image/svg+xml').send(await QRCode.toString('openid4vp://authorize?' + new URLSearchParams(data), {type: 'svg', margin: 4, width: 320}));
}));
app.get('/verifier/pre-registered/by_reference', (req, res) => res.json(createRequest(true)));
app.all('/university/request/:state', asyncRoute(async(req, res) => {
  const pending = requests.get(req.params.state);
  if(!pending || pending.consumed || pending.expires < Date.now()) return res.status(410).json({error: 'request_expired'});
  const payload = {
    client_id: pending.legacy ? 'mock-client' : CLIENT, client_id_scheme: 'pre-registered',
    presentation_definition_uri: `${BASE}${pending.legacy ? '/verifier/presentation_definition_uri' : '/university/definition'}`,
    response_type: 'vp_token', response_mode: 'direct_post', nonce: pending.nonce, state: pending.state,
    response_uri: `${BASE}${pending.legacy ? '/verifier/vp-response' : '/university/presentations'}`,
    client_metadata: JSON.stringify({client_name: pending.legacy ? 'Local identity demo receiver' : 'Himalaya University Library (Demo)',
      logo_uri: LOGO,
      vp_formats: {ldp_vp: {proof_type: ['JsonWebSignature2020']}, ldp_vc: {proof_type: ['Ed25519Signature2020', 'RsaSignature2018']}}})
  };
  if(req.body.wallet_nonce) payload.wallet_nonce = req.body.wallet_nonce;
  const jwt = await new SignJWT(payload).setProtectedHeader({alg: 'EdDSA', typ: 'oauth-authz-req+jwt', kid: publicJwk.kid})
    .setIssuedAt().setExpirationTime('5m').sign(signingKey);
  res.type('application/oauth-authz-req+jwt').send(jwt);
}));

app.post('/university/presentations', asyncRoute(async(req, res) => {
  const state = req.body.state;
  const pending = requests.get(state);
  if(!pending || pending.legacy || pending.consumed || pending.expires < Date.now()) {
    return res.status(400).json({error: 'invalid_request', error_description: 'Unknown, expired, or already used presentation request'});
  }
  pending.consumed = true;
  let result;
  if(req.body.error) {
    result = {approved: false, decision: 'SHARING_DECLINED', reason: 'The student declined to share a credential.'};
  } else {
    try {
      const presentation = typeof req.body.vp_token === 'string' ? JSON.parse(req.body.vp_token) : req.body.vp_token;
      const submission = typeof req.body.presentation_submission === 'string' ? JSON.parse(req.body.presentation_submission) : req.body.presentation_submission;
      // This Mimoto revision labels descriptor_map entries with its stored card
      // UUID instead of the requested input descriptor ID. This demo requests
      // exactly one card: require its exact mapping and independently enforce
      // every requested credential constraint during cryptographic verification.
      const descriptors = submission?.descriptor_map;
      const descriptor = descriptors?.[0];
      if(submission?.definition_id !== definition.id || descriptors?.length !== 1 ||
        typeof descriptor?.id !== 'string' || !descriptor.id ||
        descriptor.format !== 'ldp_vp' || descriptor.path !== '$' ||
        descriptor.path_nested?.format !== 'ldp_vc' || descriptor.path_nested?.path !== '$.verifiableCredential[0]') {
        throw Error('Presentation does not answer the library request');
      }
      result = await verifyStudentPresentation(presentation, {nonce: pending.nonce, domain: CLIENT});
    } catch(error) {
      result = {approved: false, decision: 'VERIFICATION_FAILED', reason: error.message};
    }
  }
  results.set(state, {...result, expires: Date.now() + 10 * 60000});
  // OAuth direct_post acknowledges transport even if the eligibility decision is
  // negative. The separate result explicitly reports the validation outcome.
  res.json({redirect_uri: `${BROWSER}/?result=${encodeURIComponent(state)}`});
}));
app.get('/university/results/:state', (req, res) => {
  const result = results.get(req.params.state);
  if(result && result.expires >= Date.now()) return res.json(result);
  const pending = requests.get(req.params.state);
  res.json({decision: pending && pending.expires >= Date.now() ? 'PENDING' : 'REQUEST_EXPIRED'});
});

// Keep the previous identity-tour protocol check available, explicitly as a
// receipt-only mock. It cannot produce a university library access decision.
app.post('/verifier/vp-response', (req, res) => {
  const pending = requests.get(req.body.state);
  if(!pending?.legacy || pending.consumed || pending.expires < Date.now()) return res.status(400).json({error: 'invalid_request'});
  pending.consumed = true; latestLegacyResult = req.body;
  res.json({redirect_uri: `${BROWSER}/verifier/callback`});
});
app.get('/verifier/vp-result', (req, res) => {const result = latestLegacyResult; latestLegacyResult = null; res.json(result || false);});
app.get('/verifier/callback', (req, res) => res.send('<h1>Demo presentation received</h1><p>This legacy receiver only acknowledges delivery.</p><a href="/">Open university demo</a>'));
app.use((error, req, res, next) => {console.error('Library request rejected:', error.message); res.status(400).json({error: 'invalid_request', error_description: 'The demo request could not be processed'});});
app.listen(3000, '0.0.0.0', () => console.log('University library demo: http://localhost:3000'));
