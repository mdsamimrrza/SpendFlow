#!/usr/bin/env bash
#
# EAS Build pre-install hook (package.json: "eas-build-pre-install").
#
# EAS workers ship global Yarn 1.x with corepack disabled, so the worker's
# `yarn install` aborts on our `packageManager: yarn@4.9.1` pin instead of
# delegating to Yarn Berry. This hook activates Yarn 4.9.1 through corepack
# before the install step runs. Fails LOUDLY (non-zero exit) if activation
# did not take effect, so the build log shows the real cause.
#
set -euo pipefail

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export COREPACK_HOME="${COREPACK_HOME:-$HOME/.cache/corepack}"
mkdir -p "$COREPACK_HOME"

echo "eas-build-pre-install: user=$(whoami), node=$(node --version), yarn=$(yarn --version)"

if ! command -v corepack >/dev/null 2>&1; then
  echo "eas-build-pre-install: ERROR corepack binary not found on PATH=$PATH" >&2
  exit 1
fi

if sudo -n true >/dev/null 2>&1; then
  echo "eas-build-pre-install: activating via sudo corepack enable"
  sudo corepack enable
else
  echo "eas-build-pre-install: no passwordless sudo, using per-user shims"
  mkdir -p "$HOME/.local/bin"
  corepack enable --install-directory "$HOME/.local/bin"
  export PATH="$HOME/.local/bin:$PATH"
fi

corepack prepare yarn@4.9.1 --activate

ACTIVE="$(yarn --version)"
echo "eas-build-pre-install: active yarn version: $ACTIVE"
case "$ACTIVE" in
  4.*) echo "eas-build-pre-install: OK" ;;
  *)
    echo "eas-build-pre-install: ERROR yarn 4 not active (got $ACTIVE)" >&2
    exit 1
    ;;
esac
