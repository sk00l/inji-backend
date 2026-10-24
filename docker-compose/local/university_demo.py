"""Seed/check the fictional university student ID using actual Mimoto APIs."""
import base64
import hashlib
import re
import secrets
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode
import requests
from local_wallet import BASE, checked, ensure_account, login, wallet, csrf

CALLBACK = "http://localhost:3004/redirect"

def authorize_student(username="student", password="student-local-password"):
    session = requests.Session()
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    state = secrets.token_urlsafe(24)
    page = checked(session.get("http://localhost:3006/authorize", params={
        "client_id": "university-wallet", "redirect_uri": CALLBACK, "response_type": "code",
        "scope": "university_student_id", "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
    }, timeout=20))
    token = re.search(r'name="csrf" value="([^"]+)"', page.text).group(1)
    result = checked(session.post("http://localhost:3006/authorize", data={
        "username": username, "password": password, "csrf": token}, allow_redirects=False, timeout=20), 302)
    callback = result.headers["Location"]
    assert callback.startswith(CALLBACK + "?")
    params = parse_qs(urlparse(callback).query)
    assert params["state"] == [state]
    return params["code"][0], verifier

def seed_student():
    ensure_account("student", "student-local-password", "Aarav", "Sharma")
    session = login("student", "student-local-password")
    wallet_id = wallet(session, "University Student Wallet", "123456")
    cards = checked(session.get(BASE + f"/wallets/{wallet_id}/credentials", timeout=20)).json()
    card = next((c for c in cards if c.get("issuerDisplayName") == "Himalaya University (Demo)"), None)
    if not card:
        code, verifier = authorize_student()
        card = checked(session.post(BASE + f"/wallets/{wallet_id}/credentials", headers=csrf(session), json={
            "issuer": "University", "credentialConfigurationId": "StudentIDCredential", "code": code,
            "grantType": "authorization_code", "redirectUri": CALLBACK, "codeVerifier": verifier}, timeout=90)).json()
        print("Student ID issued locally, verified by Mimoto, and stored encrypted")
    else:
        print("Existing university student card preserved; no duplicate created")
    preview = checked(session.get(BASE + f"/wallets/{wallet_id}/credentials/{card['credentialId']}",
        headers={"Accept": "application/pdf"}, params={"action": "inline"}, timeout=90))
    assert preview.content.startswith(b"%PDF"), "Student ID preview was not a PDF"
    output = Path(__file__).resolve().parents[1] / "local-output" / "university-student-id.pdf"
    output.parent.mkdir(exist_ok=True); output.write_bytes(preview.content)
    print("Student ID PDF preview passed:", output)
    return session, wallet_id, card

def present_student(session, wallet_id, decline=False):
    request = checked(requests.get("http://localhost:3000/university/request", timeout=20)).json()
    auth_url = "openid4vp://authorize?" + urlencode(request["inputData"])
    response = checked(session.post(BASE + f"/wallets/{wallet_id}/presentations", headers=csrf(session),
        json={"authorizationRequestUrl": auth_url}, timeout=30)).json()
    pid = response["presentationId"]
    if decline:
        body = {"errorCode": "access_denied", "errorMessage": "Student declined sharing"}
    else:
        matches = checked(session.get(BASE + f"/wallets/{wallet_id}/presentations/{pid}/credentials", timeout=30)).json()
        assert matches["availableCredentials"], "The university card did not match the library request"
        body = {"selectedCredentials": [matches["availableCredentials"][0]["credentialId"]]}
    checked(session.patch(BASE + f"/wallets/{wallet_id}/presentations/{pid}", headers=csrf(session), json=body, timeout=45))
    result = checked(requests.get("http://localhost:3000/university/results/" + request["state"], timeout=20)).json()
    if decline:
        assert result["decision"] == "SHARING_DECLINED" and not result["approved"], result
        print("Declining consent correctly grants no library access")
    else:
        assert result.get("approved") is True, result
        assert all(result["checks"].values()), result
        print("Library access approved after actual VP signature, VC signature, issuer, holder-binding, validity, and enrollment checks")
    # An already completed request cannot be submitted a second time.
    replay = requests.post("http://localhost:3000/university/presentations", data={"state": request["state"]}, timeout=20)
    assert replay.status_code == 400, "Completed presentation request was reusable"
    print("Completed-request replay rejected")
    return result

if __name__ == "__main__":
    session, wallet_id, card = seed_student()
    present_student(session, wallet_id)
    present_student(session, wallet_id, decline=True)
    checked(session.post(BASE + "/logout", headers=csrf(session), timeout=20))
    print("University demo ready: wallet localhost:3004; registrar localhost:3006; library localhost:3000")
    print("Local demo account: student / student-local-password; wallet PIN: 123456")
