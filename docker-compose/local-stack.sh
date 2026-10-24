#!/usr/bin/env bash
set -euo pipefail
stack_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname -- "$stack_dir")"
web_repo="$(dirname -- "$repo_dir")/inji-web"
compose=(docker compose -f "$stack_dir/docker-compose.yml" -f "$stack_dir/compose.override.yaml")

case "${1:-up}" in
  build)
    if [[ ! -d "$web_repo/.git" ]]; then
      git clone https://github.com/inji/inji-web.git "$web_repo"
      git -C "$web_repo" checkout a9f4f829d3070be34ae11649327ea1561e123a2b
    fi
    if git -C "$web_repo" apply --check "$stack_dir/local/inji-web-local.patch" 2>/dev/null; then
      git -C "$web_repo" apply "$stack_dir/local/inji-web-local.patch"
    elif ! git -C "$web_repo" apply --reverse --check "$stack_dir/local/inji-web-local.patch" 2>/dev/null; then
      echo "Frontend changes conflict with the local login patch; review $web_repo." >&2
      exit 1
    fi
    cp "$stack_dir/local/web.Dockerfile" "$web_repo/inji-web/Dockerfile.local"
    cp "$stack_dir/local/web.dockerignore" "$web_repo/inji-web/.dockerignore"
    "${compose[@]}" stop mimoto-service datashare keycloak
    docker run --rm --memory=1500m -e MAVEN_OPTS=-Xmx480m \
      -v "$repo_dir:/workspace" -v mimoto-maven-cache:/root/.m2 -w /workspace \
      maven:3.9-eclipse-temurin-21 \
      mvn -s docker-compose/local/maven-settings.xml -B package \
      -Dgpg.skip=true -Dmaven.javadoc.skip=true \
      -Dtest=CredentialMatchingServiceTest,CredentialsSupportedMetadataTest,OpenId4VciFinalWireTest,CredentialRequestServiceTest,CredentialServiceTest,IssuerConfigUtilTest,IssuersServiceTest,CustomOAuth2UserServiceTest,ConfigTest,UserMetadataServiceTest,OpenID4VPServiceTest,WalletPresentationServiceTest -DargLine=-Xmx180m
    "${compose[@]}" build mimoto-service
    "${compose[@]}" build inji-web
    "${compose[@]}" build demo-verifier
    docker run --rm inji-university-demo:local npm test
    echo "Build complete. Run: $0 up"
    ;;
  up)
    bash "$stack_dir/local/setup-university.sh"
    "${compose[@]}" up -d postgres minio nginx keycloak datashare university-issuer demo-verifier verifier-tls
    for attempt in {1..45}; do
      if "${compose[@]}" exec -T postgres psql -U postgres -d inji_mimoto -c 'SELECT 1' >/dev/null 2>&1 \
        && curl -fsS --max-time 3 http://localhost:8080/realms/inji-local/.well-known/openid-configuration >/dev/null 2>&1 \
        && curl -fsS --max-time 3 http://localhost:3006/health >/dev/null 2>&1 \
        && curl -fsS --max-time 3 http://localhost:3000/health >/dev/null 2>&1; then
        break
      fi
      if [[ "$attempt" == 45 ]]; then echo "Dependencies are not ready; inspect Compose logs." >&2; exit 1; fi
      sleep 2
    done
    "${compose[@]}" up -d mimoto-service
    for attempt in {1..60}; do
      if curl -fsS --max-time 3 http://localhost:8099/v1/mimoto/actuator/health >/dev/null 2>&1; then break; fi
      if [[ "$attempt" == 60 ]]; then echo "Mimoto is not ready; inspect its logs." >&2; exit 1; fi
      sleep 2
    done
    "${compose[@]}" up -d inji-web
    echo "Wallet: http://localhost:3004 | Library: http://localhost:3000 | Registrar: http://localhost:3006"
    ;;
  check)
    "${compose[@]}" ps
    curl -fsS --max-time 30 http://localhost:3004/ >/dev/null
    curl -fsS --max-time 30 http://localhost:3004/env.config.js >/dev/null
    curl -fsS --max-time 30 http://localhost:3004/v1/mimoto/actuator/health >/dev/null
    curl -fsS --max-time 30 http://localhost:3004/v1/mimoto/v2/issuers >/dev/null
    curl -fsS --max-time 30 http://localhost:3004/v1/mimoto/issuers/Mock/well-known-proxy >/dev/null
    curl -fsS --max-time 30 http://localhost:3000/ >/dev/null
    curl -fsS --max-time 30 http://localhost:3006/health >/dev/null
    curl -fsS --max-time 30 http://localhost:3004/v1/mimoto/issuers/University/configuration >/dev/null
    echo "Local HTTP checks passed."
    ;;
  down) "${compose[@]}" down ;;
  logs) "${compose[@]}" logs --tail=100 "${@:2}" ;;
  *) echo "Usage: $0 {build|up|check|down|logs [service]}" >&2; exit 2 ;;
esac
