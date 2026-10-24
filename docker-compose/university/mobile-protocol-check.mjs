// Exercise the mobile HTTP protocol with a synthetic wallet key. This does not
// install/drive an emulator or add cards to a real wallet.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {generateKeyPair, exportJWK, importJWK, SignJWT, jwtVerify} from 'jose';
import jsonld from 'jsonld';
import {ISSUER, documentLoader} from './credentials.mjs';

const origin = new URL(ISSUER).origin;
const callback = 'io.mosip.residentapp.inji://oauthredirect';
const client = 'university-mobile';
async function json(url, options) {
  const r = await fetch(url, options);
  assert.equal(r.status, 200, `${new URL(url).pathname}: HTTP ${r.status}`);
  return r.json();
}
const form = data => ({method: 'POST', body: new URLSearchParams(data), redirect: 'manual'});
async function authorize() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const state = crypto.randomBytes(24).toString('base64url');
  const query = new URLSearchParams({client_id: client, redirect_uri: callback, response_type: 'code',
    scope: 'university_student_id', state, code_challenge_method: 'S256',
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url')});
  const page = await fetch(`${ISSUER}/authorize?${query}`);
  assert.equal(page.status, 200);
  const cookie = page.headers.getSetCookie()[0].split(';')[0];
  const csrf = (await page.text()).match(/name="csrf" value="([^"]+)"/)[1];
  const opts = form({username: 'nisha', password: 'nisha-local-password', csrf});
  opts.headers = {Cookie: cookie};
  const result = await fetch(`${ISSUER}/authorize`, opts);
  assert.equal(result.status, 302);
  const redirect = new URL(result.headers.get('location'));
  assert.equal(redirect.searchParams.get('state'), state);
  assert.ok(redirect.toString().startsWith(callback));
  return {code: redirect.searchParams.get('code'), verifier};
}
const bad = await authorize();
const invalid = await fetch(`${ISSUER}/oauth/token`, form({client_id: client, redirect_uri: callback,
  grant_type: 'authorization_code', code: bad.code, code_verifier: crypto.randomBytes(48).toString('base64url')}));
assert.equal(invalid.status, 400);
console.log('Native callback and PKCE enforcement passed.');
const auth = await authorize();
// A public native client can exchange directly without a client secret.
const token = await json(`${ISSUER}/oauth/token`, form({client_id: client, redirect_uri: callback,
  grant_type: 'authorization_code', code: auth.code, code_verifier: auth.verifier}));
// Also exercise the existing Mimoto proxy used by trusted-issuer app revisions.
const proxyAuth = await authorize();
const proxyToken = await json(`${origin}/v1/mimoto/get-token/UniversityMobile`, form({client_id: client,
  redirect_uri: callback, grant_type: 'authorization_code', code: proxyAuth.code, code_verifier: proxyAuth.verifier}));
assert.ok(proxyToken.access_token);
console.log('Direct public-client exchange and Mimoto registered-client token proxy passed.');
const {privateKey, publicKey} = await generateKeyPair('EdDSA', {extractable: true});
const jwk = await exportJWK(publicKey);
const holder = 'did:jwk:' + Buffer.from(JSON.stringify(jwk)).toString('base64url');
const nonce = await json(`${ISSUER}/nonce`, {method: 'POST'});
const proof = await new SignJWT({nonce: nonce.c_nonce}).setProtectedHeader({typ: 'openid4vci-proof+jwt', alg: 'EdDSA', jwk})
  .setIssuer(client).setAudience(ISSUER).setIssuedAt().setExpirationTime('5m').sign(privateKey);
const issued = await json(`${ISSUER}/credential`, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token.access_token}`},
  body: JSON.stringify({credential_configuration_id: 'StudentIDCredential', proofs: {jwt: [proof]}})});
const credential = issued.credentials[0].credential;
assert.equal(credential.credentialSubject.fullName, 'Nisha Gurung');
assert.equal(credential.credentialSubject.studentId, 'HU-2026-0002');
const usedNonce = await fetch(`${ISSUER}/credential`, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token.access_token}`},
  body: JSON.stringify({credential_configuration_id: 'StudentIDCredential', proofs: {jwt: [proof]}})});
assert.equal(usedNonce.status, 400);
console.log('Holder-bound student issuance and nonce replay rejection passed.');
const loader = documentLoader();
const hash = data => crypto.createHash('sha256').update(data).digest();
const canonize = doc => jsonld.canonize(doc, {algorithm: 'URDNA2015', format: 'application/n-quads', documentLoader: loader, safe: true});
async function present(vc) {
  const request = await json(origin + '/university/request');
  const requestResponse = await fetch(request.inputData.request_uri, form({wallet_nonce: 'protocol-check'}));
  const signed = await requestResponse.text();
  const jwks = await json(origin + '/.well-known/jwks.json');
  const {payload} = await jwtVerify(signed, await importJWK(jwks.keys[0], 'EdDSA'), {algorithms: ['EdDSA']});
  assert.equal(payload.wallet_nonce, 'protocol-check');
  const presentation = {'@context': ['https://www.w3.org/2018/credentials/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
    type: ['VerifiablePresentation'], holder: holder + '#0', verifiableCredential: [vc]};
  const proof = {type: 'JsonWebSignature2020', created: new Date().toISOString(), verificationMethod: holder + '#0',
    proofPurpose: 'authentication', challenge: payload.nonce, domain: 'university-library'};
  const verifyData = Buffer.concat([hash(await canonize({'@context': presentation['@context'], ...proof})), hash(await canonize(presentation))]);
  const header = Buffer.from(JSON.stringify({alg: 'EdDSA', b64: false, crit: ['b64']})).toString('base64url');
  proof.jws = header + '..' + crypto.sign(null, Buffer.concat([Buffer.from(header + '.'), verifyData]), privateKey).toString('base64url');
  presentation.proof = proof;
  await json(origin + '/university/presentations', form({state: request.state, vp_token: JSON.stringify(presentation),
    presentation_submission: JSON.stringify({id: crypto.randomUUID(), definition_id: 'university-library-student-id', descriptor_map: [
      {id: 'student-id', format: 'ldp_vp', path: '$', path_nested: {id: 'student-id', format: 'ldp_vc', path: '$.verifiableCredential[0]'}}]})}));
  const replay = await fetch(origin + '/university/presentations', form({state: request.state}));
  assert.equal(replay.status, 400);
  return json(origin + '/university/results/' + request.state);
}
const valid = await present(credential);
assert.equal(valid.approved, true, JSON.stringify(valid));
const changed = structuredClone(credential); changed.credentialSubject.fullName = 'Altered Student';
const tampered = await present(changed);
assert.equal(tampered.approved, false);
assert.equal(tampered.decision, 'VERIFICATION_FAILED');
console.log('Signed request/JWKS, library approval, tampered credential rejection, and request replay rejection passed.');
console.log('Synthetic HTTP wallet test complete. Real Android/iOS app interoperability still requires emulator acceptance testing.');
