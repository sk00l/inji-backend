"""HTTP helpers for the local demo accounts; never changes existing credentials."""
import html
import re
import requests

BASE = "http://localhost:3004/v1/mimoto"
KC = "http://localhost:8080"

def checked(response, *statuses):
    if response.status_code not in (statuses or (200,)):
        raise RuntimeError(f"{response.request.method} {response.request.path_url.split('?')[0]}: {response.status_code}: {response.text[:500]}")
    return response

def ensure_account(username, password, first_name, last_name):
    token = checked(requests.post(KC + "/realms/master/protocol/openid-connect/token", data={
        "grant_type": "password", "client_id": "admin-cli", "username": "admin", "password": "local-admin-password",
    }, timeout=20)).json()["access_token"]
    headers = {"Authorization": "Bearer " + token}
    url = KC + "/admin/realms/inji-local/users"
    users = checked(requests.get(url, headers=headers, params={"username": username, "exact": "true"}, timeout=20)).json()
    if not users:
        checked(requests.post(url, headers=headers, json={"username": username, "enabled": True,
            "email": username + "@example.test", "emailVerified": True, "firstName": first_name, "lastName": last_name,
            "requiredActions": [], "credentials": [{"type": "password", "value": password, "temporary": False}]}, timeout=20), 201)

def login(username, password):
    session = requests.Session()
    page = checked(session.get(BASE + "/oauth2/authorize/local", timeout=20))
    form = re.search(r'<form[^>]*action="([^"]+)"', page.text)
    assert form, "Local OAuth login form is unavailable"
    result = checked(session.post(html.unescape(form.group(1)), data={"username": username, "password": password, "credentialId": ""},
        cookies=session.cookies.get_dict(), allow_redirects=False, timeout=30), 302)
    callback = result.headers["Location"]
    assert callback.startswith(BASE + "/oauth2/callback/local?"), "Local login failed; existing credentials were not changed"
    result = checked(session.get(callback, allow_redirects=False, timeout=30), 302)
    assert result.headers.get("Location") == "http://localhost:3004/user/passcode", "Local OAuth callback failed"
    return session

def csrf(session):
    return {"X-XSRF-TOKEN": session.cookies.get_dict()["XSRF-TOKEN"]}

def wallet(session, name, pin):
    wallets = checked(session.get(BASE + "/wallets", timeout=20)).json()
    found = next((w for w in wallets if w["walletName"] == name), None)
    if not found:
        assert not wallets, "Demo account already has another wallet; no wallet was changed"
        found = checked(session.post(BASE + "/wallets", headers=csrf(session), json={
            "walletName": name, "walletPin": pin, "confirmWalletPin": pin}, timeout=30)).json()
    checked(session.post(BASE + f"/wallets/{found['walletId']}/unlock", headers=csrf(session), json={"walletPin": pin}, timeout=30))
    return found["walletId"]
