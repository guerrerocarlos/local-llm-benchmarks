#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/gnu/local-llm-tests"
RUNS_DIR="$ROOT/codex_runs"
LOG_DIR="$ROOT/.logs"
PROMPT_FILE="$ROOT/benchmark/task/prompt_codex.txt"
EVAL_SCRIPT="$ROOT/benchmark/evaluator/run-tests.js"
EXTRACT_SCRIPT="$ROOT/scripts/extract-code.js"

export PATH="$HOME/.local/bin:$PATH"
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

echo "alias,model,codex_ok,test_ok,passed,total,score,wall_seconds,output_tokens,tok_per_s" > "$RUNS_DIR/summary.csv"

SERVER_LOG="$LOG_DIR/ollama-serve-codex-benchmark.log"
: > "$SERVER_LOG"
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

for alias in "${ALIASES[@]}"; do
  model="${MODELS[$alias]}"
  out_dir="$RUNS_DIR/$alias"
  mkdir -p "$out_dir"

  cp "$PROMPT_FILE" "$out_dir/prompt.txt"
  printf "%s\n" "$model" > "$out_dir/model.txt"

  codex_ok=0
  test_ok=0
  passed=0
  total=0
  score=0
  output_tokens=0
  tok_per_s=0

  start_ts=$(date +%s)
  if timeout 1200s codex exec \
      --oss --local-provider ollama \
      -m "$model" \
      --skip-git-repo-check \
      --sandbox read-only \
      --json \
      -o "$out_dir/raw_response.txt" \
      "$(cat "$PROMPT_FILE")" \
      > "$out_dir/codex_events.jsonl" 2> "$out_dir/codex_stderr.log"; then
    codex_ok=1
  fi
  end_ts=$(date +%s)
  wall_seconds=$((end_ts - start_ts))

  if [[ "$codex_ok" -eq 1 ]]; then
    node - <<'JS' "$out_dir/codex_events.jsonl" "$out_dir/usage.json"
const fs = require('fs');
const inFile = process.argv[2];
const outFile = process.argv[3];
const lines = fs.readFileSync(inFile, 'utf8').trim().split('\n').filter(Boolean);
let usage = {input_tokens:0, output_tokens:0, cached_input_tokens:0};
for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'turn.completed' && obj.usage) usage = obj.usage;
  } catch {}
}
fs.writeFileSync(outFile, JSON.stringify(usage, null, 2));
JS

    output_tokens=$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(x.output_tokens||0)" "$out_dir/usage.json")
    tok_per_s=$(node -e "const t=Number(process.argv[1]); const w=Number(process.argv[2]); console.log(w>0?(t/w).toFixed(2):'0.00')" "$output_tokens" "$wall_seconds")

    node "$EXTRACT_SCRIPT" "$out_dir/raw_response.txt" "$out_dir/solution.js"
    if timeout 120s node "$EVAL_SCRIPT" "$out_dir/solution.js" > "$out_dir/test_result.json" 2> "$out_dir/test_stderr.log"; then
      test_ok=1
    fi

    if [[ -s "$out_dir/test_result.json" ]]; then
      passed=$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(x.passed||0)" "$out_dir/test_result.json")
      total=$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(x.total||0)" "$out_dir/test_result.json")
      score=$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(x.score||0)" "$out_dir/test_result.json")
    fi
  else
    wall_seconds=0
  fi

  echo "$alias,$model,$codex_ok,$test_ok,$passed,$total,$score,$wall_seconds,$output_tokens,$tok_per_s" >> "$RUNS_DIR/summary.csv"
done

node - <<'JS'
const fs = require('fs');
const p = '/home/gnu/local-llm-tests/codex_runs/summary.csv';
const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
const rows = lines.slice(1).map((l) => {
  const [alias,model,codex_ok,test_ok,passed,total,score,wall_seconds,output_tokens,tok_per_s] = l.split(',');
  return {alias,model,codex_ok,test_ok,passed,total,score,wall_seconds,output_tokens,tok_per_s};
});
rows.sort((a,b)=>Number(b.score)-Number(a.score));
let md = '# Codex Benchmark Summary\n\n';
md += '| Rank | Alias | Model | Codex | Tests | Score | Time(s) | Output Tokens | tok/s (wall) |\n';
md += '|---:|---|---|---:|---:|---:|---:|---:|---:|\n';
rows.forEach((r,i)=>{
  md += `| ${i+1} | ${r.alias} | ${r.model} | ${r.codex_ok} | ${r.passed}/${r.total} | ${r.score} | ${r.wall_seconds} | ${r.output_tokens} | ${r.tok_per_s} |\n`;
});
fs.writeFileSync('/home/gnu/local-llm-tests/codex_runs/SUMMARY.md', md);
console.log(md);
JS
