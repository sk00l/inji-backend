#!/usr/bin/env bash
set -euo pipefail
local_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
stack_dir="$(dirname -- "$local_dir")"
cert_dir="${INJI_CERT_DIR:-$stack_dir/certs}"
bash "$local_dir/setup-keystore.sh"
bash "$local_dir/setup-verifier-tls.sh"
if [[ ! -f "$cert_dir/university.pem" ]]; then
  openssl req -newkey rsa:2048 -nodes -subj '/CN=university.localhost' \
    -keyout "$cert_dir/university.key" -out "$cert_dir/university.csr"
  openssl x509 -req -days 365 -in "$cert_dir/university.csr" \
    -CA "$cert_dir/verifier-ca.pem" -CAkey "$cert_dir/verifier-ca.key" -CAcreateserial \
    -out "$cert_dir/university.pem" \
    -extfile <(printf 'subjectAltName=DNS:university.localhost\nextendedKeyUsage=serverAuth\n')
fi
if ! docker run --rm -v "$cert_dir:/certs" eclipse-temurin:21-jdk \
  keytool -list -alias university-wallet-client -keystore /certs/oidckeystore.p12 -storepass dummypassword >/dev/null 2>&1; then
  if [[ "${INJI_SETUP_ISOLATED:-false}" != true ]]; then
    docker compose -f "$stack_dir/docker-compose.yml" -f "$stack_dir/compose.override.yaml" stop mimoto-service
  fi
  if [[ ! -f "$cert_dir/oidckeystore.before-university-import.p12" ]]; then
    cp -p "$cert_dir/oidckeystore.p12" "$cert_dir/oidckeystore.before-university-import.p12"
    chmod 600 "$cert_dir/oidckeystore.before-university-import.p12"
  fi
  docker run --rm --user "$(id -u):$(id -g)" -v "$cert_dir:/certs" eclipse-temurin:21-jdk \
    keytool -genkeypair -alias university-wallet-client -keyalg RSA -keysize 2048 \
    -validity 365 -dname 'CN=Inji University Demo Client, O=Local Demo, C=NP' \
    -storetype PKCS12 -keystore /certs/oidckeystore.p12 -storepass dummypassword \
    -keypass dummypassword -noprompt
fi
docker run --rm -v "$cert_dir:/certs" eclipse-temurin:21-jdk keytool -exportcert -rfc \
  -alias university-wallet-client -keystore /certs/oidckeystore.p12 -storepass dummypassword \
  > "$cert_dir/university-client.pem"
docker run --rm -v "$cert_dir:/keys" node:22-alpine node -e '
  const fs=require("fs"),crypto=require("crypto");
  const certificate=new crypto.X509Certificate(fs.readFileSync("/keys/university-client.pem"));
  fs.writeFileSync("/keys/university-client-public.jwk",JSON.stringify(certificate.publicKey.export({format:"jwk"})));
'
chmod 600 "$cert_dir/university.key"
echo 'University TLS and a separate registered client key are ready; existing wallet keys were preserved.'
