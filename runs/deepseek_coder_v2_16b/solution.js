class LRUCache {
  constructor({ maxSize, ttlMs = Infinity, now = () => Date.now() }) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.now = now;
    this.cache = new Map();
  }

  set(key, value, ttlMsOverride = this.ttlMs) {
    if (ttlMsOverride <= 0) {
      this.delete(key);
      return;
    }
    const expiresAt = this.now() + ttlMsOverride;
    this.cache.set(key, { value, expiresAt });
    this.evict();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const entry = this.cache.get(key);
    if (entry.expiresAt < this.now()) {
      this.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  has(key) {
    return this.cache.has(key) && this.cache.get(key).expiresAt >= this.now();
  }

  delete(key) {
    return this.cache.delete(key);
  }

  size() {
    this.evict();
    return this.cache.size;
  }

  keys() {
    this.evict();
    return Array.from(this.cache.keys());
  }

  evict() {
    const now = this.now();
    for (let [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
    while (this.cache.size > this.maxSize) {
      const leastRecentKey = this.cache.keys().next().value;
      this.cache.delete(leastRecentKey);
    }
  }
}

async function mapLimit(items, limit, mapper) {
  return new Promise((resolve, reject) => {
    let index = 0;
    const results = [];
    const executeNext = () => {
      if (index >= items.length) {
        return resolve(results);
      }
      const item = items[index];
      index++;
      Promise.resolve(mapper(item, index - 1)).then(
        (result) => {
          results[index - 1] = result;
          if (index < items.length) {
            executeNext();
          }
        },
        (error) => reject(error)
      );
    };
    for (let i = 0; i < limit && i < items.length; i++) {
      executeNext();
    }
  });
}

module.exports = { LRUCache, mapLimit };
