import { Context, EffectMap } from "./types"

export interface InterceptorContext<State, Cofx = {}> {
    coeffects: Context<State, Cofx>
    effects: EffectMap
    queue: Interceptor<State, Cofx>[]
    stack: Interceptor<State, Cofx>[]
  }
  
  export interface Interceptor<State, Cofx = {}> {
    id?: string
    
    // Before handler runs - can modify coeffects
    before?: (context: InterceptorContext<State, Cofx>) => InterceptorContext<State, Cofx>
    
    // After handler runs - can modify effects
    after?: (context: InterceptorContext<State, Cofx>) => InterceptorContext<State, Cofx>
  }
  
  // Built-in interceptors
  
  /**
   * Path interceptor - focus handler on a path in state
   */
  export function path<State, Cofx = {}>(pathKeys: (keyof State)[]): Interceptor<State, Cofx> {
    return {
      id: `path-${pathKeys.join('.')}`,
      
      before: (context) => {
        // Extract value at path
        let value: any = context.coeffects.db
        for (const key of pathKeys) {
          value = value?.[key]
        }
        
        // Store original db and replace with focused value
        return {
          ...context,
          coeffects: {
            ...context.coeffects,
            _originalDb: context.coeffects.db,
            _pathKeys: pathKeys,
            db: value
          }
        }
      },
      
      after: (context) => {
        // Restore full state with updated path
        // Read from effects.db (the :db effect), not coeffects.db
        const pathKeys = (context.coeffects as any)._pathKeys
        const originalDb = (context.coeffects as any)._originalDb
        const focusedState = context.effects.db
        
        if (pathKeys && originalDb !== undefined && focusedState !== undefined) {
          let newDb = { ...originalDb }
          let current: any = newDb
          
          // Navigate to parent
          for (let i = 0; i < pathKeys.length - 1; i++) {
            current[pathKeys[i]] = { ...current[pathKeys[i]] }
            current = current[pathKeys[i]]
          }
          
          // Set new value from :db effect
          current[pathKeys[pathKeys.length - 1]] = focusedState
          
          // Restore original db in coeffects for other interceptors (like debug)
          // and set the grafted db as the :db effect
          return {
            ...context,
            coeffects: {
              ...context.coeffects,
              db: originalDb
            },
            effects: {
              ...context.effects,
              db: newDb
            }
          }
        }
        
        // If no :db effect, restore original db in coeffects and leave effects unchanged
        if (pathKeys && originalDb !== undefined) {
          return {
            ...context,
            coeffects: {
              ...context.coeffects,
              db: originalDb
            }
          }
        }
        
        return context
      }
    }
  }
  
  /**
   * Debug interceptor - log events
   */
  export function debug<State, Cofx = {}>(): Interceptor<State, Cofx> {
    return {
      id: 'debug',
      
      before: (context) => {
        console.group('Event')
        console.log('Coeffects:', context.coeffects)
        return context
      },
      
      after: (context) => {
        // Log the new state from effects.db if available (after path grafting), otherwise coeffects.db
        const newState = context.effects.db !== undefined ? context.effects.db : context.coeffects.db
        console.log('New State:', newState)
        console.log('Effects:', context.effects)
        console.groupEnd()
        return context
      }
    }
  }
  
  /**
   * After interceptor - run side effect after handler
   */
  export function after<State, Cofx = {}>(
    fn: (db: State, effects: EffectMap) => void
  ): Interceptor<State, Cofx> {
    return {
      id: 'after',
      
      after: (context) => {
        // Pass the new state from effects.db if available (after path grafting), otherwise coeffects.db
        const newState = context.effects.db !== undefined ? context.effects.db : context.coeffects.db
        fn(newState as State, context.effects)
        return context
      }
    }
  }
  
  /**
   * Inject coeffect interceptor - adds a dynamic coeffect value
   * Note: With the new coeffect provider system, this is rarely needed
   * Use it only for one-off dynamic values that aren't in your Cofx type
   */
  export function injectCofx<State, Cofx = {}>(
    key: string,
    value: any
  ): Interceptor<State, Cofx> {
    return {
      id: `inject-${key}`,
      
      before: (context) => {
        return {
          ...context,
          coeffects: {
            ...context.coeffects,
            [key]: value
          } as Context<State, Cofx>
        }
      }
    }
  }
  
  /**
   * Validation interceptor
   */
  export function validate<State, Cofx = {}>(
    schema: (state: State) => boolean | string
  ): Interceptor<State, Cofx> {
    return {
      id: 'validate',
      
      after: (context) => {
        // Validate the final state that will be applied
        // Use effects.db if available (after path grafting), otherwise coeffects.db
        const stateToValidate = context.effects.db !== undefined 
          ? context.effects.db 
          : context.coeffects.db
        const result = schema(stateToValidate as State)
        if (result !== true) {
          console.error('State validation failed:', result)
        }
        return context
      }
    }
  }

