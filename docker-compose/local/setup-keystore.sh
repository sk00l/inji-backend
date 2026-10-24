#!/usr/bin/env bash
set -euo pipefail
local_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cert_dir="${INJI_CERT_DIR:-$(dirname -- "$local_dir")/certs}"
mkdir -p "$cert_dir"
if [[ -e "$cert_dir/oidckeystore.p12" && ! -f "$cert_dir/oidckeystore.p12" ]]; then
  echo 'Keystore path is not a regular file; inspect the bind mount before continuing.' >&2
  exit 1
fi
if [[ ! -f "$cert_dir/oidckeystore.p12" ]]; then
  docker run --rm --user "$(id -u):$(id -g)" -v "$cert_dir:/certs" eclipse-temurin:21-jdk \
    keytool -genkeypair -alias local-dev -keyalg RSA -keysize 2048 -validity 365 \
    -dname 'CN=Inji Local Development, O=Local Demo, C=NP' \
    -storetype PKCS12 -keystore /certs/oidckeystore.p12 -storepass dummypassword -keypass dummypassword -noprompt
fi
docker run --rm -v "$cert_dir:/certs" eclipse-temurin:21-jdk \
  keytool -list -keystore /certs/oidckeystore.p12 -storepass dummypassword >/dev/null
echo 'Development keystore ready; existing keys preserved.'
