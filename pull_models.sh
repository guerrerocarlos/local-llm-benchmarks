#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
mkdir -p /home/gnu/local-llm-tests/.logs
log=/home/gnu/local-llm-tests/.logs/model-pulls.log
: > "$log"

declare -A groups
groups[qwen25]="qwen2.5-coder:14b qwen2.5-coder:14b-instruct qwen2.5-coder:latest"
groups[qwen3]="qwen3-coder:14b qwen3-coder:14b-instruct qwen3:14b"
groups[deepseekv2lite]="deepseek-coder-v2:16b deepseek-coder-v2:lite deepseek-coder-v2"
groups[deepcoder14b]="deepcoder:14b deepcoder:latest"
groups[devstral_small]="devstral:small devstral:latest"
groups[devstral2_24b]="devstral2:24b devstral:24b devstral2:latest"

order=(qwen25 qwen3 deepseekv2lite deepcoder14b devstral_small devstral2_24b)

echo "model_group,resolved_tag,status" > /home/gnu/local-llm-tests/model_resolution.csv

for g in "${order[@]}"; do
  resolved=""
  status="failed"
  for m in ${groups[$g]}; do
    echo "[$(date -Is)] trying $g => $m" | tee -a "$log"
    if ollama pull "$m" >> "$log" 2>&1; then
      resolved="$m"
      status="ok"
      break
    fi
  done
  echo "$g,$resolved,$status" | tee -a /home/gnu/local-llm-tests/model_resolution.csv
  if [[ "$status" != "ok" ]]; then
    echo "[$(date -Is)] WARNING: could not resolve $g" | tee -a "$log"
  fi
done

ollama list > /home/gnu/local-llm-tests/installed_models.txt
