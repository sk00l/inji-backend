# Paste this into the existing Inji Mobile coding-agent session

You are already working in **my existing customized Inji Mobile app repository**.
Keep using this checkout and preserve our current frontend, features, branch,
and uncommitted changes. Your first priority is to get the local Docker backend
running on this Mac; integrate the app only after the backend checks pass.

Backend repository: **https://github.com/sk00l/inji-backend.git**.

## Phase 1 — Establish the backend in a separate folder

1. Record the current mobile repository root, branch, working-tree changes, app
   scripts, SDK versions, and applicable `AGENTS.md` instructions. Keep the
   existing session's context. Do not clone a replacement mobile app, reset,
   switch branches, stash/discard my work, or replace frontend files.
2. Clone **only the backend repository** into a separate sibling folder named
   `inji-backend`, outside the mobile repository. If that folder already exists,
   inspect its remote, branch, changes, and instructions before reusing it; do
   not overwrite it or blindly pull/reset. Do not nest the backend inside the app.
3. Read `MAC_MOBILE_HANDOFF.md` in that backend checkout completely. Its commands
   run from the backend root. Use `mobile-stack.sh` and the mobile Compose profile;
   do not deploy Inji Web to make the native app work. The upstream mobile commit
   mentioned in the guide is a comparison reference, not a checkout instruction.
4. Check this Mac's architecture, Docker readiness/resources, and reachable LAN
   IPv4. Run `init` with that Mac's address. Generate **this Mac's own new keystore,
   CA, certificates, and signing keys** through the supplied scripts/containers.
   Do not obtain private keys, databases, or wallet data from the original laptop.
   On later runs preserve the Mac's existing keys and volumes; do not silently
   change the configured origin or mix a database with a different keystore.
5. Build and start the backend. Run `check`, `protocol-check`, and `tests` as
   documented. Resolve backend startup/configuration problems first. Confirm
   CA-verified HTTPS, healthy Mimoto/database, the university issuer configuration,
   PKCE/token exchange, signed issuance, and library verification. Keep the backend
   running. **Do not change mobile files to work around a failing backend.**

## Phase 2 — Adapt the connection to the existing app

6. Return to my existing mobile checkout. Inspect its current integration before
   editing. Adapt the backend/client configuration to this app's existing flow
   wherever possible. Preserve all existing UI and feature changes. Merge only
   necessary development connection settings, such as `MIMOTO_HOST` in the local
   environment and debug-only CA trust; do not replace configuration files or
   perform a framework/SDK upgrade as a shortcut. Review diffs against the initial
   working tree so your changes remain distinguishable from mine.
7. Compare the actual app's VCI/OpenID4VP SDK, callback, holder-key handling, and
   credential formats with the guide. If compatibility code is necessary, prefer
   an isolated backend adapter when correct; explain any unavoidable app-side
   changes and keep them additive and narrowly scoped. Never weaken TLS,
   signature, holder-binding, PKCE, or verifier-trust checks to make it pass.
   Inspect the documented upstream iOS verification TODO if using iOS.
8. Restart Metro/rebuild the development app using its existing scripts as needed.
   Preserve personal wallet data and use a fresh development wallet/profile.
   Demonstrate an empty wallet, select Himalaya University (Demo), authenticate
   **to the college** with `nisha` / `nisha-local-password`, and obtain Nisha
   Gurung's signed ID HU-2026-0002. Native wallet setup and college login are
   separate. Backend startup/protocol tests must not prepopulate the mobile app.

## Phase 3 — Demonstrate presentation and report evidence

9. Open the Mac library portal at the configured HTTPS origin. Generate a fresh
   presentation-request QR. Scan it with the mobile app when possible, or open
   the displayed request deep link in the emulator using the guide. Distinguish
   camera scanning from deep-link testing; this is not the printed ID's QR.
10. Present the mobile-issued card, confirm the library's signature/holder/policy
    checks and approval, then test declined sharing with a fresh request. Do not
    substitute the Web wallet or a synthetic HTTP wallet for native acceptance.
11. Report exact repositories/versions, configured endpoints, backend checks,
    narrowly scoped integration changes, and what was actually tested in the app.
    Distinguish backend success from native issuance, presentation, decline, and
    camera-scanning results. Explain any remaining blocker and keep working on
    independent tasks. Leave the backend/library running for review.

The handoff covers a complete local development backend plus fictional issuer
and library fixtures; it is not a full Inji Certify/Verify deployment. Native
compatibility depends on my existing app version and must be tested. No Google
account is needed. Never commit generated private keys, `.env.local`, runtime
settings, database dumps, or app wallet data. Do not publish or push either
repository without my request.
