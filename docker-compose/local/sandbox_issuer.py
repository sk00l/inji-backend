"""Public Collab sandbox authorization helper; uses published mock data only."""
import base64
import datetime
import hashlib
import json
import secrets
import requests

HOST = "https://esignet-mock.collab.mosip.net/v1/esignet"
CALLBACK = "http://localhost:3004/redirect"

def authorize_mock(scope="mock_identity_vc_ldp"):
    session = requests.Session()
    verifier = secrets.token_urlsafe(48)
    def b64(value):
        return base64.urlsafe_b64encode(value).decode().rstrip("=")
    def post(path, body, headers=None):
        response = session.post(HOST + path, headers={
            "X-XSRF-TOKEN": session.cookies.get_dict().get("XSRF-TOKEN", ""),
            **(headers or {}),
        }, json={
            "requestTime": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "request": body,
        }, timeout=30)
        response.raise_for_status()
        data = response.json()
        if data.get("errors") or not data.get("response"):
            raise RuntimeError(f"Sandbox {path}: {data.get('errors')}")
        return data["response"]

    session.get(HOST + "/csrf/token", timeout=20).raise_for_status()
    details = post("/authorization/v2/oauth-details", {
        "clientId": "wallet-demo", "scope": scope, "responseType": "code",
        "redirectUri": CALLBACK, "display": "page", "prompt": "login",
        "acrValues": "mosip:idp:acr:generated-code", "nonce": secrets.token_urlsafe(16),
        "state": secrets.token_urlsafe(16), "claimsLocales": "en",
        "codeChallenge": b64(hashlib.sha256(verifier.encode()).digest()), "codeChallengeMethod": "S256",
    })
    headers = {
        "oauth-details-key": details["transactionId"],
        "oauth-details-hash": b64(hashlib.sha256(json.dumps(details, separators=(",", ":"), ensure_ascii=False).encode()).digest()),
    }
    post("/authorization/send-otp", {
        "transactionId": details["transactionId"], "individualId": "2154189532",
        "otpChannels": ["email", "phone"], "captchaToken": "dummy",
    }, headers)
    post("/authorization/v3/authenticate", {
        "transactionId": details["transactionId"], "individualId": "2154189532",
        "challengeList": [{"authFactorType": "OTP", "challenge": "111111", "format": "alpha-numeric"}],
    }, headers)
    authorization = post("/authorization/auth-code", {
        "transactionId": details["transactionId"], "acceptedClaims": [], "permittedAuthorizeScopes": [],
    }, headers)
    return authorization["code"], verifier

if __name__ == "__main__":
    from pathlib import Path
    code, verifier = authorize_mock()
    response = requests.post("http://localhost:3004/v1/mimoto/credentials/download", data={
        "issuer": "Mock", "credential": "MockVerifiableCredential", "code": code,
        "grant_type": "authorization_code", "redirect_uri": CALLBACK,
        "code_verifier": verifier, "locale": "en", "vcStorageExpiryLimitInTimes": "1",
    }, timeout=90)
    if response.status_code != 200 or not response.content.startswith(b"%PDF"):
        raise RuntimeError(f"Credential PDF download: {response.status_code}: {response.text[:500]}")
    output = Path(__file__).resolve().parents[1] / "local-output" / "mock-identity.pdf"
    output.parent.mkdir(exist_ok=True)
    output.write_bytes(response.content)
    print(f"Sandbox authentication, client-key token exchange, credential verification and PDF download passed: {output}")
