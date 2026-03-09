# Local LLM JS/TS Benchmark (Ollama + RTX 5070 12GB)

This repository benchmarks local coding models for JavaScript/TypeScript-style tasks on a machine with:

- GPU: `NVIDIA GeForce RTX 5070`
- VRAM: `12227 MiB` (~12GB)
- Runtime: local `ollama` (user-space install)

The goal is to compare model quality, runtime, and practical fit under VRAM constraints.

## What This Project Contains

- A single standardized coding task prompt.
- An evaluator with deterministic tests.
- A runner that:
1. pulls each model
2. generates a solution for the same prompt
3. evaluates the output
4. writes per-model artifacts
- Result summaries (`CSV` + `Markdown`).

## Requested Models vs Evaluated Tags

Because Ollama tags differ from user-facing names, this mapping was used:

- `Qwen 2.5 Coder 14B Instruct` -> `qwen2.5-coder:14b`
- `Qwen 3 Coder 14B Instruct` -> `qwen3-coder:30b` (no `14b` tag available)
- `DeepSeek Coder V2 Lite` -> `deepseek-coder-v2:16b`
- `DeepCoder 14B` -> `deepcoder:14b`
- `Devstral Small` -> `devstral-small-2:24b`
- `Devstral 2 ~24B` -> `devstral-small-2:24b` (`devstral-2` tag is 123B)

Source file: [`runs/model_mapping.txt`](/home/gnu/local-llm-tests/runs/model_mapping.txt)

## Benchmark Task

The prompt asks each model to implement in one JS file:

- `LRUCache` with TTL + LRU behavior
- `mapLimit` with concurrency control + rejection handling

Prompt source:
- [`benchmark/task/prompt.txt`](/home/gnu/local-llm-tests/benchmark/task/prompt.txt)

## Evaluator

The evaluator runs behavioral tests and reports:

- `passed`
- `total`
- `score` (percentage)
- per-test failures

Evaluator source:
- [`benchmark/evaluator/run-tests.js`](/home/gnu/local-llm-tests/benchmark/evaluator/run-tests.js)

## Runner Scripts

- Main benchmark runner:
  - [`scripts/run_benchmark.sh`](/home/gnu/local-llm-tests/scripts/run_benchmark.sh)
- Code extraction helper:
  - [`scripts/extract-code.js`](/home/gnu/local-llm-tests/scripts/extract-code.js)
- Early model pull resolver:
  - [`pull_models.sh`](/home/gnu/local-llm-tests/pull_models.sh)

## Results Summary (Current Snapshot)

Quality (final recheck):

- `qwen3-coder:30b` -> `11/12` (`91.7`)
- `deepseek-coder-v2:16b` -> `7/12` (`58.3`)
- `qwen2.5-coder:14b` -> `7/12` (`58.3`)
- `deepcoder:14b` -> `0/1` (invalid output)
- `devstral-small-2:24b` -> `0/1` (truncated output)

Primary result files:

- [`runs/FINAL_RESULTS.md`](/home/gnu/local-llm-tests/runs/FINAL_RESULTS.md)
- [`runs/final_scores.csv`](/home/gnu/local-llm-tests/runs/final_scores.csv)

Generation time for this task (`gen_seconds`):

- `qwen2.5-coder:14b` -> `22s`
- `qwen3-coder:30b` -> `33s`
- `deepseek-coder-v2:16b` -> `26s`
- `deepcoder:14b` -> `20s`
- `devstral-small-2:24b` -> `100s`

Timing source:
- [`runs/summary.csv`](/home/gnu/local-llm-tests/runs/summary.csv)

Measured decode speed (`eval_count / eval_duration`):

- `qwen2.5-coder:14b` -> `65.19 tok/s`
- `qwen3-coder:30b` -> `32.12 tok/s`
- `deepseek-coder-v2:16b` -> `165.15 tok/s`
- `deepcoder:14b` -> `62.27 tok/s` (`done_reason=length`)
- `devstral-small-2:24b` -> `10.40 tok/s` (`done_reason=length`)

Token speed source:
- [`runs/token_speed.csv`](/home/gnu/local-llm-tests/runs/token_speed.csv)

## Why Some Models Failed

- `deepcoder:14b` output started with reasoning (`<think>...`) instead of pure code.
  - JS parse failed with `Unexpected token '<'`.
- `devstral-small-2:24b` output was cut mid-function.
  - JS parse failed with `Unexpected end of input`.

Artifacts:

- [`runs/deepcoder_14b/solution.js`](/home/gnu/local-llm-tests/runs/deepcoder_14b/solution.js)
- [`runs/devstral_small_2_24b/solution.js`](/home/gnu/local-llm-tests/runs/devstral_small_2_24b/solution.js)

## GPU Usage Notes

This benchmark used GPU inference (CUDA) with CPU offload for larger models.

Observed behavior in logs:

- model layers partially offloaded to GPU for large models
- high VRAM usage close to 12GB
- large models (30B / 24B class) slower and more offloaded

Log files:

- [`/.logs/ollama-serve-benchmark.log`](/home/gnu/local-llm-tests/.logs/ollama-serve-benchmark.log)
- [`/.logs/ollama-serve-tokenspeed.log`](/home/gnu/local-llm-tests/.logs/ollama-serve-tokenspeed.log)

## Repository Structure

Top-level:

- `benchmark/` -> task + evaluator
- `scripts/` -> runner and helpers
- `runs/` -> latest benchmark outputs
- `runs_prev_*` -> earlier interrupted/partial runs
- `.logs/` -> Ollama server and pull logs

Per model folder (example: `runs/qwen3_coder_30b/`):

- `model.txt` -> model tag
- `prompt.txt` -> exact prompt used
- `raw_response.txt` -> raw model output
- `solution.js` -> extracted code used for testing
- `test_result*.json` -> evaluator outputs
- `generation.log` -> generation metadata (`generated_chars`)
- `pull.log` -> model pull output

## How To Re-run

From repository root:

```bash
./scripts/run_benchmark.sh
```

This runs the full benchmark against all configured models and rewrites `runs/`.

If you want fresh token-speed measurements:

- use Ollama `/api/generate` responses and record:
  - `eval_count`
  - `eval_duration`
  - `done_reason`

## Caveats and Interpretation

- This is a single-task benchmark; rankings may change across task types.
- Some models hit generation length limits (`done_reason=length`) and were truncated.
- `Status=FAIL` in final table indicates evaluator process exit on at least one failed test; it does not mean pull/generation failed.
- Runtime depends on offload behavior (GPU + CPU + RAM bandwidth), not only parameter count.

## Practical Recommendation (for this machine)

Given current results on ~12GB VRAM:

- Best quality: `qwen3-coder:30b`
- Best speed-quality balance: `deepseek-coder-v2:16b`
- Keep `qwen2.5-coder:14b` as fallback

