"""Integration check for the local demo account. Requires Python requests.

Creates a uniquely named temporary wallet and removes only that wallet afterward.
Never prints session cookies, access tokens, wallet keys, or the temporary PIN.
"""
import html
import re
import secrets
import requests

BASE = "http://localhost:3004/v1/mimoto"
session = requests.Session()

def expect(response, status=200):
    assert response.status_code == status, (
        f"{response.request.method} {response.request.path_url.split('?')[0]}: "
        f"expected {status}, received {response.status_code}: {response.text[:300]}"
    )
    return response

def csrf_headers():
    return {"X-XSRF-TOKEN": session.cookies.get_dict()["XSRF-TOKEN"]}

anonymous = requests.get(BASE + "/users/me", timeout=20)
assert anonymous.status_code in (401, 403), "Protected endpoint allowed anonymous access"
print("Anonymous profile access rejected")

page = expect(session.get(BASE + "/oauth2/authorize/local", timeout=20))
form = re.search(r'<form[^>]*action="([^"]+)"', page.text)
assert form, "Local login form was not returned"
login = expect(session.post(
    html.unescape(form.group(1)),
    data={"username": "demo", "password": "demo-local-password", "credentialId": ""},
    # Keycloak marks localhost cookies Secure; browsers accept this on localhost,
    # while requests requires explicit forwarding for this HTTP integration test.
    cookies=session.cookies.get_dict(), allow_redirects=False, timeout=30,
), 302)
callback = login.headers["Location"]
assert callback.startswith(BASE + "/oauth2/callback/local?"), "Unexpected callback destination"
result = expect(session.get(callback, allow_redirects=False, timeout=30), 302)
assert result.headers["Location"] == "http://localhost:3004/user/passcode"
expect(session.get(BASE + "/users/me", timeout=20))
print("Local OAuth login and authenticated profile passed")

wallet_id = None
try:
    pin = f"{secrets.randbelow(1000000):06d}"
    created = expect(session.post(BASE + "/wallets", json={
        "walletName": "Smoke Test " + secrets.token_hex(4),
        "walletPin": pin,
        "confirmWalletPin": pin,
    }, headers=csrf_headers(), timeout=30)).json()
    wallet_id = created["walletId"]
    wallets = expect(session.get(BASE + "/wallets", timeout=20)).json()
    assert any(w["walletId"] == wallet_id for w in wallets)
    expect(session.post(BASE + f"/wallets/{wallet_id}/unlock",
                        json={"walletPin": pin}, headers=csrf_headers(), timeout=30))
    credentials = expect(session.get(BASE + f"/wallets/{wallet_id}/credentials", timeout=20))
    print("Wallet creation, listing, unlocking, and empty credential listing passed")
finally:
    if wallet_id:
        expect(session.delete(BASE + f"/wallets/{wallet_id}",
                              headers=csrf_headers(), timeout=20))
        print("Temporary test wallet removed")

issuers = expect(session.get(BASE + "/v2/issuers", timeout=30)).json()
expect(session.get(BASE + "/issuers/Mock/well-known-proxy", timeout=30))
print("Issuer listing and discovery passed")
expect(session.post(BASE + "/logout", headers=csrf_headers(), timeout=20))
print("Logout passed; all local integration checks passed")
