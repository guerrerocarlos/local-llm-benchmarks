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
    console.error('Usage: node run-tests.js <solution.js>');
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
      await withTimeout(fn(), 3000, `${name} timed out`);
      results.push({ name, pass: true });
    } catch (err) {
      results.push({ name, pass: false, error: String(err && err.message ? err.message : err) });
    }
  };

  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg || 'assertion failed');
  };

  await test('exports are present', async () => {
    assert(typeof mod.LRUCache === 'function', 'LRUCache missing');
    assert(typeof mod.mapLimit === 'function', 'mapLimit missing');
  });

  await test('LRU basic set/get/has/delete', async () => {
    let t = 0;
    const c = new mod.LRUCache({ maxSize: 2, ttlMs: 100, now: () => t });
    c.set('a', 1);
    assert(c.get('a') === 1, 'get a');
    assert(c.has('a') === true, 'has a true');
    assert(c.delete('a') === true, 'delete a true');
    assert(c.get('a') === undefined, 'a deleted');
    assert(c.delete('a') === false, 'delete a false');
  });

  await test('LRU eviction order', async () => {
    let t = 0;
    const c = new mod.LRUCache({ maxSize: 2, ttlMs: 100, now: () => t });
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    assert(c.get('b') === undefined, 'b should be evicted');
    assert(c.get('a') === 1, 'a remains');
    assert(c.get('c') === 3, 'c remains');
  });

  await test('LRU set existing promotes recency', async () => {
    let t = 0;
    const c = new mod.LRUCache({ maxSize: 2, ttlMs: 100, now: () => t });
    c.set('a', 1);
    c.set('b', 2);
    c.set('a', 11);
    c.set('c', 3);
    assert(c.get('b') === undefined, 'b evicted');
    assert(c.get('a') === 11, 'a updated');
  });

  await test('TTL expiration with default ttl', async () => {
    let t = 0;
    const c = new mod.LRUCache({ maxSize: 3, ttlMs: 10, now: () => t });
    c.set('a', 1);
    t = 9;
    assert(c.get('a') === 1, 'not expired yet');
    t = 11;
    assert(c.get('a') === undefined, 'expired');
    assert(c.size() === 0, 'removed after expiration');
  });

  await test('TTL override and immediate expiration', async () => {
    let t = 0;
    const c = new mod.LRUCache({ maxSize: 3, ttlMs: 100, now: () => t });
    c.set('a', 1, 5);
    c.set('b', 2, 0);
    c.set('c', 3, -1);
    assert(c.has('b') === false, 'b should not be retained');
    assert(c.has('c') === false, 'c should not be retained');
    t = 6;
    assert(c.get('a') === undefined, 'a expired by override');
  });

  await test('keys() order MRU -> LRU and ignores expired', async () => {
    let t = 0;
    const c = new mod.LRUCache({ maxSize: 5, ttlMs: 100, now: () => t });
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3, 1);
    c.get('a');
    t = 2;
    const keys = c.keys();
    assert(Array.isArray(keys), 'keys should return array');
    assert(keys.join(',') === 'a,b', `got ${keys.join(',')}`);
  });

  await test('size() counts only non-expired', async () => {
    let t = 0;
    const c = new mod.LRUCache({ maxSize: 5, ttlMs: 100, now: () => t });
    c.set('a', 1, 1);
    c.set('b', 2);
    t = 2;
    assert(c.size() === 1, 'only b remains');
  });

  await test('mapLimit preserves order and values', async () => {
    const out = await mod.mapLimit([3, 1, 2], 2, async (x) => {
      await new Promise((r) => setTimeout(r, x * 5));
      return x * 10;
    });
    assert(out.join(',') === '30,10,20', `got ${out.join(',')}`);
  });

  await test('mapLimit enforces concurrency limit', async () => {
    let active = 0;
    let maxSeen = 0;
    await mod.mapLimit([1, 2, 3, 4, 5], 2, async () => {
      active += 1;
      maxSeen = Math.max(maxSeen, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return 1;
    });
    assert(maxSeen <= 2, `max concurrency was ${maxSeen}`);
  });

  await test('mapLimit supports sync mapper', async () => {
    const out = await mod.mapLimit([1, 2, 3], 2, (x) => x + 1);
    assert(out.join(',') === '2,3,4', `got ${out.join(',')}`);
  });

  await test('mapLimit rejects on first error', async () => {
    let started = 0;
    let rejected = false;
    try {
      await mod.mapLimit([1, 2, 3, 4], 2, async (x) => {
        started += 1;
        if (x === 2) throw new Error('boom');
        await new Promise((r) => setTimeout(r, 50));
        return x;
      });
    } catch (err) {
      rejected = /boom/.test(String(err && err.message ? err.message : err));
    }
    assert(rejected, 'should reject with mapper error');
    assert(started <= 3, `should avoid starting all tasks after rejection, started=${started}`);
  });

  const failed = results.filter((r) => !r.pass);
  if (unhandled.length) {
    results.push({
      name: 'no unhandled promise rejections',
      pass: false,
      error: unhandled.join(' | '),
    });
  }
  printResult(results);
  const totalFailed = results.filter((r) => !r.pass).length;
  process.exit(totalFailed ? 1 : 0);
}

function printResult(results) {
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const score = Math.round((passed / total) * 1000) / 10;
  const out = { passed, total, score, results };
  console.log(JSON.stringify(out, null, 2));
}

function withTimeout(promise, ms, msg) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(msg)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

run().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
