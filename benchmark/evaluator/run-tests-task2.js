#!/usr/bin/env node
'use strict';

const path = require('node:path');
const unhandled = [];
process.on('unhandledRejection', (reason) => {
  unhandled.push(String(reason && reason.message ? reason.message : reason));
});

async function run() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node run-tests-task2.js <solution.js>');
    process.exit(2);
  }

  const abs = path.resolve(target);
  let mod;
  try {
    mod = require(abs);
  } catch (err) {
    printResult([{ name: 'module loads', pass: false, error: String(err) }]);
    process.exit(1);
  }

  const results = [];
  const test = async (name, fn) => {
    try {
      await withTimeout(fn(), 3500, `${name} timed out`);
      results.push({ name, pass: true });
    } catch (err) {
      results.push({ name, pass: false, error: String(err && err.message ? err.message : err) });
    }
  };

  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg || 'assertion failed');
  };

  await test('exports are present', async () => {
    assert(typeof mod.retryAsync === 'function', 'retryAsync missing');
    assert(typeof mod.topKFrequentWords === 'function', 'topKFrequentWords missing');
  });

  await test('retryAsync succeeds first attempt', async () => {
    let calls = 0;
    const out = await mod.retryAsync(() => { calls += 1; return 42; }, { retries: 3 });
    assert(out === 42, 'wrong output');
    assert(calls === 1, 'unexpected retries');
  });

  await test('retryAsync retries and succeeds', async () => {
    let calls = 0;
    const out = await mod.retryAsync(() => {
      calls += 1;
      if (calls < 3) throw new Error('nope');
      return 'ok';
    }, { retries: 5, minDelayMs: 1, factor: 1 });
    assert(out === 'ok', 'should eventually succeed');
    assert(calls === 3, `calls=${calls}`);
  });

  await test('retryAsync stops at retries limit', async () => {
    let calls = 0;
    let failed = false;
    try {
      await mod.retryAsync(() => {
        calls += 1;
        throw new Error('always');
      }, { retries: 2, minDelayMs: 0 });
    } catch (e) {
      failed = /always/.test(String(e.message || e));
    }
    assert(failed, 'should reject with last error');
    assert(calls === 3, `expected 3 calls, got ${calls}`);
  });

  await test('retryAsync shouldRetry can short-circuit', async () => {
    let calls = 0;
    let failed = false;
    try {
      await mod.retryAsync(() => {
        calls += 1;
        throw new Error('stop-now');
      }, {
        retries: 5,
        shouldRetry: (err, attemptIndex) => attemptIndex < 1 && !String(err.message || err).includes('stop-now')
      });
    } catch (e) {
      failed = /stop-now/.test(String(e.message || e));
    }
    assert(failed, 'must fail');
    assert(calls === 1, `should not retry, calls=${calls}`);
  });

  await test('retryAsync honors abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    let failed = false;
    try {
      await mod.retryAsync(async () => 1, { retries: 2, signal: controller.signal });
    } catch (e) {
      failed = /abort/i.test(String(e.name || '') + String(e.message || e));
    }
    assert(failed, 'should reject as aborted');
  });

  await test('topKFrequentWords basic counting/sorting', async () => {
    const out = mod.topKFrequentWords('b a a b c b', 2);
    assert(Array.isArray(out), 'must return array');
    assert(out.length === 2, 'len');
    assert(out[0].word === 'b' && out[0].count === 3, 'first');
    assert(out[1].word === 'a' && out[1].count === 2, 'second');
  });

  await test('topKFrequentWords case-insensitive + punctuation', async () => {
    const out = mod.topKFrequentWords("Hello, HELLO! don't; don't... world", 3);
    const key = out.map((x) => `${x.word}:${x.count}`).join(',');
    assert(key.includes("hello:2"), key);
    assert(key.includes("don't:2"), key);
  });

  await test('topKFrequentWords tie-break alphabetical', async () => {
    const out = mod.topKFrequentWords('beta alpha beta alpha gamma', 2);
    assert(out[0].word === 'alpha', 'alpha should come first on tie');
    assert(out[1].word === 'beta', 'beta second');
  });

  await test('topKFrequentWords stopWords + k=0', async () => {
    const out0 = mod.topKFrequentWords('a a b b c', 0);
    assert(Array.isArray(out0) && out0.length === 0, 'k=0 must be []');
    const out = mod.topKFrequentWords('a a b b c', 5, { stopWords: ['a', 'C'] });
    const key = out.map((x) => `${x.word}:${x.count}`).join(',');
    assert(key === 'b:2', key);
  });

  if (unhandled.length) {
    results.push({ name: 'no unhandled promise rejections', pass: false, error: unhandled.join(' | ') });
  }

  const failed = results.filter((r) => !r.pass).length;
  printResult(results);
  process.exit(failed ? 1 : 0);
}

function withTimeout(promise, ms, msg) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function printResult(results) {
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const score = Math.round((passed / total) * 1000) / 10;
  console.log(JSON.stringify({ passed, total, score, results }, null, 2));
}

run().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
