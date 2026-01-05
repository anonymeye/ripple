# Interceptors

Interceptors are a powerful mechanism for adding cross-cutting concerns to event handlers. They wrap handlers and can modify both inputs (coeffects) and outputs (effects) in two phases: `before` and `after`.

## Overview

Interceptors are similar to middleware but with two phases that run in opposite order:

1. **Before Phase** - Runs in order, can modify coeffects (inputs)
2. **After Phase** - Runs in reverse order, can modify effects (outputs)

This design allows interceptors to:
- Transform inputs before the handler sees them
- Transform outputs after the handler produces them
- Add logging, validation, or other cross-cutting concerns

## Interceptor Structure

An interceptor has the following structure:

```typescript
interface Interceptor<State, Cofx> {
  id?: string                    // Optional identifier for debugging
  before?: (context) => context  // Runs before handler (in order)
  after?: (context) => context    // Runs after handler (in reverse order)
}
```

## Built-in Interceptors

### `path(pathKeys)` - Focus on State Path

Focuses the handler on a specific path in the state. The handler receives only the value at that path, and the result is automatically grafted back into the full state.

**Parameters:**
- `pathKeys` - Array of keys representing the path in state

**Example:**
```typescript
import { path } from '@rplx/core'

// State structure: { todos: { list: [...], filter: 'all' } }

store.registerEventDb(
  'update-todos',
  (context, newTodos) => {
    // context.db is now just the todos object
    return { ...context.db, list: newTodos }
  },
  [path(['todos'])]  // Focus on todos path
)
```

**How it works:**
- **Before:** Extracts the value at the path and replaces `context.db` with it
- **After:** Grafts the updated value back into the full state at the correct path

### `debug()` - Debug Logging

Logs the event context before and after handler execution. Useful for debugging.

**Example:**
```typescript
import { debug } from '@rplx/core'

store.registerEventDb(
  'increment',
  (context, payload) => {
    return { ...context.db, count: context.db.count + 1 }
  },
  [debug()]  // Logs before and after state
)
```

**Output:**
```
Event
  Coeffects: { db: { count: 0 }, event: {...} }
  New State: { count: 1 }
  Effects: { db: { count: 1 } }
```

### `after(fn)` - Post-Handler Side Effect

Runs a side effect function after the handler executes. The function receives the new state and effects.

**Parameters:**
- `fn` - Function `(db: State, effects: EffectMap) => void`

**Example:**
```typescript
import { after } from '@rplx/core'

store.registerEventDb(
  'save-todo',
  (context, todo) => {
    return { ...context.db, todos: [...context.db.todos, todo] }
  },
  [
    after((newState, effects) => {
      console.log('Todo saved, new count:', newState.todos.length)
      // Could also dispatch another event, update localStorage, etc.
    })
  ]
)
```

### `injectCofx(key, value)` - Inject Dynamic Coeffect

Injects a dynamic coeffect value into the context. Useful for one-off values that aren't in your `Cofx` type.

**Parameters:**
- `key` - String key for the coeffect
- `value` - The value to inject

**Example:**
```typescript
import { injectCofx } from '@rplx/core'

store.registerEvent(
  'process-item',
  (context, item) => {
    // context.customValue is now available
    return { db: context.db }
  },
  [
    injectCofx('customValue', computeCustomValue())
  ]
)
```

**Note:** With the coeffect provider system, this is rarely needed. Prefer defining coeffects in your `Cofx` type and providing them in store config.

### `validate(schema)` - State Validation

Validates the state after the handler executes. Logs an error if validation fails.

**Parameters:**
- `schema` - Function `(state: State) => boolean | string` (returns `true` if valid, or error message string)

**Example:**
```typescript
import { validate } from '@rplx/core'

store.registerEventDb(
  'update-count',
  (context, count) => {
    return { ...context.db, count }
  },
  [
    validate((state) => {
      if (state.count < 0) {
        return 'Count cannot be negative'
      }
      return true
    })
  ]
)
```

## Creating Custom Interceptors

You can create custom interceptors by implementing the `Interceptor` interface:

```typescript
import { Interceptor } from '@rplx/core'

function logExecution<State, Cofx>(): Interceptor<State, Cofx> {
  return {
    id: 'log-execution',
    
    before: (context) => {
      console.log('Before handler:', context.coeffects)
      return context
    },
    
    after: (context) => {
      console.log('After handler:', context.effects)
      return context
    }
  }
}
```

## Interceptor Chain Execution

When an event is dispatched, interceptors execute in the following order:

1. **Before Phase (in order):**
   - Interceptor 1 `before`
   - Interceptor 2 `before`
   - Handler (wrapped as interceptor)
   
2. **After Phase (in reverse order):**
   - Handler `after` (if it had one)
   - Interceptor 2 `after`
   - Interceptor 1 `after`

**Example:**
```typescript
store.registerEventDb(
  'example',
  handler,
  [
    interceptor1,  // before runs first, after runs last
    interceptor2,  // before runs second, after runs second-to-last
    interceptor3   // before runs third, after runs first (reverse)
  ]
)
```

## Common Patterns

### Composing Multiple Interceptors

```typescript
import { path, debug, validate, after } from '@rplx/core'

store.registerEventDb(
  'update-todo',
  (context, todo) => {
    return { ...context.db, ...todo }
  },
  [
    path(['todos', 'current']),  // Focus on current todo
    debug(),                      // Log execution
    validate((state) => {          // Validate result
      return state.id ? true : 'Todo must have an id'
    }),
    after((state, effects) => {   // Post-processing
      analytics.track('todo-updated')
    })
  ]
)
```

### Conditional Interceptors

```typescript
function conditionalDebug<State, Cofx>(enabled: boolean): Interceptor<State, Cofx> {
  if (!enabled) {
    return { id: 'no-op' }  // No-op interceptor
  }
  return debug()
}

store.registerEventDb(
  'example',
  handler,
  [
    conditionalDebug(process.env.NODE_ENV === 'development')
  ]
)
```

### Transforming Coeffects

```typescript
function normalizePayload<State, Cofx>(): Interceptor<State, Cofx> {
  return {
    id: 'normalize-payload',
    
    before: (context) => {
      // Normalize the event payload
      const normalized = {
        ...context.coeffects.event,
        timestamp: Date.now()
      }
      
      return {
        ...context,
        coeffects: {
          ...context.coeffects,
          event: normalized
        }
      }
    }
  }
}
```

### Transforming Effects

```typescript
function addMetadata<State, Cofx>(): Interceptor<State, Cofx> {
  return {
    id: 'add-metadata',
    
    after: (context) => {
      // Add metadata to effects
      return {
        ...context,
        effects: {
          ...context.effects,
          metadata: {
            timestamp: Date.now(),
            version: '1.0.0'
          }
        }
      }
    }
  }
}
```

## Best Practices

1. **Use built-in interceptors when possible** - They're well-tested and handle edge cases
2. **Keep interceptors focused** - Each interceptor should do one thing
3. **Use `id` for debugging** - Helps identify interceptors in traces
4. **Don't mutate context** - Always return a new context object
5. **Consider order** - Interceptor order matters, especially when composing
6. **Use `path` for nested state** - Simplifies handlers that work on nested state
7. **Use `validate` for critical state** - Catch invalid state early
8. **Use `after` for side effects** - Keeps handlers pure


## Error Handling

If an interceptor throws an error:

1. The error is caught and passed to the error handler
2. Remaining interceptors are skipped
3. Effects are not executed
4. The state remains unchanged
5. An error trace is emitted (if tracing is enabled)

**Example:**
```typescript
function safeInterceptor<State, Cofx>(): Interceptor<State, Cofx> {
  return {
    id: 'safe',
    
    before: (context) => {
      try {
        // Potentially dangerous operation
        return transformContext(context)
      } catch (error) {
        // Error will be handled by error handler
        throw error
      }
    }
  }
}
```

## Interceptor Inspection

You can inspect the interceptor chain for an event using `store.getInterceptors()`:

```typescript
const interceptors = store.getInterceptors('my-event')
console.log('Interceptor chain:', interceptors)
```

This is useful for debugging and understanding how events are processed.

