# Run Mimoto locally with Docker

The expanded stack now includes a local university issuer and a campus-library
verifier. Start with [UNIVERSITY_DEMO.md](UNIVERSITY_DEMO.md) for the student ID
scenario, local demo credentials, URLs, and checks. The earlier public sandbox
identity demo remains available.

This guide runs the Mimoto backend and its supporting services using Docker
Compose. Mimoto is the backend for Inji Mobile and Inji Web. The base Compose file
runs the backend services; the added local override starts the separate Inji Web
frontend and a development identity provider as well.

## Integrated local setup (added after the initial installation)

The local override in `docker-compose/compose.override.yaml` adds Inji Web, a
Keycloak development login, a local university issuer, and a campus library
verifier with an internal TLS proxy. It uses the sibling checkout `../inji-web`, builds
Mimoto from this checkout, and preserves the existing PostgreSQL data and keystore.
The instructions below the integrated setup describe the original base stack;
use these commands to operate the expanded stack.

From the Mimoto repository root:

```bash
# Build the patched backend and frontend (only needed after code changes).
./docker-compose/local-stack.sh build

# Start dependencies, wait for readiness, then start the backend and frontend.
./docker-compose/local-stack.sh up

# Check the frontend, backend, issuer list, and issuer discovery.
./docker-compose/local-stack.sh check

# View recent service logs.
./docker-compose/local-stack.sh logs mimoto-service

# Stop containers without deleting named data volumes.
./docker-compose/local-stack.sh down
```

The build command temporarily stops Mimoto, DataShare, and Keycloak to reduce
memory pressure. Run `up` when it finishes. The first build downloads Maven and
npm dependencies and can take several minutes. If a dependency download fails
with a transient TLS/network error, retry the build; downloaded dependencies are
cached. The build script clones the pinned frontend revision if it is missing
and reapplies the optional local login patch without replacing unrelated changes.

Open **http://localhost:3004** and select **Continue with local account**:

| Setting | Local development value |
| --- | --- |
| Wallet login username | `demo` |
| Wallet login password | `demo-local-password` |
| Keycloak console | `http://localhost:8080` |
| Keycloak admin username | `admin` |
| Keycloak admin password | `local-admin-password` |

Set your own six-digit wallet PIN when prompted by Inji Web. These are local
development accounts; no Google account or Google Console setup is needed.
The frontend also retains **Continue as Guest**. The browser uses the frontend's
same-origin `/v1/mimoto` proxy, including for OAuth callbacks and session cookies.
Use `localhost` consistently rather than switching to `127.0.0.1` or a LAN address.

A separate populated demo account is **`tour` / `tour-local-password`**, with
wallet PIN **`123456`**. Its Feature Tour wallet contains a verified sandbox
credential. Your original `demo` account remains separate. Open
**http://localhost:3000** to try the university library verifier. For that flow,
use the separate **`student` / `student-local-password`** account with wallet PIN
**`123456`**, following [UNIVERSITY_DEMO.md](UNIVERSITY_DEMO.md).
See [INJI_WEB_FEATURE_TOUR.md](INJI_WEB_FEATURE_TOUR.md) for a complete walkthrough,
demo issuer inputs, feature boundaries, and protocol-check commands.

The backend patch accepts the demo issuer's newer nested display metadata and
keeps the existing flattened API response for Inji Web. The old discovery request
returned 404 because Mimoto rejected that metadata, not because the local route
was missing. The patch does not disable credential verification.

The local configuration disables the unused Redis health probe and the library's
symmetric HSM health probe, which does not apply to the PKCS12 RSA store used
here. Key initialization still runs at startup, and the integration check
exercises the actual wallet encryption and unlock flow.

For the authenticated integration check, run:

```bash
python3 docker-compose/local/smoke-test.py
```

This optional check requires the Python `requests` package. It verifies that
anonymous access is rejected, logs in with the local demo account, creates and
unlocks a temporary wallet, lists credentials, removes only that temporary
wallet, checks issuer discovery, and logs out. It does not test external
credential issuance.

**Credential issuance is separate from local wallet login.** The official
documentation provides a public sandbox client (`wallet-demo`) and matching demo
keystore. Its `wallet-demo-client` key has been imported into your existing store
while preserving your wallet encryption keys. The old store was backed up to
`docker-compose/certs/oidckeystore.before-sandbox-import.p12`.

The Collab Mock issuer now uses OpenID4VCI 1.0 final. The local configuration opts
only `Mock` into the compatible nonce, proof-array, configuration-ID request, and
credential-array response handling. Other issuers retain the previous wire format.
The identity credential flow was tested with signature verification enabled.
For a real issuer, follow section 11 and register your own client keys.

The override adds named MinIO and Keycloak volumes. During this installation,
the previous MinIO data was copied to the named volume before recreation. Keep
PostgreSQL data and `docker-compose/certs/oidckeystore.p12` together when backing
up the wallet. The certs directory is excluded from Git.

The added services bind to loopback. The original base services retain their
existing port bindings. This configuration and its checked-in development
credentials are for a local machine.

## 1. Prerequisites

You need Docker Engine or Docker Desktop, Docker Compose, and internet access to
download images and Maven dependencies. Java and Maven do not need to be installed
on your computer if you use the Docker build commands below.

Docker and Compose were available on the machine when this repository was
inspected. Verify that the Docker daemon is running:

```bash
cd /home/leapfrog/Desktop/random/mimoto

docker --version
docker compose version
docker info
```

If you use another checkout location, substitute your repository path. Installation
references: [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
and [Docker Compose](https://docs.docker.com/compose/install/).

## 2. Services and ports

The existing configuration is in
[`docker-compose/docker-compose.yml`](docker-compose/docker-compose.yml).

| Service | Purpose | Host port |
| --- | --- | --- |
| Mimoto | Backend API | `8099` |
| PostgreSQL | Wallet and key database | `5432` |
| Nginx | Issuer configuration and credential templates | `80` |
| DataShare | Credential sharing | `8097` |
| MinIO | Object storage for DataShare | `9000`, `9001` |

Make sure these ports are free. This Compose setup and its example credentials
are intended for local development.

## 3. Fix the KeyManager database username

From the repository root, open:

```bash
nano docker-compose/config/mimoto-default.properties
```

Replace:

```properties
keymanager_database_username= mimotouser
```

with:

```properties
keymanager_database_username=${POSTGRES_USER}
```

The Compose database initialization creates the `postgres` user, but does not
create `mimotouser`. This makes KeyManager use the configured local database user.

Keep these existing environment values under `mimoto-service` in the Compose file:

```yaml
- SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/inji_mimoto
- POSTGRES_USER=postgres
- POSTGRES_PASSWORD=postgres
```

The database hostname is `postgres` because Mimoto connects from another container.
Do not change it to `localhost` for this setup.

## 4. Pin PostgreSQL for a fresh setup

Open:

```bash
nano docker-compose/docker-compose.yml
```

Under the `postgres` service, replace:

```yaml
image: 'postgres:latest'
```

with:

```yaml
image: 'postgres:18-bookworm'
```

Keep the existing volume mount:

```yaml
- postgres-data:/var/lib/postgresql
```

This mount matches the PostgreSQL 18 image layout. Pinning the major version avoids
an unexpected database major-version change from a future `latest` update. See the
[official PostgreSQL image documentation](https://hub.docker.com/_/postgres).

If an existing database volume was initialized by another PostgreSQL major
version, use the matching image or migrate the database. Do not attach that volume
to a new major version without a migration.

## 5. Create the missing keystore

The Compose stack expects the file at:

```text
docker-compose/certs/oidckeystore.p12
```

The bind mount is relative to the Compose directory. Create the file before
starting Mimoto so Docker does not create a directory at the missing file path.

If you already have an issuer-onboarded keystore, copy that file to this location
and configure its password. Otherwise, generate a development keystore for initial
local startup. Run from the repository root:

```bash
mkdir -p docker-compose/certs

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD/docker-compose/certs:/certs" \
  eclipse-temurin:21-jdk \
  keytool -genkeypair \
  -alias local-dev \
  -keyalg RSA \
  -keysize 2048 \
  -sigalg SHA256withRSA \
  -validity 365 \
  -dname "CN=localhost, OU=Development, O=Local, L=Kathmandu, ST=Bagmati, C=NP" \
  -storetype PKCS12 \
  -keystore /certs/oidckeystore.p12 \
  -storepass dummypassword \
  -keypass dummypassword \
  -noprompt

test -f docker-compose/certs/oidckeystore.p12
```

For this generated file, keep the existing Mimoto environment value:

```yaml
- oidc_p12_password=dummypassword
```

Do not regenerate or replace a keystore used by an existing database casually.
The database contains key references and encrypted data associated with it.

The `local-dev` key is for development setup. It is not automatically registered
with the sample credential issuer. Full credential issuance requires the
onboarding described in section 11.

## 6. Correct the sample issuer URLs

Open:

```bash
nano docker-compose/config/mimoto-issuers-config.json
```

The included sample issuer ID is `Mock`. Replace its local token endpoint:

```json
"token_endpoint": "https://localhost:8099/v1/mimoto/get-token/Mock"
```

with:

```json
"token_endpoint": "http://localhost:8099/v1/mimoto/get-token/Mock"
```

This local Mimoto setup serves HTTP.

Also replace:

```json
"wellknown_endpoint": "https://injicertify-mock.collab.mosip.net/v1/certify/issuance/.well-known/openid-credential-issuer"
```

with:

```json
"wellknown_endpoint": "https://injicertify-mock.collab.mosip.net/.well-known/openid-credential-issuer"
```

At inspection time, the former discovery path returned HTTP 404 and the latter
returned HTTP 200. External demo services may change.

## 7. Skip Google authentication for now, or configure it later

**You can skip Google Console setup and continue to section 8.** For local backend
startup and public API testing, leave these existing values under `mimoto-service`
in `docker-compose/docker-compose.yml` unchanged:

```yaml
- GOOGLE_OAUTH_CLIENT_ID=clientId
- GOOGLE_OAUTH_CLIENT_SECRET=clientSecret
```

Keep both values nonempty. The application still configures an OAuth client at
startup, so do not remove these variables or delete the Google properties.
Leaving placeholders skips credential setup; it does not disable authentication
or bypass protected endpoints.

Without real Google credentials:

- You can start the backend and supporting containers and test the public health,
  configuration, and issuer endpoints listed in section 10.
- Google sign-in will not work. Avoid the Google login button for now.
- Protected user profile and web wallet operations still require a valid login;
  placeholders do not let you test the complete authenticated web wallet flow.
- Issuer OIDC onboarding is separate and remains necessary for credential flows
  that use an issuer-registered client key (section 11).

**A paid Google Cloud subscription is not required just to set up basic Google
OAuth sign-in with the profile and email scopes used here.** If you enable it
later, you need a Google account and a Cloud project to create the OAuth client.
Billing requirements for other Google APIs are separate. See Google's
[sign-in setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
and [billing guidance](https://support.google.com/cloud/answer/15548748?hl=en).

### Optional: enable working Google login later

Follow the remaining steps in this section only when you want working Google login:

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Configure the OAuth consent screen, audience, and required application details.
4. Add your Google account as a test user if the app is in testing mode.
5. Create an OAuth client with application type **Web application**.
6. Configure the following origin and redirect URI.

Authorized JavaScript origin:

```text
http://localhost:8099
```

Authorized redirect URI:

```text
http://localhost:8099/v1/mimoto/oauth2/callback/google
```

Replace the environment values under `mimoto-service` in the Compose file:

```yaml
- GOOGLE_OAUTH_CLIENT_ID=YOUR_ACTUAL_CLIENT_ID
- GOOGLE_OAUTH_CLIENT_SECRET=YOUR_ACTUAL_CLIENT_SECRET
```

The callback must match the URI registered with Google. See
[Google's OAuth web-server documentation](https://developers.google.com/identity/protocols/oauth2/web-server).

Keep credentials and keystore files out of Git commits.

## 8. Choose a prebuilt image or build this checkout

### Option A: Use the published image

For the quickest startup, keep the existing Mimoto image:

```yaml
image: 'injistack/mimoto:0.22.0'
```

Then continue to section 9. This runs the published release image; it does not
include changes you make to the Java source in this checkout.

### Option B: Build the checked-out source using Docker

From the repository root, build the JAR with Java 21 and Maven in a container:

```bash
cd /home/leapfrog/Desktop/random/mimoto

docker run --rm \
  -v "$PWD:/workspace" \
  -v mimoto-maven-cache:/root/.m2 \
  -w /workspace \
  maven:3.9-eclipse-temurin-21 \
  mvn clean package \
  -Dgpg.skip=true \
  -Dmaven.javadoc.skip=true \
  -DskipTests=true
```

This uses a named volume to cache Maven downloads. The container runs Maven as
root, so generated files under `target/` may be root-owned on Linux. These build
commands skip tests.

After Maven succeeds, build the application image:

```bash
docker build -t mimoto:local .
```

The repository Dockerfile expects the built JAR in `target/`, so build the JAR
before running `docker build`.

In `docker-compose/docker-compose.yml`, replace the image under `mimoto-service`:

```yaml
image: 'mimoto:local'
```

## 9. Start the dependencies, then Mimoto

Run all commands in this section from the Compose directory:

```bash
cd /home/leapfrog/Desktop/random/mimoto/docker-compose

docker compose config --quiet
```

A warning about the obsolete top-level `version` field is harmless.

Start the supporting services:

```bash
docker compose up -d postgres minio nginx datashare
```

Watch PostgreSQL initialize:

```bash
docker compose logs -f postgres
```

Wait for initialization to finish and the final ready-to-accept-connections
message. Press `Ctrl+C` to exit log viewing; the container keeps running.

Verify that the database and tables exist:

```bash
docker compose exec postgres \
  psql -U postgres -d inji_mimoto -c '\dt mimoto.*'
```

The Compose mount runs `mimoto_init.sql` automatically when PostgreSQL initializes
an empty data directory. It creates the database, schema, tables, and key policies.
You do not need to run `db_scripts/inji_mimoto/deploy.sh` separately for this setup.
Initialization scripts are not rerun on an existing database volume.

Check static configuration and DataShare logs:

```bash
curl -f http://localhost/mimoto-issuers-config.json

docker compose logs --tail=100 datashare
```

Start Mimoto:

```bash
docker compose up -d mimoto-service

docker compose logs -f mimoto-service
```

Look for successful Spring application startup and:

```text
MIMOTO KEY SETUP COMPLETED
```

Press `Ctrl+C` to stop following the logs. Starting dependencies first avoids
relying on Compose's basic `depends_on` entries as readiness checks.

## 10. Verify the backend

From the Compose directory:

```bash
docker compose ps

curl -f http://localhost:8099/v1/mimoto/actuator/health

curl -f http://localhost:8099/v1/mimoto/allProperties

curl -f http://localhost:8099/v1/mimoto/issuers

curl -f http://localhost:8099/v1/mimoto/issuers/Mock
```

These checks establish backend availability. They do not establish that Google
login or credential issuance is configured correctly.

To exercise remote issuer discovery:

```bash
curl -f http://localhost:8099/v1/mimoto/issuers/Mock/well-known-proxy
```

That request depends on the external issuer service and metadata compatibility.

## 11. Complete issuer onboarding for credential downloads

A working credential issuance flow needs:

- An OIDC client registered with the selected issuer's authorization server.
- Its private key and certificate in `docker-compose/certs/oidckeystore.p12`.
- A matching `client_id` and `client_alias` in the issuer JSON.
- A `redirect_uri` registered for the actual wallet client being used.
- Correct issuer and authorization server endpoints.

The sample `wallet-demo` client ID and `wallet-demo-client` alias do not establish
that your generated development key is registered. Google OAuth client
credentials are separate from these issuer OIDC credentials.

Follow the [Inji credential provider onboarding guide](https://docs.inji.io/inji-wallet/inji-mobile/technical-overview/customization-overview/credential_providers)
to obtain or register the appropriate key. Configure the keystore password in the
Compose environment to match the file.

For a fully offline system, you would also need local issuer and authentication
services. The supplied Compose stack uses external demo issuer endpoints.

## 12. Connect Inji Web separately

The backend currently expects Inji Web at:

```text
http://localhost:3004
```

The relevant backend settings are:

```properties
mosip.inji.web.url=http://localhost:3004
mosip.security.origins=http://localhost:3004
```

Run the separate Inji Web project and configure its backend base URL as:

```text
http://localhost:8099/v1/mimoto
```

If you use another frontend port, update the backend URL and allowed origin
properties accordingly, then recreate Mimoto. Without a running frontend,
successful browser login redirects to an unavailable frontend page.

For a wallet running on a physical phone, `localhost` refers to the phone. Use
addresses reachable from that device and update the related URLs and registered
redirects for that setup.

## 13. Everyday commands

Run these from `docker-compose/`.

```bash
# Start the configured stack after the initial setup
docker compose up -d

# Show status
docker compose ps

# Follow Mimoto logs
docker compose logs -f mimoto-service

# Inspect recent logs
docker compose logs --tail=200 mimoto-service

# Apply environment, configuration, or image changes to Mimoto
docker compose up -d --force-recreate mimoto-service

# Stop and remove containers while retaining the PostgreSQL named volume
docker compose down
```

After Java source changes, repeat the Maven and image build commands in section 8
before recreating Mimoto.

The Compose file explicitly persists PostgreSQL, but does not configure a named
MinIO data volume. Do not assume MinIO objects survive container removal or
recreation. Add persistence appropriate to that MinIO image if you need it.

## 14. Troubleshooting

| Symptom | Check or action |
| --- | --- |
| `role "mimotouser" does not exist` | Apply the username fix in section 3. |
| Keystore missing or mounted as a directory | Ensure the `.p12` file exists before starting Mimoto. If the path is a directory created by Docker, stop Mimoto and replace the empty directory with the real file. |
| Incorrect keystore password | Match `oidc_p12_password` to the actual file password. |
| Database connection refused | Wait for PostgreSQL initialization, inspect its logs, then start Mimoto again. |
| Database or tables missing | Check PostgreSQL initialization logs. The init SQL only runs on an empty data directory. |
| Google `redirect_uri_mismatch` | Check the exact callback URI from section 7. |
| Credential token exchange fails | Check issuer registration, client ID, alias, private key, and redirect URI. |
| Issuer discovery fails | Check remote endpoint availability and the corrected discovery URL. |
| Port already allocated | Free the occupied port or change its host mapping. Update affected browser-facing URLs if you change the Mimoto port. |
| Login succeeds but frontend is unavailable | Run Inji Web separately at the configured URL. |
| State-changing API request returns a CSRF error | The code enables CSRF protection; authenticated clients must retain cookies and send the expected CSRF header. |

Useful diagnostic commands:

```bash
docker compose logs --tail=200 postgres
docker compose logs --tail=200 datashare
docker compose logs --tail=200 minio
docker compose logs --tail=200 nginx
docker compose logs --tail=200 mimoto-service
```

Preserve the database and keystore together. Replacing only the keystore can
make existing encrypted data unusable. Avoid deleting volumes as a routine
troubleshooting step.

## Verified results and remaining external dependencies

The integrated stack was built and started locally on October 24, 2026. All
ten services are included: Inji Web, Mimoto, PostgreSQL, Nginx, DataShare,
MinIO, Keycloak, the local university issuer, library verifier, and internal TLS
proxy. The frontend production build passed, and 206 focused Java
tests passed with no failures or errors.

HTTP integration checks passed for:

- Frontend delivery and its same-origin API proxy.
- Backend health (`UP`) and PostgreSQL connectivity.
- Rejection of anonymous profile access.
- Local OAuth login, including repeat login without a profile picture.
- Authenticated profile and wallet listing.
- Temporary wallet creation, unlocking, credential listing, and cleanup.
- Issuer listing and the previously failing Mock well-known proxy.
- Logout.
- DataShare upload and retrieval through MinIO.
- Hosted sandbox authentication, PKCS12 client assertion token exchange, issuer
  nonce acquisition, JSON-LD credential issuance, and credential signature verification.
- Guest credential PDF generation and download.
- Encrypted credential storage in the separate Feature Tour wallet.
- Signed local verifier request validation, credential matching, signed wallet
  presentation construction, and delivery to the mock presentation receiver.

The temporary integration-test wallet was removed. The `demo` account remains
available; choose your own wallet PIN when using it. The separate `tour` account
retains its Feature Tour wallet and sample credential, with the documented demo
PIN `123456`.

These were build, unit, and HTTP integration checks. A browser automation surface
was unavailable, so visual browser interaction was not tested. Google login was
not configured. The original Mock credential issuer and eSignet use hosted public
sandbox services. The university issuer runs locally and needs neither that
sandbox nor Google. Other issuers need their own onboarding and client keys.
The legacy Mock presentation routes acknowledge delivery only; the new university
library flow independently verifies the credential and presentation signatures,
holder binding, request freshness, and student eligibility. See the university
guide for its checks and limits. PDF online-sharing QR verification from
outside the Docker network still requires reachable DataShare URLs and a
compatible verifier; it was not tested.
