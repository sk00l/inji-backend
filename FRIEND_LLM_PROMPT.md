# Copy this prompt to the friend's coding agent

You are in our Mimoto backend checkout. Set up the local backend on this Mac and
connect my existing Inji Mobile app project, then demonstrate college student-ID
issuance and campus-library presentation.

Backend repository: **https://github.com/sk00l/inji-backend.git**. My customized
Inji Mobile app already exists in a separate folder. Use that existing checkout;
do not clone a replacement mobile app, reset/check out another branch over my
changes, or replace its frontend. The upstream commit in the guide is a reference
for comparison, not an instruction to replace my app version.

Read `MAC_MOBILE_HANDOFF.md` completely before making changes. Use the mobile
Compose profile, not the older Web demo startup. Do not deploy Inji Web merely
to make the native app work.

1. Inspect Mac architecture, Docker readiness/resources, the active LAN IPv4,
   this checkout's commit, and my app repository/revision. Find an existing app
   checkout before asking me for its path. Inspect its working-tree changes and
   preserve them. If you cannot identify the app folder, ask for its path while
   continuing independent backend setup. Check app-specific `AGENTS.md` rules.
2. Initialize the isolated mobile runtime using the reachable Mac LAN IP. Build
   and start with `docker-compose/mobile-stack.sh`. Preserve existing Docker
   data and signing keys. Do not silently change an already configured origin.
3. Run `check`, `protocol-check`, and `tests`. Fix actual startup problems before
   changing the app. Do not claim a successful native flow from these synthetic
   backend tests.
4. Merge the generated `MIMOTO_HOST` origin into the app's development environment.
   Inspect its current VCI/OpenID4VP SDK and callback configuration against the
   pinned source reference. Configure debug-only development CA trust correctly;
   never disable TLS or credential-signature verification. Inspect the documented
   iOS verification TODO if using iOS.
5. Restart Metro/rebuild the development app as required. Preserve existing
   personal wallet data; use a fresh development wallet/profile for demonstration.
   Show an empty wallet, choose Himalaya University (Demo), authenticate to the
   college with `nisha` / `nisha-local-password`, and obtain Nisha Gurung's signed
   ID HU-2026-0002. Native wallet setup and college login are separate steps.
6. Open the Mac library portal at the configured HTTPS origin. Generate a fresh
   request QR. Use the actual camera scanner when possible, or pass the displayed
   request deep link into the emulator using the documented platform command.
   Distinguish QR camera testing from deep-link protocol testing.
7. Present the mobile-issued card, confirm the library's cryptographic verification
   and active-enrollment decision, then try declined sharing with a fresh request.
   Do not substitute a Web wallet presentation for this native acceptance test.
8. Report exact versions/commands, checks passed, remaining issues, and whether
   native issuance, presentation, decline, and camera scanning were actually
   exercised. Keep the backend and library running for review.

The local issuer/library are fictional development services, not full Inji
Certify/Verify installations. No Google account is needed. Do not seed cards into
the app before the empty-wallet demonstration. Do not commit generated private
keys, `.env.local`, runtime configuration, database dumps, or app wallet data.
If the actual app version needs an adapter, implement and test it in the right
repository and document it rather than claiming standards support proves
interoperability. Do not push to upstream or publish anything without my request.
