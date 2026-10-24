#!/usr/bin/env bash
set -euo pipefail
local_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cert_dir="${INJI_CERT_DIR:-$(dirname -- "$local_dir")/certs}"
mkdir -p "$cert_dir"
if [[ ! -f "$cert_dir/verifier-ca.pem" ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
    -subj '/CN=Inji local demo CA' \
    -keyout "$cert_dir/verifier-ca.key" -out "$cert_dir/verifier-ca.pem"
fi
if [[ ! -f "$cert_dir/verifier.pem" ]]; then
  openssl req -newkey rsa:2048 -nodes -subj '/CN=verifier.localhost' \
    -keyout "$cert_dir/verifier.key" -out "$cert_dir/verifier.csr"
  openssl x509 -req -days 365 -in "$cert_dir/verifier.csr" \
    -CA "$cert_dir/verifier-ca.pem" -CAkey "$cert_dir/verifier-ca.key" -CAcreateserial \
    -out "$cert_dir/verifier.pem" \
    -extfile <(printf 'subjectAltName=DNS:verifier.localhost\nextendedKeyUsage=serverAuth\n')
fi
if [[ ! -f "$cert_dir/local-cacerts" ]]; then
  docker run --rm -v "$cert_dir:/certs" eclipse-temurin:21-jdk sh -c '
    cp /opt/java/openjdk/lib/security/cacerts /certs/local-cacerts
    keytool -importcert -noprompt -alias inji-local-verifier-ca \
      -file /certs/verifier-ca.pem -keystore /certs/local-cacerts -storepass changeit
  '
fi
chmod 600 "$cert_dir/verifier-ca.key" "$cert_dir/verifier.key"
echo 'Local verifier TLS prepared; no host or browser trust settings were changed.'
