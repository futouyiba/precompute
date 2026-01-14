/**
 * LRU 缓存实现
 */
export class LRUCache<K, V> {
    private capacity: number;
    private cache: Map<string, V>;
    private keyFn: (key: K) => string;

    constructor(capacity: number, keyFn: (key: K) => string) {
        this.capacity = capacity;
        this.cache = new Map();
        this.keyFn = keyFn;
    }

    get(key: K): V | undefined {
        const k = this.keyFn(key);
        if (!this.cache.has(k)) return undefined;

        // 移动到最近使用
        const value = this.cache.get(k)!;
        this.cache.delete(k);
        this.cache.set(k, value);
        return value;
    }

    set(key: K, value: V): void {
        const k = this.keyFn(key);

        if (this.cache.has(k)) {
            this.cache.delete(k);
        } else if (this.cache.size >= this.capacity) {
            // 删除最久未使用的 (Map 的第一个元素)
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(k, value);
    }

    has(key: K): boolean {
        return this.cache.has(this.keyFn(key));
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}
