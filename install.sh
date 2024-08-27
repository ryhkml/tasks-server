#!/usr/bin/env bash

set -e

bun -v 1>/dev/null

cat .env.example > .env.development
echo ".env.development file has been created"

cat .env.example > .env.production
echo ".env.production file has been created"

bun install --frozen-lockfile
bun run init:db:dev

echo
echo "Done"