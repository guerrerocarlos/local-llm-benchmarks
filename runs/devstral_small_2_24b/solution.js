```javascript
class LRUCache {
  #maxSize;
  #defaultTtlMs;
  #now;
  #cache;
  #accessOrder;

  constructor({ maxSize, ttlMs = Infinity, now = () => Date.now() }) {
    if (typeof maxSize !== 'number' || maxSize <= 0 || !Number.isInteger(maxSize)) {
      throw new Error('maxSize must be a positive integer');
    }
    this.#maxSize = maxSize;
    this.#defaultTtlMs = ttlMs;
    this.#now = now;
    this.#cache = new Map();
    this.#accessOrder = new Map();
  }

  #cleanup() {
    const now = this.#now();
    for (const [key, { expires }] of this.#cache) {
      if (expires <= now) {
        this.#cache.delete(key);
        this.#accessOrder.delete(key);
      }
    }
  }

  #promote(key) {
    this.#accessOrder.delete(key);
    this.#accessOrder.set(key, true);
  }

  #evictIfNeeded() {
    if (this.#cache.size >= this.#maxSize) {
      const now = this.#now();
      let oldestKey = null;
      for (const [key] of this.#accessOrder) {
        const { expires } = this.#cache.get(key);
        if (expires > now) {
          oldestKey = key;
          break;
        }
      }
      if (oldestKey) {
        this.#cache.delete(oldestKey);
        this.#accessOrder.delete(oldestKey);
      }
    }
  }

  set(key, value, ttlMsOverride) {
    const now = this.#now();
    const expires = ttlMsOverride !== undefined ? now + ttlMsOverride : now + this.#defaultTtlMs;

    if (expires <= now) {
      return;
    }

    if (this.#cache.has(key)) {
      this.#cache.set(key, { value, expires });
      this.#promote(key);
    } else {
      this.#cache.set(key, { value, expires });
      this.#accessOrder.set(key, true);
      this.#evictIfNeeded();
    }
  }

  get(key) {
    this.#cleanup();
    if (!this.#cache.has(key)) return undefined;

    const { value, expires } = this.#cache.get(key);
    if (expires <= this.#now()) return undefined;

    this.#promote(key);
    return value;
  }

  has(key) {
    this.#cleanup();
    return this.#cache.has(key) && this.#cache.get(key).expires > this.#now();
  }

  delete(key) {
    this.#cleanup();
    const hadKey = this.#cache.has(key);
    if (hadKey) {
      this.#cache.delete(key);
      this.#accessOrder.delete(key);
    }
    return hadKey;
  }

  size() {
    this.#cleanup();
    return this.#cache.size;
  }

  keys() {
    this.#cleanup();
    const now = this.#now();
    const validKeys = [];
    for (const [key] of this.#accessOrder) {
      const { expires } = this.#cache.get(key);
      if (expires > now) {
        validKeys.push(key);
      }
    }
    return validKeys;
  }
}

async function mapLimit(items, limit, mapper) {
  if (typeof limit !== 'number' || limit <= 0 || !Number.isInteger(limit)) {
    throw new Error('limit must be a positive integer');
  }

  const results = new Array(items.length);
  let activeCount = 0;
  let rejected = false;
  let completed = 0;

  const processItem = async (index) => {
    try {
      const result = await mapper(items[index], index);
      results[index] = result;
    } catch (error) {
      rejected = true;
      throw error;
    } finally {
      activeCount--;
    }
  };

  const processNext = async () => {
    while (completed < items.length && activeCount < limit && !rejected) {
      const index = completed++;
      activeCount++;
      processItem
