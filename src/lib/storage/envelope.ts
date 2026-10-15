import type { z } from "zod"

/** Every key written by the app starts with this prefix. */
export const KEY_PREFIX = "facturette:"
/** Current storage schema version. Bump together with a migration in `readEnvelope`. */
export const STORAGE_VERSION = 1
export const keyOf = (name: string): string => `${KEY_PREFIX}v${STORAGE_VERSION}:${name}`

export interface Envelope<T> {
  v: number
  data: T
  updatedAt: string
}

/** Minimal in-memory Storage used when the real one is unavailable (private mode, SSR, tests). */
export class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

let fallback: Storage | undefined

/**
 * Resolve the storage lazily. An explicit storage always wins; otherwise `localStorage`, and if
 * accessing it throws (SecurityError) or it is missing, a process-wide in-memory fallback.
 */
export const resolveStorage = (explicit?: Storage): Storage => {
  if (explicit) return explicit
  try {
    const real = globalThis.localStorage
    if (real) return real
  } catch {
    // SecurityError in some private modes: fall through to memory.
  }
  fallback ??= new MemoryStorage()
  return fallback
}

export const writeEnvelope = (storage: Storage, key: string, data: unknown): boolean => {
  const envelope: Envelope<unknown> = {
    v: STORAGE_VERSION,
    data,
    updatedAt: new Date().toISOString(),
  }
  try {
    storage.setItem(key, JSON.stringify(envelope))
    return true
  } catch {
    // QuotaExceededError, SecurityError, circular data…
    return false
  }
}

/** Raw `data` of a well-formed envelope of the current version, else null. Never throws. */
export const readEnvelopeData = (storage: Storage, key: string): unknown => {
  try {
    const raw = storage.getItem(key)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    const { v, data, updatedAt } = parsed as Record<string, unknown>
    if (v !== STORAGE_VERSION || typeof updatedAt !== "string" || data === undefined) return null
    return data
  } catch {
    return null
  }
}

/** Read and validate an envelope payload with a zod schema; null when absent/corrupt/foreign. */
export const readEnvelope = <S extends z.ZodType>(
  storage: Storage,
  key: string,
  schema: S,
): z.output<S> | null => {
  const data = readEnvelopeData(storage, key)
  if (data === null) return null
  const result = schema.safeParse(data)
  return result.success ? result.data : null
}

export const removeKey = (storage: Storage, key: string): boolean => {
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
