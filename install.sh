#!/usr/bin/env bash

set -e

bun -v 1>/dev/null

cat .env.example > .env.development
echo ".env.development file has been created"

cat .env.example > .env.test
sed -i "s/^PORT=[0-9]\+/PORT=9320/" .env.test
echo ".env.test file has been created"

bun install --frozen-lockfile
bun --env-file=.env.development run init-db.ts

echo
echo "Done"