class LRUCache {
  constructor({ maxSize, ttlMs = Infinity, now = () => Date.now() }) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.now = now;
    this.cache = new Map();
  }

  set(key, value, ttlMsOverride = null) {
    const ttl = ttlMsOverride !== null ? ttlMsOverride : this.ttlMs;
    const expires = ttl > 0 ? this.now() + ttl : 0;
    this.cache.set(key, { value, expires });
    this.promote(key);
    if (this.cache.size > this.maxSize) {
      this.evict();
    }
  }

  get(key) {
    const entry = this.cache.get(key);
    if (entry && entry.expires > this.now()) {
      this.promote(key);
      return entry.value;
    }
    this.cache.delete(key);
    return undefined;
  }

  has(key) {
    const entry = this.cache.get(key);
    if (entry && entry.expires > this.now()) {
      return true;
    }
    this.cache.delete(key);
    return false;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  size() {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expires > this.now()) {
        count++;
      } else {
        this.cache.delete(key);
      }
    }
    return count;
  }

  keys() {
    const keys = [];
    for (const [key, entry] of this.cache) {
      if (entry.expires > this.now()) {
        keys.push(key);
      } else {
        this.cache.delete(key);
      }
    }
    return keys.reverse();
  }

  promote(key) {
    const entry = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  evict() {
    for (const [key, entry] of this.cache) {
      if (entry.expires <= this.now()) {
        this.cache.delete(key);
      } else {
        return;
      }
    }
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let currentIndex = 0;
  let activeCount = 0;

  const runTask = async (index) => {
    try {
      results[index] = await mapper(items[index], index);
    } catch (error) {
      for (let i = 0; i < results.length; i++) {
        if (results[i] === undefined) {
          results[i] = Promise.reject(error);
        }
      }
      throw error;
    } finally {
      activeCount--;
      if (currentIndex < items.length) {
        runTask(currentIndex++);
      }
    }
  };

  while (activeCount < limit && currentIndex < items.length) {
    runTask(currentIndex++);
    activeCount++;
  }

  return Promise.all(results);
}

module.exports = { LRUCache, mapLimit };
