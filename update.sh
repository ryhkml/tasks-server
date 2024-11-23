#!/usr/bin/env bash

set -e

rm -rf node_modules

bun install --frozen-lockfile

echo "Update done"