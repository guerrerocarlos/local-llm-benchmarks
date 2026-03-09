class LRUCache {
  constructor({ maxSize, ttlMs = Infinity, now = () => Date.now() }) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.now = now;
    this.cache = new Map();
    this.order = new Map();
    this.lastCleanup = 0;
  }

  set(key, value, ttlMsOverride = null) {
    const ttl = ttlMsOverride !== null ? ttlMsOverride : this.ttlMs;
    const expiration = ttl > 0 ? this.now() + ttl : 0;
    this.cache.set(key, { value, expiration });
    this.order.delete(key);
    this.order.set(key, expiration);
    if (this.cache.size > this.maxSize) {
      this.evict();
    }
  }

  get(key) {
    this.cleanupExpired();
    if (this.cache.has(key)) {
      const { value, expiration } = this.cache.get(key);
      if (expiration > this.now()) {
        this.order.delete(key);
        this.order.set(key, expiration);
        return value;
      }
      this.cache.delete(key);
      this.order.delete(key);
    }
    return undefined;
  }

  has(key) {
    this.cleanupExpired();
    return this.cache.has(key) && this.cache.get(key).expiration > this.now();
  }

  delete(key) {
    this.cleanupExpired();
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.order.delete(key);
      return true;
    }
    return false;
  }

  size() {
    this.cleanupExpired();
    return this.cache.size;
  }

  keys() {
    this.cleanupExpired();
    return Array.from(this.order.keys()).filter(key => this.cache.get(key).expiration > this.now());
  }

  evict() {
    let minKey = null;
    let minExpiration = Infinity;
    for (const [key, expiration] of this.order) {
      if (expiration < minExpiration) {
        minExpiration = expiration;
        minKey = key;
      }
    }
    if (minKey !== null) {
      this.cache.delete(minKey);
      this.order.delete(minKey);
    }
  }

  cleanupExpired() {
    const now = this.now();
    if (now - this.lastCleanup < 1000) return;
    this.lastCleanup = now;
    for (const [key, { expiration }] of this.cache) {
      if (expiration <= now) {
        this.cache.delete(key);
        this.order.delete(key);
      }
    }
  }
}

async function mapLimit(items, limit, mapper) {
  if (limit <= 0) throw new Error('Limit must be a positive integer');
  const results = new Array(items.length);
  let index = 0;
  let running = 0;
  const runNext = async () => {
    if (index >= items.length) return;
    const i = index++;
    running++;
    try {
      results[i] = await mapper(items[i], i);
    } catch (error) {
      return Promise.reject(error);
    } finally {
      running--;
      if (index < items.length) {
        await runNext();
      }
    }
  };
  const runners = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    runners.push(runNext());
  }
  await Promise.all(runners);
  return results;
}

module.exports = { LRUCache, mapLimit };
