"""Check mobile-facing URLs with real CA verification; Python standard library only."""
import json
from pathlib import Path
import ssl
import time
from urllib.request import urlopen
from urllib.error import URLError

runtime = Path(__file__).resolve().parents[1] / 'mobile-runtime'
origin = json.loads((runtime / 'settings.json').read_text())['origin']
context = ssl.create_default_context(cafile=str(runtime / 'certs/verifier-ca.pem'))

def get(path, as_json=True):
    with urlopen(origin + path, context=context, timeout=10) as response:
        data = response.read()
        return json.loads(data) if as_json else data

for attempt in range(60):
    try:
        assert get('/v1/mimoto/actuator/health')['status'] == 'UP'
        break
    except (URLError, AssertionError, TimeoutError):
        if attempt == 59:
            raise
        time.sleep(2)
issuers = get('/v1/mimoto/issuers')['response']['issuers']
assert any(x['issuer_id'] == 'UniversityMobile' for x in issuers), issuers
assert get('/v1/mimoto/allProperties')['response']['openid4vpClientValidation'] == 'true'
assert get('/v1/mimoto/verifiers')['response']['verifiers'][0]['client_id'] == 'university-library'
metadata = get('/issuer/.well-known/openid-credential-issuer')
assert metadata['credential_issuer'] == origin + '/issuer'
assert 'StudentIDCredential' in metadata['credential_configurations_supported']
auth = get('/issuer/.well-known/oauth-authorization-server')
assert auth['authorization_endpoint'] == origin + '/issuer/authorize'
assert auth['token_endpoint_auth_methods_supported'] == ['none']
did = get('/issuer/did.json')
assert did['id'].startswith('did:web:') and did['assertionMethod']
assert get('/.well-known/jwks.json')['keys'][0].get('d') is None
request = get('/university/request')
assert request['mobileUrl'].startswith('openid4vp://authorize?')
assert '<svg' in get(request['qrUrl'], False).decode()
assert b'data-mobile="true"' in get('/', False)
print('CA-verified HTTPS, backend health/config, university metadata/DID, library JWKS and mobile request QR passed.')
print('MIMOTO_HOST=' + origin)
print('Library: ' + origin + '/')
print('These are HTTP checks, not an emulator/app end-to-end test.')
