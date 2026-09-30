#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dotnet build "$ROOT/src/Jampanion.Web/Jampanion.Web.csproj" -c Release
dotnet run --project "$ROOT/scripts/HomeStateTests/HomeStateTests.csproj" -c Release
