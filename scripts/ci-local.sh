#!/usr/bin/env bash
# Runs the same stages as .github/workflows/ci.yml on this machine, for when GitHub Actions cannot start jobs
# (account billing) or before a push. Usage: scripts/ci-local.sh [--skip-slow]   (slow = lighthouse)
# Needs: node, gitleaks, Google Chrome (PW_CHANNEL=chrome / CHROME_PATH). Exits 1 on the first failing stage.
set -uo pipefail
cd "$(dirname "$0")/.."
LIVE_URL="${LIVE_URL:-https://footing.edycu.dev}"
CHROME="${CHROME_PATH:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
fail=0
stage() { local name="$1"; shift; printf '\n── %s\n' "$name"; if "$@"; then echo "PASS  $name"; else echo "FAIL  $name"; fail=1; fi; }

stage "1 lint"                 npm run lint
stage "1 typecheck"            npm run typecheck
stage "1 unit tests + coverage floor" npm run test:coverage
stage "2 gitleaks (all history)" gitleaks detect --source . --log-opts="--all" --redact
stage "2 npm audit (high+critical)" npm audit --audit-level=high
stage "2 npm audit signatures" npm audit signatures
stage "2 licences (no GPL/AGPL)" npx --yes license-checker --production --failOn "GPL-2.0;GPL-3.0;AGPL-3.0" --summary
stage "3 production build"     env NEXT_PUBLIC_FIREBASE_API_KEY=ci-placeholder NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ci-placeholder.firebaseapp.com NEXT_PUBLIC_FIREBASE_PROJECT_ID=ci-placeholder NEXT_PUBLIC_FIREBASE_APP_ID=ci-placeholder NEXT_PUBLIC_RECAPTCHA_SITE_KEY=ci-placeholder npm run build
bundle() { local kb; kb=$(find .next/static -name '*.js' -print0 | xargs -0 cat | gzip -9 | wc -c | awk '{printf "%d", $1/1024}'); echo "client JS gzip ${kb} KB (budget 900)"; [ "$kb" -le 900 ]; }
stage "3 bundle budget"        bundle
stage "5 E2E on $LIVE_URL"     env BASE_URL="$LIVE_URL" PW_CHANNEL=chrome npx playwright test
if [ "${1:-}" != "--skip-slow" ]; then
  stage "6 lighthouse gates on $LIVE_URL" env CHROME_PATH="$CHROME" npx lhci autorun --config=lighthouserc.json
fi
echo; [ "$fail" -eq 0 ] && echo "ALL STAGES PASSED" || echo "SOME STAGES FAILED"
exit "$fail"
