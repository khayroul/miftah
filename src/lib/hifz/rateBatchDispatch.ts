/**
 * Generic concurrent-dispatch helper for `rate-batch`-shaped workloads: apply
 * an async function over a list of items, keyed by a per-item identity, so
 * that:
 *
 * - **Distinct keys run fully in parallel** (the perf win — up to 50 entries
 *   ×4-5 round-trips serially collapses to one wave of concurrent requests).
 * - **Entries that share a key run strictly sequentially, in original
 *   input order**, within their own group. This preserves the old serial
 *   `for` loop's guarantee that a second entry touching the same row always
 *   observes the first entry's write (needed for row-scoped idempotency
 *   dedup to hold even if a batch ever contained a repeated key — current
 *   callers never send one, but the contract holds regardless).
 * - **Result order always matches input order**, independent of which
 *   group/entry resolves first.
 *
 * Contract: `apply` must not reject — callers that need per-item
 * ok/fail results should catch inside `apply` and return a failure value
 * (mirrors `Promise.allSettled` semantics without paying its heavier return
 * shape). A rejection from `apply` will reject the whole batch.
 */
export async function dispatchGroupedByKey<TItem, TResult>(
  items: readonly TItem[],
  keyOf: (item: TItem) => string | number,
  apply: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length);

  const groups = new Map<string | number, number[]>();
  items.forEach((item, index) => {
    const key = keyOf(item);
    const indices = groups.get(key);
    if (indices) {
      indices.push(index);
    } else {
      groups.set(key, [index]);
    }
  });

  await Promise.all(
    Array.from(groups.values()).map(async (indices) => {
      for (const index of indices) {
        results[index] = await apply(items[index], index);
      }
    }),
  );

  return results;
}
