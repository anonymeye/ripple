# Error Handler

The Error Handler module provides a centralized error handling system for events, effects, and subscriptions. It allows you to register custom error handlers and configure error handling behavior.

## Overview

The Error Handler is responsible for:
- Catching and handling errors from event handlers, interceptors, and effects
- Providing error context (event key, payload, phase, interceptor info)
- Configuring error handling behavior (rethrow, logging, etc.)
- Preventing errors from crashing the application

## API

### `registerErrorHandler(handler, config?)`

Register or replace the error handler.

**Parameters:**
- `handler` - Error handler function
- `config` - Optional configuration
  - `rethrow` - Whether to re-throw errors after handling (default: `false`)

**Example:**
```typescript
store.registerErrorHandler((error, context, config) => {
  console.error('Error occurred:', error)
  console.error('Context:', context)
  
  // Send to error tracking service
  errorTrackingService.captureException(error, {
    extra: context
  })
})
```

### `defaultErrorHandler(error, context, config)`

The default error handler that logs errors to the console. This is used if no custom handler is registered.

**Parameters:**
- `error` - The error that occurred
- `context` - Error context (event key, payload, phase, etc.)
- `config` - Error handler configuration

## Error Context

The error context provides information about where and when the error occurred:

```typescript
interface ErrorContext {
  eventKey: string              // The event key that caused the error
  payload: any                   // The event payload
  phase: 'interceptor' | 'effect' | 'subscription'  // Where the error occurred
  interceptor?: {                // Interceptor info (if applicable)
    id?: string
    direction: 'before' | 'after'
  }
}
```

## Error Phases

Errors can occur in different phases:

1. **`'interceptor'`** - Error in interceptor `before` or `after` phase
2. **`'effect'`** - Error during effect execution
3. **`'subscription'`** - Error during subscription computation

## Error Handler Function

An error handler has the following signature:

```typescript
type ErrorHandler = (
  error: Error,
  context: ErrorContext,
  config: ErrorHandlerConfig
) => void | Promise<void>
```

**Parameters:**
- `error` - The error that occurred
- `context` - Error context with event and phase information
- `config` - Error handler configuration (rethrow, etc.)

**Returns:** `void` or `Promise<void>`

## Configuration

### `rethrow`

Whether to re-throw the error after handling. Default: `false`

**Example:**
```typescript
store.registerErrorHandler(
  (error, context, config) => {
    // Log error
    console.error('Error:', error)
  },
  { rethrow: true }  // Re-throw after handling
)
```

## Usage Examples

### Basic Error Handler

```typescript
store.registerErrorHandler((error, context) => {
  console.error('Error in event:', context.eventKey)
  console.error('Error:', error)
})
```

### Error Tracking Service

```typescript
store.registerErrorHandler(async (error, context) => {
  // Send to error tracking service
  await sentry.captureException(error, {
    tags: {
      eventKey: context.eventKey,
      phase: context.phase
    },
    extra: {
      payload: context.payload,
      interceptor: context.interceptor
    }
  })
})
```

### Conditional Error Handling

```typescript
store.registerErrorHandler((error, context, config) => {
  if (context.phase === 'effect' && context.interceptor?.id === 'http') {
    // Special handling for HTTP errors
    handleHttpError(error, context)
  } else {
    // Default handling
    console.error('Error:', error)
  }
})
```

### Error Recovery

```typescript
store.registerErrorHandler(async (error, context) => {
  // Log error
  console.error('Error:', error)
  
  // Attempt recovery
  if (context.eventKey === 'save-data') {
    // Retry the save
    await store.dispatch('save-data-retry', context.payload)
  }
})
```

## Error Handling Flow

When an error occurs:

1. **Error is Caught** - Error is caught by the module where it occurred
2. **Context is Built** - Error context is created with event and phase information
3. **Handler is Called** - Error handler is invoked with error and context
4. **Rethrow Check** - If `rethrow` is true, error is re-thrown after handling
5. **Processing Continues** - If `rethrow` is false, processing continues

## Error Handling in Different Phases

### Interceptor Errors

```typescript
// Error in interceptor before phase
store.registerEventDb(
  'example',
  handler,
  [
    {
      id: 'risky-interceptor',
      before: (context) => {
        throw new Error('Interceptor error')
      }
    }
  ]
)

// Error handler receives:
// {
//   eventKey: 'example',
//   payload: {...},
//   phase: 'interceptor',
//   interceptor: { id: 'risky-interceptor', direction: 'before' }
// }
```

### Effect Errors

```typescript
// Error in effect handler
store.registerEffect('http', async (config, store) => {
  throw new Error('HTTP error')
})

// Error handler receives:
// {
//   eventKey: 'example',
//   payload: {...},
//   phase: 'effect',
//   interceptor: { id: 'http', direction: 'after' }
// }
```

### Subscription Errors

```typescript
// Error in subscription computation
store.registerSubscription('risky-sub', {
  compute: (state) => {
    throw new Error('Subscription error')
  }
})

// Error handler receives:
// {
//   eventKey: 'subscription:risky-sub',
//   payload: [],
//   phase: 'subscription'
// }
```

## Best Practices

1. **Always register an error handler** - Don't let errors go unhandled
2. **Log errors appropriately** - Use appropriate log levels
3. **Send to error tracking** - Use services like Sentry, LogRocket, etc.
4. **Provide context** - Error context helps debug issues
5. **Don't throw in error handler** - Unless `rethrow` is true, avoid throwing
6. **Handle different phases** - Different phases may need different handling

## Default Error Handler

The default error handler logs errors to the console with context:

```typescript
export function defaultErrorHandler(
  error: Error,
  context: ErrorContext,
  config: ErrorHandlerConfig
): void {
  const { eventKey, phase, interceptor } = context
  
  if (phase === 'interceptor' && interceptor) {
    console.error(
      `Error in ${interceptor.direction} phase of interceptor "${interceptor.id || 'unnamed'}" while handling event "${eventKey}":`,
      error
    )
  } else if (phase === 'effect' && interceptor) {
    console.error(
      `Error executing effect "${interceptor.id}" for event "${eventKey}":`,
      error
    )
  } else if (phase === 'subscription') {
    console.error(
      `Error in subscription "${eventKey}":`,
      error
    )
  } else {
    console.error(
      `Error handling event "${eventKey}":`,
      error
    )
  }
}
```


## Integration with Store

The error handler is configured when creating the store:

```typescript
const store = createStore({
  initialState: {},
  errorHandler: {
    handler: customErrorHandler,
    rethrow: false
  }
})
```

Or registered after store creation:

```typescript
store.registerErrorHandler(customErrorHandler, { rethrow: false })
```

## Testing

In tests, you may want to rethrow errors to fail tests:

```typescript
store.registerErrorHandler((error, context, config) => {
  console.error('Error in test:', error)
}, { rethrow: true })
```

Or suppress errors:

```typescript
store.registerErrorHandler(() => {
  // Suppress errors in tests
})
```

