"""Generate an isolated, repeatable LAN HTTPS configuration; no existing data reset."""
import argparse
import ipaddress
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('host', help='Stable Mac LAN IPv4 address reachable from Docker and emulator')
parser.add_argument('--port', type=int, default=8443)
args = parser.parse_args()
address = ipaddress.IPv4Address(args.host)
if address.is_loopback or address.is_unspecified or address.is_multicast:
    parser.error('Use a reachable Mac LAN IPv4 address, not localhost/127.0.0.1/0.0.0.0')
if not 1024 <= args.port <= 65535:
    parser.error('Choose a port between 1024 and 65535')
stack = Path(__file__).resolve().parents[1]
runtime = stack / 'mobile-runtime'
origin = f'https://{address}:{args.port}'
settings = {'origin': origin, 'host': str(address), 'port': args.port}
settings_file = runtime / 'settings.json'
if settings_file.exists() and json.loads(settings_file.read_text()) != settings:
    parser.error('Mobile origin is already configured. Preserve it: issuer DID and existing cards depend on it. See MAC_MOBILE_HANDOFF.md for changing networks.')
runtime.mkdir(exist_ok=True)
server = runtime / 'server'; server.mkdir(exist_ok=True)
for source in (stack / 'config').iterdir():
    if source.is_file():
        shutil.copyfile(source, server / source.name)
shutil.copyfile(stack / 'university/student-card-template.html', server / 'UniversityMobile-StudentIDCredential-template.html')
issuer = origin + '/issuer'
logo = issuer + '/static/seal.svg'
issuers = {'issuers': [{
    'issuer_id': 'UniversityMobile', 'display': [{'name': 'Himalaya University (Demo)',
      'title': 'University Student ID', 'description': 'Fictional college student ID', 'language': 'en',
      'logo': {'url': logo, 'alt_text': 'University demo seal'}}],
    'protocol': 'OpenId4VCI', 'client_id': 'university-mobile', 'client_alias': 'university-wallet-client',
    'redirect_uri': 'io.mosip.residentapp.inji://oauthredirect', 'enabled': 'true',
    'token_endpoint': origin + '/v1/mimoto/get-token/UniversityMobile',
    'qr_code_type': 'EmbeddedVC', 'credential_issuer': 'Himalaya University (Demo)',
    'credential_issuer_host': issuer, 'wellknown_endpoint': issuer + '/.well-known/openid-credential-issuer',
    'authorization_audience': issuer + '/oauth/token', 'proxy_token_endpoint': issuer + '/oauth/token'
}]}
verifiers = {'verifiers': [{'client_id': 'university-library', 'redirect_uris': [origin + '/'],
    'response_uris': [origin + '/university/presentations'],
    'jwks_uri': origin + '/.well-known/jwks.json', 'allow_unsigned_request': False}]}
for name, data in [('mimoto-issuers-config.json', issuers), ('mimoto-trusted-verifiers.json', verifiers)]:
    (server / name).write_text(json.dumps(data, indent=2) + '\n')
auth = (stack / 'local/local-auth.properties').read_text().replace('final-issuers=Mock,University', 'final-issuers=UniversityMobile')
auth += f'\nmosip.api.public.url={origin}\nmosip.inji.openid4vpClientValidation=true\n'
(runtime / 'local-auth.properties').write_text(auth)
(runtime / 'mobile.env').write_text(f'INJI_PUBLIC_ORIGIN={origin}\nINJI_GATEWAY_PORT={args.port}\n')
(runtime / 'wallet.env.example').write_text(f'MIMOTO_HOST={origin}\nCREDENTIAL_REGISTRY_EDIT=true\n')
(runtime / 'gateway.ext').write_text(f'subjectAltName=IP:{address}\nextendedKeyUsage=serverAuth\n')
(runtime / 'gateway.conf').write_text('''server {
  listen 443 ssl;
  ssl_certificate /tls/gateway.pem;
  ssl_certificate_key /tls/gateway.key;
  resolver 127.0.0.11 valid=10s ipv6=off;
  client_max_body_size 2m;
  location /issuer/ {
    set $upstream university-issuer:3006;
    rewrite ^/issuer/(.*)$ /$1 break;
    proxy_pass http://$upstream;
    proxy_set_header Host $host;
  }
  location /v1/mimoto/ {
    set $upstream mimoto-service:8099;
    proxy_pass http://$upstream;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
  location / {
    set $upstream demo-verifier:3000;
    proxy_pass http://$upstream;
    proxy_set_header Host $host;
  }
}
''')
settings_file.write_text(json.dumps(settings, indent=2) + '\n')
print(f'Mobile origin: {origin}; generated settings in {runtime}')
print('Existing desktop stack and its data are unchanged.')
