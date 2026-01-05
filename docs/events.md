# Events

The Events module handles event registration and handler execution. It's inspired by re-frame's event system and manages the interceptor chain execution that processes events.

## Overview

Events are the primary mechanism for triggering state changes and side effects in Ripple. When you dispatch an event, it goes through an interceptor chain that can modify coeffects (inputs) and effects (outputs) before and after the handler executes.

## Core Concepts

### Event Handlers

There are two types of event handlers:

1. **DB Handlers** (`registerEventDb`) - Return state directly, which is automatically wrapped into a `{db: state}` effect
2. **FX Handlers** (`registerEvent`) - Return an effects map, allowing multiple effects including state updates and side effects

### Interceptor Chain Execution

When an event is dispatched, it goes through an interceptor chain with two phases:

1. **Before Phase** - Interceptors run in order, modifying coeffects (inputs)
2. **After Phase** - Interceptors run in reverse order, modifying effects (outputs)

The handler itself is wrapped as an interceptor and added to the chain.

## API

### `registerEventDb<Payload>(eventKey, handler, interceptors?)`

Register an event handler that returns state only. The handler receives the context (coeffects) and payload, and returns the new state.

**Type Parameters:**
- `Payload` - The type of the event payload

**Parameters:**
- `eventKey` - String identifier for the event
- `handler` - Function `(context: Context<State, Cofx>, payload: Payload) => State`
- `interceptors` - Optional array of interceptors

**Example:**
```typescript
store.registerEventDb('increment', (context, payload) => {
  return {
    ...context.db,
    count: context.db.count + (payload?.amount || 1)
  }
})
```

### `registerEvent<Payload>(eventKey, handler, interceptors?)`

Register an event handler that returns an effects map. This allows you to return multiple effects.

**Type Parameters:**
- `Payload` - The type of the event payload

**Parameters:**
- `eventKey` - String identifier for the event
- `handler` - Function `(context: Context<State, Cofx>, payload: Payload) => EffectMap`
- `interceptors` - Optional array of interceptors

**Example:**
```typescript
store.registerEvent('save-todo', (context, todo) => {
  return {
    db: {
      ...context.db,
      todos: [...context.db.todos, { ...todo, id: context.uuid }]
    },
    dispatch: {
      event: 'notify',
      payload: { message: 'Todo saved' }
    }
  }
})
```

### `deregisterEvent(eventKey)`

Remove an event handler registration.

**Parameters:**
- `eventKey` - String identifier for the event to deregister

## Event Processing Flow

When an event is dispatched, the following happens:

1. **Coeffect Computation** - All coeffect providers are called to build the initial context
2. **Before Phase** - Interceptors run in order, each modifying the context
3. **Handler Execution** - The handler runs (wrapped as an interceptor)
4. **After Phase** - Interceptors run in reverse order, modifying effects
5. **Effect Execution** - Effects from the final context are executed
6. **Tracing** - Event trace is emitted (if tracing is enabled)

## Context Structure

The context passed to handlers contains:

- `db` - The current state
- `event` - The event payload
- All coeffects defined in your `Cofx` type

**Example:**
```typescript
interface AppCoeffects {
  timestamp: number
  userId: string
}

// In your handler:
store.registerEvent('example', (context, payload) => {
  // context.db - current state
  // context.event - event payload (same as payload parameter)
  // context.timestamp - number
  // context.userId - string
  return { db: context.db }
})
```

## Error Handling

If an error occurs during interceptor execution:

1. The error is caught and passed to the error handler
2. Remaining interceptors are skipped
3. Effects are not executed
4. The state remains unchanged
5. An error trace is emitted (if tracing is enabled)

## Examples

### Simple State Update

```typescript
store.registerEventDb('set-count', (context, count) => {
  return { ...context.db, count }
})
```

### State Update with Side Effect

```typescript
store.registerEvent('save-user', (context, user) => {
  return {
    db: { ...context.db, user },
    dispatch: {
      event: 'user-saved',
      payload: { userId: user.id }
    }
  }
})
```

### Using Interceptors

```typescript
import { path, debug } from '@rplx/core'

store.registerEventDb(
  'update-todo',
  (context, todo) => {
    return { ...context.db, ...todo }
  },
  [
    path(['todos']),  // Focus handler on todos path
    debug()           // Log before and after
  ]
)
```

### Conditional Effects

```typescript
store.registerEvent('maybe-save', (context, data) => {
  const effects: EffectMap = {
    db: { ...context.db, data }
  }
  
  if (data.shouldNotify) {
    effects.dispatch = {
      event: 'notify',
      payload: { message: 'Data saved' }
    }
  }
  
  return effects
})
```

## Best Practices

1. **Use `registerEventDb` for simple state updates** - It's more concise when you only need to update state
2. **Use `registerEvent` for complex logic** - When you need multiple effects or conditional logic
3. **Keep handlers pure** - Handlers should be deterministic functions of their inputs
4. **Use interceptors for cross-cutting concerns** - Validation, logging, path focusing, etc.
5. **Leverage coeffects** - Use coeffects for values that should be computed once per event (timestamps, UUIDs, etc.)


