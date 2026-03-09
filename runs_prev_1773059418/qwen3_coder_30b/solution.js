class LRUCache {
  constructor({ maxSize, ttlMs = Infinity, now = () => Date.now() }) {
    if (maxSize <= 0 || !Number.isInteger(maxSize)) {
      throw new Error('maxSize must be a positive integer');
    }
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.now = now;
    this.map = new Map();
    this.accessOrder = [];
  }

  _cleanup() {
    const now = this.now();
    for (const key of this.accessOrder) {
      const entry = this.map.get(key);
      if (!entry || (entry.ttlMs > 0 && now - entry.createdAt >= entry.ttlMs)) {
        this.map.delete(key);
        this.accessOrder.splice(this.accessOrder.indexOf(key), 1);
      }
    }
  }

  _updateAccess(key) {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  set(key, value, ttlMsOverride) {
    const now = this.now();
    const ttlMs = ttlMsOverride === undefined ? this.ttlMs : ttlMsOverride;
    
    if (ttlMs <= 0) {
      this.delete(key);
      return;
    }
    
    const entry = {
      value,
      ttlMs,
      createdAt: now
    };
    
    this.map.set(key, entry);
    this._updateAccess(key);
    
    if (this.map.size > this.maxSize) {
      const oldestKey = this.accessOrder.shift();
      this.map.delete(oldestKey);
    }
    
    return this;
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    
    const now = this.now();
    if (now - entry.createdAt >= entry.ttlMs) {
      this.delete(key);
      return undefined;
    }
    
    this._updateAccess(key);
    return entry.value;
  }

  has(key) {
    const entry = this.map.get(key);
    if (!entry) return false;
    
    const now = this.now();
    if (now - entry.createdAt >= entry.ttlMs) {
      this.delete(key);
      return false;
    }
    
    this._updateAccess(key);
    return true;
  }

  delete(key) {
    const result = this.map.delete(key);
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    return result;
  }

  size() {
    this._cleanup();
    return this.map.size;
  }

  keys() {
    this._cleanup();
    return [...this.accessOrder];
  }
}

async function mapLimit(items, limit, mapper) {
  if (limit <= 0) {
    throw new Error('limit must be a positive integer');
  }

  const results = new Array(items.length);
  let rejected = false;
  let rejectionReason;

  const runTask = async (index) => {
    if (rejected) return;
    
    try {
      const result = await Promise.resolve(mapper(items[index], index));
      results[index] = result;
    } catch (err) {
      rejected = true;
      rejectionReason = err;
      throw err;
    }
  };

  const promises = [];
  for (let i = 0; i < items.length; i++) {
    if (i < limit) {
      promises.push(runTask(i));
    } else {
      await Promise.race(promises);
      promises.shift();
      promises.push(runTask(i));
    }
  }

  try {
    await Promise.all(promises);
    return results;
  } catch (err) {
    throw rejectionReason || err;
  }
}

module.exports = { LRUCache, mapLimit };
