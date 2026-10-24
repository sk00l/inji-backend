#!/usr/bin/env bash
set -euo pipefail
stack_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
runtime="$stack_dir/mobile-runtime"
case "${1:-help}" in
  init)
    if [[ $# -lt 2 ]]; then echo "Usage: $0 init MAC_LAN_IPV4 [--port 8443]" >&2; exit 2; fi
    python3 "$stack_dir/local/prepare-mobile.py" "${@:2}"
    export INJI_CERT_DIR="$runtime/certs" INJI_SETUP_ISOLATED=true
    bash "$stack_dir/local/setup-university.sh"
    if [[ ! -f "$INJI_CERT_DIR/gateway.pem" ]]; then
      openssl req -newkey rsa:2048 -nodes -subj '/CN=Inji Mobile Local Gateway' \
        -keyout "$INJI_CERT_DIR/gateway.key" -out "$INJI_CERT_DIR/gateway.csr"
      openssl x509 -req -days 365 -in "$INJI_CERT_DIR/gateway.csr" \
        -CA "$INJI_CERT_DIR/verifier-ca.pem" -CAkey "$INJI_CERT_DIR/verifier-ca.key" -CAcreateserial \
        -out "$INJI_CERT_DIR/gateway.pem" -extfile "$runtime/gateway.ext"
      chmod 600 "$INJI_CERT_DIR/gateway.key"
    fi
    echo "Ready. Next: $0 build && $0 up && $0 check"
    exit 0
    ;;
esac
if [[ ! -f "$runtime/mobile.env" ]]; then
  echo "Initialize first: $0 init MAC_LAN_IPV4" >&2; exit 2
fi
compose=(docker compose --env-file "$runtime/mobile.env" -f "$stack_dir/compose.mobile.yaml")
case "${1:-help}" in
  build) "${compose[@]}" build mimoto-service university-issuer ;;
  up) "${compose[@]}" up -d ;;
  check) python3 "$stack_dir/local/check-mobile.py" ;;
  protocol-check) "${compose[@]}" run --rm --no-deps demo-verifier node mobile-protocol-check.mjs ;;
  tests) "${compose[@]}" run --rm --no-deps demo-verifier npm test ;;
  ps) "${compose[@]}" ps ;;
  logs) "${compose[@]}" logs --tail=100 "${@:2}" ;;
  down) "${compose[@]}" down ;;
  *) echo "Usage: $0 {init MAC_LAN_IPV4 [--port PORT]|build|up|check|protocol-check|tests|ps|logs [service]|down}" >&2; exit 2 ;;
esac
