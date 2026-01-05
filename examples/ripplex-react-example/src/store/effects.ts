import { EffectHandler, EffectMap } from '@rplx/core'

// Extend EffectMap to include our custom effects
// Using the path alias for module augmentation
declare module '@rplx/core' {
  interface EffectMap {
    'http-request'?: {
      url: string
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
      body?: any
      onSuccess?: string // event key
      onError?: string // event key
    }
    'local-storage'?: {
      key: string
      action: 'get' | 'set' | 'remove'
      value?: any
      onSuccess?: string // event key
      onError?: string // event key
    }
    'error-effect'?: {
      shouldThrow: boolean
    }
  }
}

/**
 * HTTP request effect handler
 * Simulates an API call and dispatches success/error events
 */
export const httpRequestEffect: EffectHandler<NonNullable<EffectMap['http-request']>> = async (
  config,
  store
) => {
  try {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Make actual HTTP request
    const response = await fetch(config.url, {
      method: config.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: config.body ? JSON.stringify(config.body) : undefined,
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    // Dispatch success event if provided
    if (config.onSuccess) {
      // Don't await - dispatch asynchronously to avoid deadlock
      store.dispatch(config.onSuccess, { data: JSON.stringify(data) })
    }
  } catch (error) {
    // Dispatch error event if provided
    if (config.onError) {
      // Don't await - dispatch asynchronously to avoid deadlock
      store.dispatch(config.onError, {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}

/**
 * Local storage effect handler
 * Handles localStorage operations
 */
export const localStorageEffect: EffectHandler<NonNullable<EffectMap['local-storage']>> = (
  config,
  store
) => {
  try {
    switch (config.action) {
      case 'get': {
        const value = localStorage.getItem(config.key)
        if (config.onSuccess) {
          // Don't await - dispatch asynchronously to avoid deadlock
          store.dispatch(config.onSuccess, { data: value })
        }
        break
      }
      case 'set': {
        localStorage.setItem(config.key, JSON.stringify(config.value))
        if (config.onSuccess) {
          // Don't await - dispatch asynchronously to avoid deadlock
          store.dispatch(config.onSuccess, { data: config.value })
        }
        break
      }
      case 'remove': {
        localStorage.removeItem(config.key)
        if (config.onSuccess) {
          // Don't await - dispatch asynchronously to avoid deadlock
          store.dispatch(config.onSuccess, {})
        }
        break
      }
    }
  } catch (error) {
    if (config.onError) {
      // Don't await - dispatch asynchronously to avoid deadlock
      store.dispatch(config.onError, {
        error: error instanceof Error ? error.message : 'LocalStorage error',
      })
    }
  }
}

/**
 * Error effect handler - throws an error for testing
 */
export const errorEffect: EffectHandler<NonNullable<EffectMap['error-effect']>> = async (
  config
) => {
  if (config.shouldThrow) {
    throw new Error('Effect execution error!')
  }
}

// Export all effect handlers
export const allEffectHandlers = {
  'http-request': httpRequestEffect,
  'local-storage': localStorageEffect,
  'error-effect': errorEffect,
}

