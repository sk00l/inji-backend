"""Create a separate local tour account and add one genuine sandbox credential.

Only uses published sandbox test identity data. Existing user wallets are untouched.
Requires Python requests. Uses the local development Keycloak admin credentials.
"""
import html
import re
import requests
from sandbox_issuer import authorize_mock, CALLBACK

BASE = "http://localhost:3004/v1/mimoto"
KC = "http://localhost:8080"
USERNAME = "tour"
PASSWORD = "tour-local-password"
PIN = "123456"
WALLET_NAME = "Feature Tour"

admin = requests.post(KC + "/realms/master/protocol/openid-connect/token", data={
    "grant_type": "password", "client_id": "admin-cli", "username": "admin",
    "password": "local-admin-password",
}, timeout=20)
admin.raise_for_status()
headers = {"Authorization": "Bearer " + admin.json()["access_token"]}
users_url = KC + "/admin/realms/inji-local/users"
users = requests.get(users_url, headers=headers, params={"username": USERNAME, "exact": "true"}, timeout=20)
users.raise_for_status()
if not users.json():
    response = requests.post(users_url, headers=headers, json={
        "username": USERNAME, "enabled": True, "email": "tour@example.test", "emailVerified": True,
        "firstName": "Feature", "lastName": "Tour", "requiredActions": [],
        "credentials": [{"type": "password", "value": PASSWORD, "temporary": False}],
    }, timeout=20)
    response.raise_for_status()
    print("Created local tour account")

session = requests.Session()
page = session.get(BASE + "/oauth2/authorize/local", timeout=20)
page.raise_for_status()
form = re.search(r'<form[^>]*action="([^"]+)"', page.text)
assert form, "No local login form"
login = session.post(html.unescape(form.group(1)), data={
    "username": USERNAME, "password": PASSWORD, "credentialId": "",
}, cookies=session.cookies.get_dict(), allow_redirects=False, timeout=30)
callback = login.headers.get("Location", "")
assert callback.startswith(BASE + "/oauth2/callback/local?"), "Local login failed; no existing credentials were changed"
result = session.get(callback, allow_redirects=False, timeout=30)
assert result.headers.get("Location") == "http://localhost:3004/user/passcode", "OAuth callback failed"

def csrf():
    return {"X-XSRF-TOKEN": session.cookies.get_dict()["XSRF-TOKEN"]}

response = session.get(BASE + "/wallets", timeout=20)
response.raise_for_status()
wallets = response.json()
wallet = next((w for w in wallets if w["walletName"] == WALLET_NAME), None)
if wallet is None:
    assert not wallets, "Tour account already has another wallet; no wallet was changed"
    response = session.post(BASE + "/wallets", headers=csrf(), json={
        "walletName": WALLET_NAME, "walletPin": PIN, "confirmWalletPin": PIN,
    }, timeout=30)
    response.raise_for_status()
    wallet = response.json()
    print("Created separate Feature Tour wallet")
wallet_id = wallet["walletId"]
response = session.post(BASE + f"/wallets/{wallet_id}/unlock", headers=csrf(), json={"walletPin": PIN}, timeout=30)
response.raise_for_status()
credentials = session.get(BASE + f"/wallets/{wallet_id}/credentials", timeout=20)
credentials.raise_for_status()
if not credentials.json():
    code, verifier = authorize_mock()
    response = session.post(BASE + f"/wallets/{wallet_id}/credentials", headers=csrf(), json={
        "issuer": "Mock", "credentialConfigurationId": "MockVerifiableCredential",
        "code": code, "grantType": "authorization_code", "redirectUri": CALLBACK,
        "codeVerifier": verifier,
    }, timeout=90)
    if response.status_code != 200:
        raise RuntimeError(f"Credential issuance failed: {response.status_code}: {response.text[:500]}")
    print("Sandbox credential issued, signature verified, and stored encrypted in the tour wallet")
else:
    print("Tour wallet already contains credentials; did not add duplicates")
response = session.get(BASE + f"/wallets/{wallet_id}/credentials", timeout=20)
response.raise_for_status()
print("Stored credential listing passed")
stored_credentials = response.json()
assert stored_credentials, "Tour wallet has no credential after issuance"
preview = session.get(BASE + f"/wallets/{wallet_id}/credentials/{stored_credentials[0]['credentialId']}",
                      headers={"Accept": "application/pdf"}, params={"action": "inline"}, timeout=90)
if preview.status_code != 200 or not preview.content.startswith(b"%PDF"):
    raise RuntimeError(f"Stored credential preview failed: {preview.status_code}: {preview.text[:500]}")
print("Stored credential decryption and PDF preview passed")
session.post(BASE + "/logout", headers=csrf(), timeout=20).raise_for_status()
print("Open http://localhost:3004 — local account: tour / tour-local-password; wallet PIN: 123456")
