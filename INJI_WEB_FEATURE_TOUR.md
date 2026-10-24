# Inji Web: feature tour and issuer requirements

For the ready-made student ID and campus-library scenario, see
[UNIVERSITY_DEMO.md](UNIVERSITY_DEMO.md). The portal at http://localhost:3000 now
opens that university demo, with actual signature and enrollment checks. The
original identity-tour receiver remains available through its legacy API routes.

Inji Web is a browser wallet for digitally signed documents called verifiable
credentials (VCs). Examples include an identity card, insurance certificate, or
education certificate. An issuer creates and signs the credential, your wallet
holds it, and a verifier checks it when you present it.

## Your local environment

- Wallet: **http://localhost:3004**
- Select **Continue with local account**.
- Username: `demo`
- Password: `demo-local-password`
- Choose your own six-digit wallet PIN.
- **Continue as Guest** is also available.

### Ready-made wallet with a credential

For a populated wallet, sign in as **`tour` / `tour-local-password`** and unlock
with PIN **`123456`**. Its separate **Feature Tour** wallet contains a verified
sandbox identity credential. Your existing `demo` wallet was not changed.

You can also open the generated guest PDF at
[`docker-compose/local-output/mock-identity.pdf`](docker-compose/local-output/mock-identity.pdf).

Your wallet, backend, database, object storage, login provider, and mock presentation
receiver run in Docker.
The configured Mock credential issuer and eSignet authorization server are hosted
in the public Inji Collab sandbox. This is a local wallet with a hosted demo issuer,
not an offline installation of every Inji component.

## What you can explore in this web version

| Feature | Where to try it | What it requires |
| --- | --- | --- |
| Local account login | Continue with local account | Local Keycloak; configured |
| Guest access | Continue as Guest | No wallet account |
| Wallet creation and unlocking | Passcode page after login | A six-digit PIN |
| Profile information | Profile menu | Local login; name and email come from Keycloak |
| Issuer browsing and search | Home / issuer list | Issuer configuration; configured |
| Credential type browsing | Select Mock Identity | Issuer discovery; configured |
| Credential issuance | Choose a credential type and authenticate with its issuer | Registered issuer client key, issuer authentication, and compatible issuance protocol |
| Store credentials | Download while logged in | Successful issuance; stored encrypted through Mimoto and PostgreSQL |
| View and search stored cards | Stored cards / My credentials | At least one downloaded credential |
| Download a credential PDF | Credential actions | A downloaded credential and a rendering template |
| Guest PDF download | Download a credential in guest mode | Issuer authentication; no persistent logged-in wallet |
| Delete a stored credential | Credential actions | An unlocked wallet containing that credential |
| PDF / QR presentation | Present the downloaded document to a verifier | A matching verifier and reachable credential resources where applicable |
| Interactive credential sharing | A verifier starts an OpenID4VP request | Compatible verifier, trusted-verifier configuration, and a matching stored credential |
| Verifier trust and consent | During an OpenID4VP request | Review the requester, approve or decline, and select credentials |
| Language selection | Language control in the UI | Translations included in the frontend |
| Logout and return later | Profile/menu logout, then sign in again | The same account and your wallet PIN |
| Forgot-passcode reset | Forgot passcode flow | This implementation deletes the old wallet and its stored credentials; it is not recovery of the previous PIN |

The routes and controls above were checked against the cloned frontend source.
Some actions appear only after credentials exist or a verifier initiates a request.
An empty wallet does not expose the full credential journey.

Verified through the actual HTTP APIs: login, wallet creation/unlock, sandbox
identity issuance and signature verification, guest PDF generation, encrypted
credential storage/listing, signed verifier request validation, matching the
stored credential, signing a presentation, and delivering it to the local mock
receiver. The expanded university setup passed 206 focused Java tests and 10
university demo tests; see its guide for the additional library checks.
Visual browser interaction was not
automated because no browser automation surface was available.

## Suggested walkthrough

### 1. Explore the account and wallet

1. Open http://localhost:3004.
2. Select **Continue with local account**.
3. Sign in using `demo` / `demo-local-password`.
4. Create a wallet with your own PIN, or unlock your existing wallet.
5. Open the issuer list, stored cards page, profile, and language menu.

### 2. Request a demo identity credential

1. Select **Mock Identity**.
2. Select the **Mock Verifiable Credential** corresponding to W3C VC Data Model 1.1
   for the first test. Other advertised formats have separate compatibility needs.
3. Follow the issuer authentication page.
4. Use the published sandbox identity `2154189532`.
5. Request the demo OTP and use `111111`.
6. Complete consent if prompted and return to the local wallet.

These are public sandbox test values, not your local Keycloak username or PIN.
They are documented in the official
[demo issuer setup](https://docs.inji.io/inji-wallet/inji-mobile/technical-overview/customization-overview/credential_providers)
and [mock data guide](https://docs.inji.io/readme/try-it-out/using-mock-data).
The sandbox may change or be unavailable.

### 3. Explore stored credentials

After issuance succeeds:

1. Open the stored cards page and search for the downloaded credential.
2. View its details and download the PDF from its available actions.
3. Log out, sign back in, and unlock using the same PIN to check persistence.
4. Try deleting a test credential when you no longer need it.

### 4. Compare guest mode

Log out, select **Continue as Guest**, and repeat the issuer flow. Guest mode is
useful for getting a PDF without retaining a credential in an authenticated web
wallet. You still authenticate with the issuer to obtain the document.

### 5. Explore verification and interactive sharing

Downloading a credential and verifying/presenting it are different flows.

- PDF/QR verification needs a verifier that supports the document's credential
  format and can reach the resources referenced by its QR code.
- Interactive OpenID4VP sharing begins at a compatible verifier. It opens the
  wallet, identifies the requester, requests matching credentials, asks for
  consent, and receives a signed presentation.
- A local wallet URL must be included in the verifier's wallet configuration.
  The verifier's identity, response URI, and signing key must match Mimoto's
  trusted-verifier configuration.
- **http://localhost:3000** now hosts the university library demonstration. Use
  the separate student wallet and **Present my student ID**, following
  [UNIVERSITY_DEMO.md](UNIVERSITY_DEMO.md). It checks both signatures, wallet
  ownership, validity, and enrollment before displaying approval. You can also
  decline sharing.
- The original identity-tour delivery check remains available through
  `python3 docker-compose/local/presentation-check.py`. Its legacy mock routes
  acknowledge receipt only; they do not produce a library access decision.
  Both flows use signed requests validated against configured public keys.
- Backend request, JWKS, and presentation URLs use HTTPS inside Docker. A local
  CA is trusted only by Mimoto's development JVM; host/browser trust settings are
  unchanged. The receiver page and its completion page use HTTP on localhost.
- Existing DataShare URLs use Docker-internal service names. Those references
  need a reachable public/local URL arrangement before testing PDF online-sharing
  QR codes with a verifier outside the Docker network.

For this wallet version, focus on JSON-LD credentials for OpenID4VP presentation.
Do not assume every advertised issuance format supports presentation or selective
disclosure. See the official
[OpenID4VP feature guide](https://docs.inji.io/inji-wallet/inji-web/overview/features/verifiable-credential-presentation-openid4vp),
whose examples and limitations are version-specific.

To repeat the protocol checks from the repository root (Python `requests` is
required):

```bash
# Get and verify a sandbox credential, then generate a guest PDF.
python3 docker-compose/local/sandbox_issuer.py

# Populate the separate tour wallet if it is empty; do not add duplicates.
python3 docker-compose/local/seed-tour-wallet.py

# Exercise signed verifier request, credential matching, and VP delivery.
python3 docker-compose/local/presentation-check.py
```

## What an issuer needs

For a real issuer, Mimoto needs:

1. **Issuer metadata**: the credential issuer URL, discovery document, supported
   credential configurations, credential endpoint, and nonce endpoint if used.
2. **An authorization server**: the service authenticating the credential holder
   and issuing the access token, such as eSignet in this sandbox.
3. **A registered client ID**: Mimoto must be an allowed client of that server.
4. **A client key pair**: its public key is registered with the authorization
   server; Mimoto keeps the matching private key in its PKCS12 keystore.
5. **A matching key alias**: `client_alias` identifies that private key inside
   `docker-compose/certs/oidckeystore.p12`.
6. **An allowed callback**: for this web wallet, `http://localhost:3004/redirect`.
   This is separate from the Keycloak login callback.
7. **Demo or real subject data**: the issuer needs a record for the individual
   requesting the credential.
8. **A compatible protocol and credential format**: discovery working alone does
   not prove issuance or verification will work.

You do not need the issuer's credential-signing private key. That stays with the
issuer. The wallet uses the issuer's public verification material to check the
credential. The client private key in Mimoto authenticates Mimoto to the issuer's
authorization server; it serves a different purpose.

### Public sandbox client

The official Inji documentation provides a public demo client:

| Setting | Value |
| --- | --- |
| Client ID | `wallet-demo` |
| Client key alias | `wallet-demo-client` |
| Credential issuer | `https://injicertify-mock.collab.mosip.net` |
| Authorization server | `https://esignet-mock.collab.mosip.net` |
| Local credential callback | `http://localhost:3004/redirect` |

Its published demo key was imported into your existing keystore. The existing
wallet encryption keys were preserved, and a backup was saved as
`docker-compose/certs/oidckeystore.before-sandbox-import.p12`.

Use this shared key only for the public sandbox. For a real deployment, generate
and register your own client key. Neither Google Console nor a paid Google
subscription is needed for this demo issuer.

### Fully local issuance

If the issuer must run offline on your computer too, the additional setup includes
a compatible Inji Certify issuer, a credential schema and rendering template,
sample subject data, an authorization server, registered wallet client keys,
issuer signing keys, and public verification material reachable by the wallet.
For presentation and verification, add a compatible verifier with the corresponding
trust and callback configuration. Keycloak login alone does not issue credentials.

## Version boundaries

This web wallet is distinct from the mobile wallet. Do not expect mobile BLE
sharing, selfie/biometric device flows, or arbitrary mobile credential-offer
handling to appear automatically in the web UI. This checkout also does not expose
an ordinary change-PIN workflow, a general issuer administration UI, or every
feature announced for newer Inji releases.

For start, stop, rebuild, and troubleshooting commands, see
[LOCAL_DOCKER_SETUP.md](LOCAL_DOCKER_SETUP.md).
