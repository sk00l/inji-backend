# University student ID and campus library demo

For the native mobile app on a Mac, use [MAC_MOBILE_HANDOFF.md](MAC_MOBILE_HANDOFF.md).
Its separate mobile profile includes a library request QR and phone/emulator
networking configuration. The walkthrough below is the existing Web scenario.

This fictional scenario demonstrates the three credential roles:

| Role | Inji product | University example | This local demo |
| --- | --- | --- | --- |
| Issuer | Inji Certify | The registrar issues and signs a student ID | A local standards-compatible demonstration issuer |
| Holder | Inji Wallet / Inji Web | The student stores and presents the ID | The actual Inji Web application and Mimoto |
| Verifier | Inji Verify | The library checks the ID before granting access | A local demonstration verifier that checks signatures and student eligibility |

You need these roles for a complete credential journey, but you do not have to
deploy all three Inji products yourself. A wallet can use an existing compatible
issuer, and a university can integrate a compatible verifier into its library
system. Mimoto, authentication providers, databases, and key storage are supporting
components rather than additional credential roles.

The local issuer and library are demonstration services, not deployments of the
complete Inji Certify and Inji Verify products. They use a fictional university and
student. No real enrollment database or physical door is connected.

## Present the journey from an empty wallet

Use **Nisha**, the new student account, when demonstrating the complete flow.
It has no wallet or cards prepared for it. Creating a wallet does not automatically
issue a student card. The previously populated `student` account is a separate
shortcut for testing; use `nisha` for your presentation.

1. Open **http://localhost:3004**. Log out of another account first, or use a fresh
   private browser window so an existing Keycloak login does not select that account.
2. Select **Continue with local account**.
3. Sign in with **`nisha` / `nisha-local-password`**.
4. Create a wallet (for example, **Nisha's Student Wallet**) and choose and confirm
   your own six-digit PIN. Keep that PIN for later unlocks.
5. Show **Stored Cards**: it is empty. Explain: “I have a wallet, but the university
   has not issued any credential to it yet.”
6. Select **Add Cards**, then **Himalaya University (Demo)** in the issuer list,
   then **University Student ID**.
7. The wallet redirects to the **college registrar's login**, on localhost:3006.
   Sign in there with **`nisha` / `nisha-local-password`** and select
   **Issue my student ID**. These are fictional college credentials, separate
   from the wallet account even though the demo uses the same username/password.
8. The college looks up Nisha's registered student record and signs the credential.
   The browser returns to Inji Web; Mimoto retrieves and verifies the credential
   and stores it encrypted in the wallet. Wait for the download to complete.
9. Open **Stored Cards**. Show the new ID: **Nisha Gurung / HU-2026-0002**.
   View or download the PDF to show its student details and QR code.
10. Open **http://localhost:3000**, the campus library portal. Select
    **Present my student ID**. The wallet opens a new tab; review the library,
    select your student ID, and consent to sharing it.
11. Return to the library tab to show **Library access approved** after validation.
    Start another request and decline sharing to show that no access is granted.

Useful narration: “The university issues the ID. I keep it in my wallet. The
library verifies the university signature and that I control the wallet holding
the ID, then applies its active-enrollment rule.”

The new student record is fictional:

| Field | Value |
| --- | --- |
| Name | Nisha Gurung |
| Student ID | HU-2026-0002 |
| University | Himalaya University (Demo) |
| Program | BSc Computer Science |
| Department | School of Computing |
| Enrollment | Active |
| Academic year | 2026/27 |
| Campus | Kathmandu Demo Campus |

The name on the ID comes from the **college's student record**, not an editable
wallet profile. Signing into a wallet with any arbitrary name does not create
college enrollment or entitle that person to a signed ID in that name. A real
university would connect its registrar login to college SSO and its student
information system. This demo supports predefined fictional college accounts.

The existing **`student` / `student-local-password`**, PIN **`123456`**, remains
available with Aarav Sharma's already-issued ID. Existing wallets were preserved.
Nisha's account remains empty until you create its wallet and request a card.
After your first walkthrough it will retain that card; signing out and back in
does not clear it.

## Is the library scanning the student card's QR code?

**No. The current library flow uses interactive OpenID4VP presentation.** The
**Present my student ID** button opens a fresh signed library request in Inji Web.
The student consents, and the wallet sends a signed presentation directly to the
library verifier. It uses a fresh challenge and checks wallet ownership; copying
the printed card cannot reproduce that wallet signature.

The QR on the PDF is a separate **embedded credential QR**. A compatible scanner
can extract the issued credential and verify its signature and claims. That scan
alone does not prove that the person showing a copied PDF controls the student's
wallet. The local library page currently has no camera or QR-upload scanner.

Another possible flow is for a library kiosk to display a **request QR**, which
students scan with a compatible mobile wallet. That QR carries the presentation
request, rather than being the student ID's printed QR. A kiosk/mobile QR flow
has not been added to this desktop Inji Web demonstration.

## Try issuing a card yourself

Open the wallet's issuer list and select **Himalaya University (Demo)**, then
**University Student ID**. The browser goes to the local registrar login page.
For the fresh student walkthrough, use **`nisha` / `nisha-local-password`** there
too. The local registrar checks
the demo account and the OAuth request, signs the credential, and returns it via
Mimoto. Mimoto verifies its signature before storing it in the wallet.

The registrar homepage at **http://localhost:3006** explains its role and shows
the fictional student record. It is not a self-service real student registration
system. The wallet login and registrar login are separate accounts; their sample
passwords are intentionally the same for this demonstration.

An optional registrar login **`alumni` / `student-local-password`** issues a validly
signed card whose enrollment status is `graduated`. This demonstrates why a valid
signature alone is insufficient for active-student access. The library policy
denies access when that card is presented. It does not alter the active student's
existing card.

## What is checked

The university library flow is different from the earlier receipt-only mock:

1. Mimoto validates the library's signed OpenID4VP authorization request against
   its pre-registered public key and response URL.
2. The wallet finds credentials matching the request and asks for consent.
3. The wallet signs a presentation containing the selected credential.
4. The library verifies the wallet's detached `JsonWebSignature2020` signature
   using its public `did:jwk` key.
5. It checks the fresh request challenge, verifier audience, and request state.
6. It verifies the university's `Ed25519Signature2020` credential signature and
   requires the configured university issuer.
7. It checks that the credential is bound to the presenting wallet's key.
8. It checks credential validity dates and the signed enrollment claim.
9. It consumes the request so it cannot be replayed.

The result distinguishes an approved student, valid-but-ineligible enrollment,
failed verification, declined consent, and an expired request. Receiving a POST
does not itself establish that access is approved.

Compatibility detail: this Mimoto revision labels presentation descriptor entries
with its stored credential UUID. The library accepts that label for this single-card
request, requires the expected presentation/credential paths and definition ID,
and independently checks all student credential constraints. This is a local
compatibility adapter, not a general-purpose OpenID4VP conformance implementation.

This JSON-LD flow shares the full selected student credential. It does not provide
selective disclosure of individual student fields. Enrollment is checked from the
signed claim as issued, not by querying a live university database. A real service
would also need an enrollment-update and revocation/status strategy.

## Local implementation

- `docker-compose/university/issuer.mjs`: demonstration authorization server and
  OpenID4VCI issuer, with PKCE, registered client assertions, bearer tokens, nonce
  checks, and holder-bound student credentials.
- `docker-compose/university/verifier.mjs`: signed library requests and the demo
  library policy, plus legacy receipt-only routes for the original identity tour.
- `docker-compose/university/credentials.mjs`: signing and verification using the
  Digital Bazaar credential/signature libraries, RDF canonicalization, and Node
  cryptography for Mimoto's detached presentation signature.
- `docker-compose/university/public/`: registrar, student login, and library pages.
- `docker-compose/university/student-card-template.html`: Mimoto's student PDF
  template.
- `docker-compose/local/university_demo.py`: seeding and integration checks through
  the actual local APIs.

Issuer and library signing keys are generated separately and retained in named
Docker volumes. Mimoto has a separate university client key in its existing
PKCS12 store. The old store was backed up before adding that alias. Existing
wallet keys, the original demo account, and the tour wallet are preserved.

The issuer's HTTPS endpoints and DID document use `university.localhost` inside
Docker. The library protocol uses `verifier.localhost`. The existing local CA is
trusted by the development JVM and library container; host/browser trust settings
are unchanged. Browser-facing pages use HTTP on loopback ports 3000, 3004, and 3006.
No public hosted issuer or Google account is needed for the university flow.
Some wallet libraries may still resolve public standard JSON-LD contexts; offline
operation with network access disabled has not been tested.

The bundled JWS 2020 context is the standard document from
https://w3id.org/security/suites/jws-2020/v1. Signature/credential libraries are
pinned in `package-lock.json`. Neither credential nor TLS verification is disabled.

## Run and check

To ensure the fresh-demo login exists, without creating a wallet or adding cards:

```bash
python3 docker-compose/local/prepare-new-student.py
```

This command preserves an existing Nisha wallet; it does not reset it. The realm
import also includes Nisha for a completely fresh Docker installation. Do not run
card-seeding commands against Nisha before your demonstration.


From the Mimoto repository root:

```bash
./docker-compose/local-stack.sh build
./docker-compose/local-stack.sh up
./docker-compose/local-stack.sh check

# Seed only the separate prepopulated Aarav account (not Nisha), test library
# approval and declined consent, and verify that completed requests cannot replay.
python3 docker-compose/local/university_demo.py

# Signature, tampering, wrong-holder, challenge, issuer, validity, and
# graduated-student policy tests.
docker run --rm inji-university-demo:local npm test
```

The Python check requires `requests`. It uses fictional accounts and does not
delete or overwrite existing wallets or add duplicate student cards. The
previous `demo` and `tour` accounts and hosted Mock issuer remain available.

Verified locally on October 24, 2026: 206 focused Java tests and 10 university
signing/verification tests passed. HTTP integration verified actual student
issuance and Mimoto signature validation, encrypted wallet storage, student PDF
generation, library approval after independent signature and policy checks,
declined consent, and rejection of completed-request replay. The one-page PDF
was rendered and visually inspected. Browser interaction was not automated
because no browser automation surface was available.

The fresh-student update also passed Nisha's college authorization, signed ID
issuance, Mimoto verification, and a check that her correct name and student ID
appear in the guest PDF. This test did not create a wallet or store a card for
Nisha; her empty starting state was checked afterward.

For a production university, replace the fixed demo accounts/data with the student
information system and SSO; use protected operational keys, proper domain/TLS
configuration, credential lifecycle/status management, and a reviewed access
policy. Inji Certify and Inji Verify can provide their respective product roles
instead of these small demonstration services.
