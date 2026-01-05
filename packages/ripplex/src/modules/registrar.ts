/**
 * Central handler registry
 * Inspired by re-frame's registrar.cljc
 * 
 * Stores handlers in a two-layer map: Map<kind, Map<id, handler>>
 * Supports different handler kinds: 'event', 'effect', etc.
 */

export type HandlerKind = 'event' | 'effect' | 'cofx' | 'sub' | 'error'

export interface Registrar {
  /**
   * Register a handler for a given kind and id
   * @param kind - The kind of handler (e.g., 'event', 'effect')
   * @param id - The identifier for this handler
   * @param handler - The handler function/object
   * @returns The registered handler
   */
  register<T = any>(kind: HandlerKind, id: string, handler: T): T

  /**
   * Get a handler by kind and id
   * @param kind - The kind of handler
   * @param id - The identifier
   * @returns The handler or undefined if not found
   */
  get<T = any>(kind: HandlerKind, id: string): T | undefined

  /**
   * Check if a handler exists
   * @param kind - The kind of handler
   * @param id - The identifier
   * @returns True if handler exists
   */
  has(kind: HandlerKind, id: string): boolean

  /**
   * Clear handlers
   * @param kind - Optional: clear all handlers of this kind
   * @param id - Optional: clear specific handler (requires kind)
   */
  clear(kind?: HandlerKind, id?: string): void
}

/**
 * Create a new registrar instance
 * @param options - Configuration options
 * @returns A new Registrar instance
 */
export function createRegistrar(options?: { warnOnOverwrite?: boolean }): Registrar {
  // Two-layer map: Map<kind, Map<id, handler>>
  const handlers = new Map<HandlerKind, Map<string, any>>()
  const warnOnOverwrite = options?.warnOnOverwrite ?? true

  return {
    register<T = any>(kind: HandlerKind, id: string, handler: T): T {
      // Get or create the map for this kind
      let kindMap = handlers.get(kind)
      if (!kindMap) {
        kindMap = new Map<string, any>()
        handlers.set(kind, kindMap)
      }

      // Warn if overwriting existing handler
      if (warnOnOverwrite && kindMap.has(id)) {
        console.warn(`re-frame: overwriting ${kind} handler for: ${id}`)
      }

      // Register the handler
      kindMap.set(id, handler)
      return handler
    },

    get<T = any>(kind: HandlerKind, id: string): T | undefined {
      const kindMap = handlers.get(kind)
      if (!kindMap) {
        return undefined
      }
      return kindMap.get(id) as T | undefined
    },

    has(kind: HandlerKind, id: string): boolean {
      const kindMap = handlers.get(kind)
      if (!kindMap) {
        return false
      }
      return kindMap.has(id)
    },

    clear(kind?: HandlerKind, id?: string): void {
      if (kind === undefined) {
        // Clear all handlers
        handlers.clear()
      } else if (id === undefined) {
        // Clear all handlers of this kind
        handlers.delete(kind)
      } else {
        // Clear specific handler
        const kindMap = handlers.get(kind)
        if (kindMap) {
          if (kindMap.has(id)) {
            kindMap.delete(id)
          } else {
            console.warn(`re-frame: can't clear ${kind} handler for ${id}. Handler not found.`)
          }
        } else {
          // Kind doesn't exist, warn about it
          console.warn(`re-frame: can't clear ${kind} handler for ${id}. Handler not found.`)
        }
      }
    }
  }
}

