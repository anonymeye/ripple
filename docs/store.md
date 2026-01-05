# Store

The Store is the main entry point and primary API for creating and managing a Ripple state management instance. It composes all the core modules together to provide a unified interface.

## Overview

The Store module provides the `createStore` factory function, which is the recommended way to create a store instance. It brings together:

- Event registration and handling
- Effect execution
- State management
- Subscription system
- Error handling
- Tracing/debugging
- Interceptor system

## API

### `createStore<State, Cofx>(config)`

Factory function to create a store instance. This is the primary way to create a store.

**Type Parameters:**
- `State` - The type of your application state
- `Cofx` - The type of your coeffects (optional, defaults to `{}`)

**Parameters:**
- `config.initialState` - The initial state of your application
- `config.coeffects` - Optional object mapping coeffect keys to provider functions
- `config.onStateChange` - Optional callback invoked when state changes (useful for framework integration)
- `config.errorHandler` - Optional error handler configuration
  - `handler` - Custom error handler function
  - `rethrow` - Whether to re-throw errors after handling (default: `false`)
- `config.tracing` - Optional tracing configuration
  - `enabled` - Whether tracing is enabled (default: `false`)
  - `debounceTime` - Debounce time for trace delivery in milliseconds (default: `50`)

**Returns:** `StoreAPI<State, Cofx>` - A store instance with all public methods

## Store API

The store instance provides the following methods:

### Event Registration

#### `registerEventDb<Payload>(eventKey, handler, interceptors?)`

Register an event handler that returns state only. The return value is automatically wrapped into a `{db: state}` effect.

**Parameters:**
- `eventKey` - String identifier for the event
- `handler` - Function that receives `(context, payload)` and returns new state
- `interceptors` - Optional array of interceptors to apply

**Example:**
```typescript
store.registerEventDb('increment', (context, payload) => {
  return { ...context.db, count: context.db.count + 1 }
})
```

#### `registerEvent<Payload>(eventKey, handler, interceptors?)`

Register an event handler that returns an effects map. This allows you to return multiple effects including state updates and side effects.

**Parameters:**
- `eventKey` - String identifier for the event
- `handler` - Function that receives `(context, payload)` and returns an `EffectMap`
- `interceptors` - Optional array of interceptors to apply

**Example:**
```typescript
store.registerEvent('save-todo', (context, todo) => {
  return {
    db: { ...context.db, todos: [...context.db.todos, todo] },
    dispatch: { event: 'log', payload: { action: 'todo-added' } }
  }
})
```

#### `deregisterEvent(eventKey)`

Remove an event handler registration.

**Parameters:**
- `eventKey` - String identifier for the event to deregister

### Effect Registration

#### `registerEffect<Config>(effectType, handler)`

Register a custom effect handler.

**Parameters:**
- `effectType` - String identifier for the effect type
- `handler` - Function that receives `(config, store)` and performs the side effect

**Example:**
```typescript
store.registerEffect('http', async (config, store) => {
  const response = await fetch(config.url, config.options)
  const data = await response.json()
  await store.dispatch('http-success', data)
})
```

### Event Dispatching

#### `dispatch<Payload>(eventKey, payload)`

Dispatch an event to the event queue. Returns a promise that resolves when the event is processed.

**Parameters:**
- `eventKey` - String identifier for the event
- `payload` - The event payload (can be any type)

**Returns:** `Promise<void>`

**Example:**
```typescript
await store.dispatch('increment', { amount: 5 })
```

#### `flush()`

Flush the event queue immediately. Useful for testing to ensure all events are processed synchronously.

**Returns:** `Promise<void>`

### State Access

#### `getState()`

Get the current state. Returns a read-only reference to the state.

**Returns:** `Readonly<State>`

**Example:**
```typescript
const currentState = store.getState()
```

### Interceptor Inspection

#### `getInterceptors(eventKey)`

Get the interceptor chain for a specific event. Useful for debugging.

**Parameters:**
- `eventKey` - String identifier for the event

**Returns:** `Interceptor<State, Cofx>[] | undefined`

### Error Handling

#### `registerErrorHandler(handler, config?)`

Register or replace the error handler.

**Parameters:**
- `handler` - Error handler function
- `config` - Optional configuration
  - `rethrow` - Whether to re-throw errors after handling

### Subscriptions

#### `registerSubscription<Result, Params, Deps>(key, config)`

Register a subscription. Subscriptions are computed values derived from state.

**Parameters:**
- `key` - String identifier for the subscription
- `config` - Subscription configuration
  - `compute` - Function that computes the subscription value from state
  - `deps` - Array of subscription keys this subscription depends on
  - `combine` - Function to combine dependent subscription values

**Example:**
```typescript
store.registerSubscription('todos/count', {
  compute: (state) => state.todos.length
})

store.registerSubscription('todos/active', {
  deps: ['todos/count'],
  combine: ([count]) => count > 0
})
```

#### `subscribe<Result, Params>(key, params, callback)`

Subscribe to state changes via a subscription. The callback is invoked whenever the subscription value changes.

**Parameters:**
- `key` - String identifier for the subscription
- `params` - Parameters to pass to the subscription
- `callback` - Function called with the new subscription value

**Returns:** Unsubscribe function

**Example:**
```typescript
const unsubscribe = store.subscribe('todos/count', [], (count) => {
  console.log('Todo count:', count)
})
```

#### `query<Result, Params>(key, params)`

Query a subscription once without subscribing to changes.

**Parameters:**
- `key` - String identifier for the subscription
- `params` - Parameters to pass to the subscription

**Returns:** The current subscription value

**Example:**
```typescript
const count = store.query('todos/count', [])
```

#### `getSubscription<Result, Params>(key, params)`

Get or create a shared Subscription object for the given key and params. Returns the same object for the same key+params, which is useful for React memoization.

**Parameters:**
- `key` - String identifier for the subscription
- `params` - Parameters to pass to the subscription

**Returns:** `Subscription<State, Result, Params>`

### Tracing

#### `registerTraceCallback(key, callback)`

Register a callback to receive event traces. Traces are delivered in batches (debounced).

**Parameters:**
- `key` - Unique identifier for the callback
- `callback` - Function that receives batches of traces

**Example:**
```typescript
store.registerTraceCallback('devtools', (traces) => {
  console.log('Event traces:', traces)
})
```

#### `removeTraceCallback(key)`

Remove a trace callback.

**Parameters:**
- `key` - Unique identifier for the callback to remove

## Complete Example

```typescript
import { createStore } from '@rplx/core'

// Define state type
interface AppState {
  count: number
  todos: string[]
}

// Define coeffects
interface AppCoeffects {
  timestamp: number
  uuid: string
}

// Create store
const store = createStore<AppState, AppCoeffects>({
  initialState: { count: 0, todos: [] },
  coeffects: {
    timestamp: () => Date.now(),
    uuid: () => crypto.randomUUID()
  },
  tracing: {
    enabled: true
  }
})

// Register event handlers
store.registerEventDb('increment', (context, payload) => {
  return { ...context.db, count: context.db.count + 1 }
})

store.registerEvent('add-todo', (context, todo) => {
  return {
    db: { ...context.db, todos: [...context.db.todos, todo] },
    dispatch: { event: 'log', payload: { action: 'todo-added', id: context.uuid } }
  }
})

// Register subscriptions
store.registerSubscription('todos/count', {
  compute: (state) => state.todos.length
})

// Subscribe to changes
store.subscribe('todos/count', [], (count) => {
  console.log('Todo count changed:', count)
})

// Dispatch events
await store.dispatch('increment')
await store.dispatch('add-todo', 'Buy milk')
```


