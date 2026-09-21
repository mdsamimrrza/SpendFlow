#!/usr/bin/env bash
#
# EAS Build pre-install hook (package.json: "eas-build-pre-install").
#
# EAS workers ship global Yarn 1.x with corepack disabled, so the worker's
# `yarn install` aborts on our `packageManager: yarn@4.9.1` pin instead of
# delegating to Yarn Berry. This hook activates Yarn 4.9.1 through corepack
# before the install step runs. Idempotent and harmless on local machines.
#
set -uo pipefail

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export COREPACK_HOME="${COREPACK_HOME:-$HOME/.cache/corepack}"
mkdir -p "$COREPACK_HOME"

if command -v corepack >/dev/null 2>&1; then
  if sudo -n true >/dev/null 2>&1; then
    # Preferred: system-wide shims so the later `yarn install` step resolves
    # through corepack with no PATH tricks.
    sudo corepack enable
  else
    # No passwordless sudo: per-user shims. Best effort — the install step
    # shares $HOME, and Ubuntu login shells pick up ~/.local/bin.
    mkdir -p "$HOME/.local/bin"
    corepack enable --install-directory "$HOME/.local/bin"
    export PATH="$HOME/.local/bin:$PATH"
  fi
  corepack prepare yarn@4.9.1 --activate
  yarn --version
else
  echo "eas-build-pre-install: corepack not found, skipping yarn activation" >&2
fi
