#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
ROOT="/home/gnu/local-llm-tests"
RUNS_DIR="$ROOT/runs"
LOG_DIR="$ROOT/.logs"
PROMPT_FILE="$ROOT/benchmark/task/prompt.txt"
EVAL_SCRIPT="$ROOT/benchmark/evaluator/run-tests.js"
EXTRACT_SCRIPT="$ROOT/scripts/extract-code.js"

mkdir -p "$RUNS_DIR" "$LOG_DIR"

declare -a ALIASES=(
  "qwen25_coder_14b"
  "qwen3_coder_30b"
  "deepseek_coder_v2_16b"
  "deepcoder_14b"
  "devstral_small_2_24b"
)

declare -A MODELS=(
  [qwen25_coder_14b]="qwen2.5-coder:14b"
  [qwen3_coder_30b]="qwen3-coder:30b"
  [deepseek_coder_v2_16b]="deepseek-coder-v2:16b"
  [deepcoder_14b]="deepcoder:14b"
  [devstral_small_2_24b]="devstral-small-2:24b"
)

cat > "$RUNS_DIR/model_mapping.txt" <<'MAP'
Requested -> Evaluated model tag
Qwen 2.5 Coder 14B Instruct -> qwen2.5-coder:14b
Qwen 3 Coder 14B Instruct -> qwen3-coder:30b (14b tag not available on Ollama)
DeepSeek Coder V2 Lite -> deepseek-coder-v2:16b
DeepCoder 14B -> deepcoder:14b
Devstral Small -> devstral-small-2:24b
Devstral 2 ~24B -> devstral-small-2:24b (devstral-2 is 123b)
MAP

SERVER_LOG="$LOG_DIR/ollama-serve-benchmark.log"
: > "$SERVER_LOG"

# Start ollama server for this script execution only.
OLLAMA_HOST=127.0.0.1:11434 "$HOME/.local/bin/ollama" serve >> "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if "$HOME/.local/bin/ollama" list >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! "$HOME/.local/bin/ollama" list >/dev/null 2>&1; then
  echo "Failed to start Ollama server. See $SERVER_LOG" >&2
  exit 1
fi

echo "alias,model,pull_ok,gen_ok,test_ok,passed,total,score,gen_seconds" > "$RUNS_DIR/summary.csv"

for alias in "${ALIASES[@]}"; do
  model="${MODELS[$alias]}"
  out_dir="$RUNS_DIR/$alias"
  mkdir -p "$out_dir"

  cp "$PROMPT_FILE" "$out_dir/prompt.txt"
  printf "%s\n" "$model" > "$out_dir/model.txt"

  pull_ok=0
  gen_ok=0
  test_ok=0
  passed=0
  total=0
  score=0

  if "$HOME/.local/bin/ollama" pull "$model" > "$out_dir/pull.log" 2>&1; then
    pull_ok=1
  else
    echo "$alias,$model,$pull_ok,$gen_ok,$test_ok,$passed,$total,$score,0" >> "$RUNS_DIR/summary.csv"
    continue
  fi

  start_ts=$(date +%s)
  if timeout 900s python3 - "$model" "$PROMPT_FILE" "$out_dir/raw_response.txt" > "$out_dir/generation.log" 2>&1 <<'PY'
import json
import sys
import urllib.request

model = sys.argv[1]
prompt_file = sys.argv[2]
out_file = sys.argv[3]

with open(prompt_file, "r", encoding="utf-8") as f:
    prompt = f.read()

payload = {
    "model": model,
    "prompt": prompt,
    "stream": False,
    "options": {
        "temperature": 0,
        "num_predict": 900
    }
}

req = urllib.request.Request(
    "http://127.0.0.1:11434/api/generate",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

with urllib.request.urlopen(req, timeout=900) as resp:
    body = json.loads(resp.read().decode("utf-8"))

text = body.get("response", "")
with open(out_file, "w", encoding="utf-8") as f:
    f.write(text)
print("generated_chars", len(text))
PY
  then
    gen_ok=1
  fi
  end_ts=$(date +%s)
  gen_seconds=$((end_ts - start_ts))

  if [[ "$gen_ok" -eq 1 ]]; then
    node "$EXTRACT_SCRIPT" "$out_dir/raw_response.txt" "$out_dir/solution.js"
    if node "$EVAL_SCRIPT" "$out_dir/solution.js" > "$out_dir/test_result.json" 2> "$out_dir/test_stderr.log"; then
      test_ok=1
    fi

    if [[ -s "$out_dir/test_result.json" ]]; then
      passed=$(node -e "const fs=require('fs');try{const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(x.passed||0)}catch{console.log(0)}" "$out_dir/test_result.json")
      total=$(node -e "const fs=require('fs');try{const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(x.total||0)}catch{console.log(0)}" "$out_dir/test_result.json")
      score=$(node -e "const fs=require('fs');try{const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(x.score||0)}catch{console.log(0)}" "$out_dir/test_result.json")
    fi
  else
    gen_seconds=0
  fi

  echo "$alias,$model,$pull_ok,$gen_ok,$test_ok,$passed,$total,$score,$gen_seconds" >> "$RUNS_DIR/summary.csv"
done

# Render markdown summary for quick reading.
node - <<'JS'
const fs = require('fs');
const p = '/home/gnu/local-llm-tests/runs/summary.csv';
const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
const rows = lines.slice(1).map((l) => {
  const [alias, model, pull_ok, gen_ok, test_ok, passed, total, score, gen_seconds] = l.split(',');
  return { alias, model, pull_ok, gen_ok, test_ok, passed, total, score, gen_seconds };
});
let md = '# Benchmark Summary\n\n';
md += '| Alias | Model | Pull | Generate | Tests | Score | Time(s) |\n';
md += '|---|---|---:|---:|---:|---:|---:|\n';
for (const r of rows) {
  md += `| ${r.alias} | ${r.model} | ${r.pull_ok} | ${r.gen_ok} | ${r.passed}/${r.total} | ${r.score} | ${r.gen_seconds} |\n`;
}
fs.writeFileSync('/home/gnu/local-llm-tests/runs/SUMMARY.md', md);
JS

cat "$RUNS_DIR/SUMMARY.md"
