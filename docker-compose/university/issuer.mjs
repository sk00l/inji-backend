import express from 'express';
import fs from 'node:fs/promises';
import https from 'node:https';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {importJWK, jwtVerify, decodeProtectedHeader} from 'jose';
import {ISSUER, ISSUER_DID, CONTEXT_URL, UNIVERSITY, studentContext,
  loadIssuerKey, issuerDocuments, issueStudentCredential} from './credentials.mjs';
import {authenticateStudent, studentRecord} from './students.mjs';

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({extended: false, limit: '32kb'}));
app.use(express.json({limit: '64kb'}));
app.use((req, res, next) => {res.set('Cache-Control', 'no-store'); next();});
app.use('/static', express.static(fileURLToPath(new URL('./public', import.meta.url))));
const key = await loadIssuerKey(process.env.DATA_DIR || '/data');
const documents = await issuerDocuments(key);
const clientPublicKey = await importJWK(JSON.parse(await fs.readFile('/keys/university-client-public.jwk', 'utf8')), 'RS256');
const CLIENT = process.env.ISSUER_CLIENT_ID || 'university-wallet';
const CALLBACK = process.env.ISSUER_REDIRECT_URI || 'http://localhost:3004/redirect';
const AUTHORIZATION_URL = process.env.ISSUER_AUTHORIZATION_URL || 'http://localhost:3006/authorize';
const LOGO = process.env.ISSUER_LOGO_URL || 'http://university.localhost:3006/static/seal.svg';
const PUBLIC_CLIENT = process.env.ISSUER_PUBLIC_CLIENT === 'true';
const SCOPE = 'university_student_id';
const configurationId = 'StudentIDCredential';
const expires = () => Date.now() + 5 * 60000;
const random = () => crypto.randomBytes(32).toString('base64url');
const sha256 = value => crypto.createHash('sha256').update(value).digest('base64url');
const attempts = new Map(), codes = new Map(), tokens = new Map(), nonces = new Map(), assertions = new Map();
for(const map of [attempts, codes, tokens, nonces, assertions]) {
  setInterval(() => {for(const [key, value] of map) if(value.expires < Date.now()) map.delete(key);}, 60000).unref();
}
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const error = (res, message, status = 400) => res.status(status).json({error: 'invalid_request', error_description: message});

app.get('/', asyncRoute(async(req, res) => {
  let html = await fs.readFile(new URL('./public/registrar.html', import.meta.url), 'utf8');
  if(PUBLIC_CLIENT) html = html.replaceAll('src="/static/', `src="${ISSUER}/static/`)
    .replace('<a href="http://localhost:3004">Open student wallet</a>', '<span>Open Inji Mobile to request your card.</span>')
    .replaceAll('http://localhost:3000', new URL(ISSUER).origin)
    .replace('Use this login for both wallet and college. Create your own wallet PIN, then select this college in the issuer list.', 'Use this college login during issuance. Set up and unlock Inji Mobile separately, then select this college in the issuer list.');
  res.type('html').send(html);
}));
app.get('/health', (req, res) => res.json({status: 'UP', service: 'university-demo-issuer'}));
app.get('/.well-known/did.json', (req, res) => res.json(documents.didDocument));
app.get('/did.json', (req, res) => res.json(documents.didDocument));
app.get('/contexts/student-v1.jsonld', (req, res) => res.type('application/ld+json').send(studentContext));
app.get('/.well-known/openid-credential-issuer', (req, res) => res.json({
  credential_issuer: ISSUER, authorization_servers: [ISSUER], credential_endpoint: `${ISSUER}/credential`,
  nonce_endpoint: `${ISSUER}/nonce`, display: [{name: UNIVERSITY, locale: 'en'}],
  credential_configurations_supported: {[configurationId]: {
    format: 'ldp_vc', scope: SCOPE, cryptographic_binding_methods_supported: ['did:jwk'],
    credential_signing_alg_values_supported: ['EdDSA'],
    proof_types_supported: {jwt: {proof_signing_alg_values_supported: ['Ed25519', 'EdDSA']}},
    credential_definition: {type: ['VerifiableCredential', 'StudentIDCredential'],
      '@context': ['https://www.w3.org/2018/credentials/v1', CONTEXT_URL]},
    credential_metadata: {display: [{name: 'University Student ID', locale: 'en',
      logo: {uri: LOGO, alt_text: 'Himalaya University demo seal'},
      background_color: '#142f47', text_color: '#ffffff'}]}
  }}
}));
app.get('/.well-known/oauth-authorization-server', (req, res) => res.json({
  issuer: ISSUER, authorization_endpoint: AUTHORIZATION_URL, token_endpoint: `${ISSUER}/oauth/token`,
  response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
  token_endpoint_auth_methods_supported: PUBLIC_CLIENT ? ['none'] : ['private_key_jwt'],
  token_endpoint_auth_signing_alg_values_supported: ['RS256'], code_challenge_methods_supported: ['S256'],
  scopes_supported: [SCOPE]
}));

app.get('/authorize', asyncRoute(async(req, res) => {
  const q = req.query;
  if(q.client_id !== CLIENT || q.redirect_uri !== CALLBACK || q.response_type !== 'code' || q.scope !== SCOPE ||
    q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge || '') || typeof q.state !== 'string') {
    return error(res, 'Client, callback, scope, state, or PKCE challenge is not registered');
  }
  const id = random(), csrf = random();
  attempts.set(id, {csrf, state: q.state, challenge: q.code_challenge, expires: expires()});
  res.cookie('university-demo-flow', id, {httpOnly: true, sameSite: 'lax', maxAge: 300000, path: '/authorize'});
  const template = await fs.readFile(new URL('./public/student-login.html', import.meta.url), 'utf8');
  res.send(template.replaceAll('{{CSRF}}', csrf).replaceAll('src="/static/', `src="${new URL(AUTHORIZATION_URL).origin}${new URL(AUTHORIZATION_URL).pathname.replace(/\/authorize$/, '')}/static/`).replace('action="/authorize"', `action="${AUTHORIZATION_URL}"`));
}));
app.post('/authorize', (req, res) => {
  const id = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('university-demo-flow='))?.split('=')[1];
  const flow = attempts.get(id);
  if(!flow || flow.expires < Date.now() || req.body.csrf !== flow.csrf) return error(res, 'Authorization session expired or CSRF check failed');
  if(!authenticateStudent(req.body.username, req.body.password)) return error(res, 'Use the documented fictional student credentials', 401);
  attempts.delete(id);
  const code = random();
  codes.set(code, {...flow, subject: req.body.username, expires: expires()});
  const callback = new URL(CALLBACK); callback.searchParams.set('code', code); callback.searchParams.set('state', flow.state);
  res.redirect(callback.toString());
});

app.post('/oauth/token', asyncRoute(async(req, res) => {
  const b = req.body;
  if(b.client_id !== CLIENT || b.grant_type !== 'authorization_code' || b.redirect_uri !== CALLBACK) return error(res, 'Invalid client request');
  // Native apps are public OAuth clients. PKCE remains mandatory; no private
  // client key or secret is distributed to the app. The web profile retains
  // private_key_jwt authentication through Mimoto.
  if(!PUBLIC_CLIENT || b.client_assertion) {
    if(b.client_assertion_type !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer') return error(res, 'Invalid client assertion type');
    const {payload} = await jwtVerify(b.client_assertion, clientPublicKey, {
      algorithms: ['RS256'], audience: `${ISSUER}/oauth/token`, issuer: CLIENT, subject: CLIENT, clockTolerance: 5
    });
    if(!payload.jti || !payload.iat || !payload.exp || payload.exp - payload.iat > 600 || Math.abs(Date.now() / 1000 - payload.iat) > 300 || assertions.has(payload.jti)) return error(res, 'Invalid or reused client assertion', 401);
    assertions.set(payload.jti, {expires: expires()});
  }
  const code = codes.get(b.code);
  codes.delete(b.code);
  if(!code || code.expires < Date.now() || !/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier || '') || sha256(b.code_verifier) !== code.challenge) return error(res, 'Authorization code or PKCE verifier is invalid');
  const token = random(); tokens.set(token, {subject: code.subject, expires: expires()});
  res.json({access_token: token, token_type: 'Bearer', expires_in: 300, scope: SCOPE});
}));
app.post('/nonce', (req, res) => {const value = random(); nonces.set(value, {expires: expires()}); res.json({c_nonce: value});});
app.post('/credential', asyncRoute(async(req, res) => {
  const token = tokens.get(req.headers.authorization?.replace(/^Bearer /, ''));
  if(!token || token.expires < Date.now()) return error(res, 'A valid access token is required', 401);
  if(req.body.credential_configuration_id !== configurationId || req.body.proofs?.jwt?.length !== 1) return error(res, 'Request one StudentIDCredential and one holder proof');
  const jwt = req.body.proofs.jwt[0];
  const header = decodeProtectedHeader(jwt);
  if(header.typ !== 'openid4vci-proof+jwt' || !['Ed25519', 'EdDSA'].includes(header.alg) || header.jwk?.d || header.jwk?.crv !== 'Ed25519') return error(res, 'A public Ed25519 holder proof is required');
  const {payload} = await jwtVerify(jwt, await importJWK(header.jwk, header.alg), {algorithms: [header.alg], audience: ISSUER, issuer: CLIENT, clockTolerance: 5});
  const nonce = nonces.get(payload.nonce);
  if(!nonce || nonce.expires < Date.now() || !payload.iat || Math.abs(Date.now() / 1000 - payload.iat) > 300) return error(res, 'Credential proof nonce is missing, expired, or already used');
  nonces.delete(payload.nonce);
  const holder = 'did:jwk:' + Buffer.from(JSON.stringify(header.jwk)).toString('base64url');
  const subject = studentRecord(token.subject);
  const credential = await issueStudentCredential({key, holder, subject});
  res.json({credentials: [{credential}]});
}));
app.use((err, req, res, next) => {console.error('University issuer request rejected:', err.message); error(res, 'Request validation or credential signing failed', 400);});
app.listen(3006, '0.0.0.0', () => console.log('Demo university registrar: http://localhost:3006'));
https.createServer({key: await fs.readFile('/tls/university.key'), cert: await fs.readFile('/tls/university.pem'), minVersion: 'TLSv1.2'}, app)
  .listen(443, '0.0.0.0', () => console.log('University issuer protocol endpoints ready'));
