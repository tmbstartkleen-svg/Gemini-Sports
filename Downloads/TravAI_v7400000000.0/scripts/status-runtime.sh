#!/bin/bash
set -euo pipefail
curl -fsS http://127.0.0.1:${TRAVAI_PORT:-4783}/api/v5000000000/control | python3 -m json.tool
