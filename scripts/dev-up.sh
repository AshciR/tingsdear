#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "tearing down any existing stack and volumes..."
docker compose down -v

echo "starting docker compose stack..."
docker compose up -d --wait

echo "running migrations..."
yarn tsx scripts/migrate.ts

echo "done."
