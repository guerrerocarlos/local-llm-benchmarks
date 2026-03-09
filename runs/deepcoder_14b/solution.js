<think>
Okay, I need to implement two things in JavaScript: a LRUCache class and an async function called mapLimit. Let me start by thinking about the LRUCache.

First, the constructor takes an object with maxSize, ttlMs, and now. maxSize is a positive integer, so I'll make sure that's enforced. The ttlMs defaults to Infinity, meaning items never expire unless overridden. The now function is for getting the current time, probably used for expiration checks.

The LRUCache needs methods: set, get, has, delete, size, keys. Let's plan each.

For set, I need to store the value. If the key already exists, I should update its value and promote it to the most-recently-used position. Also, if a ttlMsOverride is provided, use that; else, use the default ttl from the constructor. But if the override is <=0, the item is expired immediately and not added.

The data structure to store the cache could be an object where each key maps to an entry. Each entry should have the value, expiration time, and the last accessed time (for LRU). Wait, but maintaining the order for LRU is tricky. Maybe I can use a Map to keep track of the order, where the order is based on the last accessed time. Alternatively, I could maintain a separate structure, like an array, to track the order of keys, updating their positions when accessed.

Wait, perhaps using a Map where each key's value includes the expiration and the last accessed time. Then, when I need to get the least recently used, I can sort based on the last accessed time. But that might be inefficient for large caches. Alternatively, I could maintain a doubly linked list to represent the LRU order, which allows O(1) insertion and deletion. But that's more complex.

Maybe for simplicity, given that this is a coding task, I can use an array to keep track of the order. Each time a key is accessed (get or set), it's moved to the front of the array. When the cache is full, the last element is evicted if it's not expired. Wait, no—LRU is about the least recently used, so the one that was used the furthest in the past. So perhaps the order array can be maintained, where the first element is the most recently used, and the last is the least. When evicting, I remove the last one.

Wait, no. Actually, in LRU, when you access an item, it becomes the most recently used. So the order should be updated each time get, set, or any operation that touches the item's recency.

So perhaps I can have a Map to store the key entries, each with their value, expiration, and last accessed time. Then, when I need to evict, I find the key with the smallest last accessed time that's not expired.

Wait, but that could be inefficient if maxSize is large. But for the purposes of this task, maybe it's acceptable.

Alternatively, I can maintain an array that represents the order of keys, from most to least recently used. Each time a key is accessed, it's moved to the front. When adding a new key beyond maxSize, the last element is evicted if it's not expired.

Wait, but that array would need to be maintained carefully. For example, when a key is accessed, it's moved to the front. So the array's order reflects the LRU order.

So, the steps for set:

1. If the key exists, update its value and last accessed time. If it's being set with a new ttl, update that too. Then, move it to the front of the order array.
2. If the key doesn't exist, add it to the beginning of the order array. Check if the size exceeds maxSize. If so, evict the last key in the order array (which is the least recently used) only if it's not expired. Remove it from the Map and the order array.

Wait, but the order array could have keys that are expired. So when evicting, I need to find the first key in the order array that's not expired and remove it. Or perhaps, during any operation (get, set, etc.), I should check for expired keys and remove them if necessary.

Wait, the TTL policy says that
