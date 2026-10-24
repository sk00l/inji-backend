"""Exercise the local signed-request / wallet-presentation flow with public demo data.

Requires the seeded tour wallet and Python requests. Does not add permanent
per-wallet trust; the user can still explore the trust prompt in the browser.
The official mock receiver acknowledges receipt without validating the VP.
"""
import html
import re
from urllib.parse import urlencode
import requests

BASE = "http://localhost:3004/v1/mimoto"
s = requests.Session()

def ok(response):
    assert response.status_code == 200, f"HTTP {response.status_code}: {response.text[:600]}"
    return response.json()

page = s.get(BASE + "/oauth2/authorize/local", timeout=20)
form = re.search(r'<form[^>]*action="([^"]+)"', page.text)
assert form, "Login form not found"
login = s.post(html.unescape(form.group(1)), data={
    "username": "tour", "password": "tour-local-password", "credentialId": "",
}, cookies=s.cookies.get_dict(), allow_redirects=False, timeout=30)
callback = login.headers.get("Location", "")
assert callback.startswith(BASE + "/oauth2/callback/local?")
result = s.get(callback, allow_redirects=False, timeout=30)
assert result.headers.get("Location") == "http://localhost:3004/user/passcode"

def csrf():
    return {"X-XSRF-TOKEN": s.cookies.get_dict()["XSRF-TOKEN"]}

wallets = ok(s.get(BASE + "/wallets", timeout=20))
wallet = next(w for w in wallets if w["walletName"] == "Feature Tour")
wallet_id = wallet["walletId"]
ok(s.post(BASE + f"/wallets/{wallet_id}/unlock", headers=csrf(), json={"walletPin": "123456"}, timeout=30))
request = ok(requests.get("http://localhost:3000/verifier/pre-registered/by_reference?draft=draft-21", timeout=20))
auth_url = "openid4vp://authorize?" + urlencode(request["inputData"])
created = ok(s.post(BASE + f"/wallets/{wallet_id}/presentations", headers=csrf(),
                    json={"authorizationRequestUrl": auth_url}, timeout=30))
presentation_id = created["presentationId"]
print("Signed verifier authorization request accepted")
matching = ok(s.get(BASE + f"/wallets/{wallet_id}/presentations/{presentation_id}/credentials", timeout=30))
assert matching["availableCredentials"], "No matching tour credential"
credential_id = matching["availableCredentials"][0]["credentialId"]
print("Stored sandbox credential matched the presentation request")
response = s.patch(BASE + f"/wallets/{wallet_id}/presentations/{presentation_id}",
                   headers=csrf(), json={"selectedCredentials": [credential_id]}, timeout=45)
ok(response)
received = ok(requests.get("http://localhost:3000/verifier/vp-result", timeout=20))
assert received and received.get("vp_token"), "Mock receiver did not receive the signed presentation"
print("Signed wallet presentation delivered to the local mock receiver")
s.post(BASE + "/logout", headers=csrf(), timeout=20).raise_for_status()
print("Local OpenID4VP delivery check passed (mock receiver does not validate the presentation)")
