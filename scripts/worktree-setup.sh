#!/usr/bin/env bash
set -euo pipefail

pnpm install

git subtree pull -P repos/effect --squash https://github.com/effect-ts/effect-smol.git main
