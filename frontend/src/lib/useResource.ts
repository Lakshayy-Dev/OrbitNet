import { useEffect, useState } from 'react'

const cache = new Map<string, unknown>()

/** Fetch once per key and keep the result for the session. */
export function useResource<T>(key: string, load: () => Promise<T>, opts: { refresh?: boolean } = {}) {
  const [data, setData] = useState<T | null>(() => (cache.get(key) as T) ?? null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (cache.has(key) && !opts.refresh) return
    let alive = true
    load()
      .then((d) => {
        cache.set(key, d)
        if (alive) setData(d)
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error }
}
