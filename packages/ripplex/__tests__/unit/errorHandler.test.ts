/**
 * Tests for the error handler module
 * Tests error handler registration, execution, and configuration
 * Note: Uses mocked console for testing
 */

import {
  createErrorHandler,
  defaultErrorHandler,
  ErrorHandlerManager
} from '../../src/modules/errorHandler'
import { ErrorContext, ErrorHandlerConfig } from '../../src/modules/types'

describe('ErrorHandler', () => {
  let consoleErrorSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('createErrorHandler', () => {
    it('should create an error handler manager', () => {
      const manager = createErrorHandler()

      expect(manager).toBeDefined()
      expect(manager.register).toBeInstanceOf(Function)
      expect(manager.handle).toBeInstanceOf(Function)
    })

    it('should create handler with default error handler', async () => {
      const manager = createErrorHandler()
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      await manager.handle(error, context)

      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should create handler with initial error handler', async () => {
      const customHandler = jest.fn()
      const manager = createErrorHandler(customHandler)
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      await manager.handle(error, context)

      expect(customHandler).toHaveBeenCalledWith(
        error,
        context,
        expect.objectContaining({ rethrow: false })
      )
    })

    it('should create handler with initial config', async () => {
      const customHandler = jest.fn()
      const initialConfig: ErrorHandlerConfig = { rethrow: true }
      const manager = createErrorHandler(customHandler, initialConfig)
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      await expect(manager.handle(error, context)).rejects.toThrow('Test error')
      expect(customHandler).toHaveBeenCalledWith(
        error,
        context,
        expect.objectContaining({ rethrow: true })
      )
    })
  })

  describe('register', () => {
    it('should register a new error handler', async () => {
      const manager = createErrorHandler()
      const customHandler = jest.fn()
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      manager.register(customHandler)
      await manager.handle(error, context)

      expect(customHandler).toHaveBeenCalledWith(
        error,
        context,
        expect.objectContaining({ rethrow: false })
      )
    })

    it('should update config when registering new handler', async () => {
      const manager = createErrorHandler()
      const customHandler = jest.fn()
      const newConfig: ErrorHandlerConfig = { rethrow: true }
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      manager.register(customHandler, newConfig)
      await expect(manager.handle(error, context)).rejects.toThrow('Test error')
      expect(customHandler).toHaveBeenCalledWith(
        error,
        context,
        expect.objectContaining({ rethrow: true })
      )
    })

    it('should merge config with existing config', async () => {
      const manager = createErrorHandler(undefined, { rethrow: false })
      const customHandler = jest.fn()
      const partialConfig: ErrorHandlerConfig = { rethrow: true }
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      manager.register(customHandler, partialConfig)
      await expect(manager.handle(error, context)).rejects.toThrow('Test error')
      expect(customHandler).toHaveBeenCalledWith(
        error,
        context,
        expect.objectContaining({ rethrow: true })
      )
    })

    it('should replace previous handler when registering new one', async () => {
      const firstHandler = jest.fn()
      const secondHandler = jest.fn()
      const manager = createErrorHandler(firstHandler)
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      manager.register(secondHandler)
      await manager.handle(error, context)

      expect(firstHandler).not.toHaveBeenCalled()
      expect(secondHandler).toHaveBeenCalled()
    })
  })

  describe('handle', () => {
    it('should call registered error handler', async () => {
      const customHandler = jest.fn()
      const manager = createErrorHandler(customHandler)
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: { id: 123 },
        phase: 'effect'
      }

      await manager.handle(error, context)

      expect(customHandler).toHaveBeenCalledWith(
        error,
        context,
        expect.objectContaining({ rethrow: false })
      )
    })

    it('should pass correct context to handler', async () => {
      const customHandler = jest.fn()
      const manager = createErrorHandler(customHandler)
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'my-event',
        payload: { data: 'test' },
        phase: 'subscription',
        interceptor: {
          id: 'my-interceptor',
          direction: 'before'
        }
      }

      await manager.handle(error, context)

      expect(customHandler).toHaveBeenCalledWith(
        error,
        context,
        expect.any(Object)
      )
    })

    it('should not rethrow error by default', async () => {
      const customHandler = jest.fn()
      const manager = createErrorHandler(customHandler)
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      await expect(manager.handle(error, context)).resolves.not.toThrow()
      expect(customHandler).toHaveBeenCalled()
    })

    it('should rethrow error when rethrow config is true', async () => {
      const customHandler = jest.fn()
      const manager = createErrorHandler(customHandler, { rethrow: true })
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      await expect(manager.handle(error, context)).rejects.toThrow('Test error')
      expect(customHandler).toHaveBeenCalled()
    })

    it('should handle async error handlers', async () => {
      const asyncHandler = jest.fn().mockResolvedValue(undefined)
      const manager = createErrorHandler(asyncHandler)
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      await manager.handle(error, context)

      expect(asyncHandler).toHaveBeenCalled()
    })

    it('should handle errors thrown by error handler', async () => {
      const throwingHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error')
      })
      const manager = createErrorHandler(throwingHandler)
      const error = new Error('Original error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      await manager.handle(error, context)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in error handler:',
        expect.any(Error)
      )
    })

    it('should rethrow original error when handler throws and rethrow is true', async () => {
      const throwingHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error')
      })
      const manager = createErrorHandler(throwingHandler, { rethrow: true })
      const originalError = new Error('Original error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      await expect(manager.handle(originalError, context)).rejects.toThrow(
        'Original error'
      )
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should not rethrow when handler throws and rethrow is false', async () => {
      const throwingHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error')
      })
      const manager = createErrorHandler(throwingHandler, { rethrow: false })
      const originalError = new Error('Original error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      await expect(manager.handle(originalError, context)).resolves.not.toThrow()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should handle async errors from error handler', async () => {
      const asyncThrowingHandler = jest
        .fn()
        .mockRejectedValue(new Error('Async handler error'))
      const manager = createErrorHandler(asyncThrowingHandler)
      const originalError = new Error('Original error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      await manager.handle(originalError, context)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in error handler:',
        expect.any(Error)
      )
    })
  })

  describe('defaultErrorHandler', () => {
    it('should log error for interceptor phase', () => {
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor',
        interceptor: {
          id: 'my-interceptor',
          direction: 'before'
        }
      }

      defaultErrorHandler(error, context, { rethrow: false })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in before phase of interceptor "my-interceptor" while handling event "test-event":',
        error
      )
    })

    it('should log error for interceptor phase without id', () => {
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor',
        interceptor: {
          direction: 'after'
        }
      }

      defaultErrorHandler(error, context, { rethrow: false })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in after phase of interceptor "unnamed" while handling event "test-event":',
        error
      )
    })

    it('should log error for effect phase', () => {
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'effect',
        interceptor: {
          id: 'my-effect'
        }
      }

      defaultErrorHandler(error, context, { rethrow: false })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error executing effect "my-effect" for event "test-event":',
        error
      )
    })

    it('should log error for subscription phase', () => {
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'my-subscription',
        payload: {},
        phase: 'subscription'
      }

      defaultErrorHandler(error, context, { rethrow: false })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in subscription "my-subscription":',
        error
      )
    })

    it('should log generic error for unknown phase', () => {
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor' // Using interceptor but without interceptor info
      }

      // Remove interceptor to test generic case
      const contextWithoutInterceptor: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'interceptor'
      }

      defaultErrorHandler(error, contextWithoutInterceptor, { rethrow: false })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error handling event "test-event":',
        error
      )
    })

    it('should handle error context structure correctly', () => {
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'complex-event',
        payload: { nested: { data: 'value' } },
        phase: 'subscription'
      }

      defaultErrorHandler(error, context, { rethrow: false })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in subscription "complex-event":',
        error
      )
    })
  })

  describe('error context structure', () => {
    it('should handle complete error context', async () => {
      const customHandler = jest.fn()
      const manager = createErrorHandler(customHandler)
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: { id: 1, name: 'test' },
        phase: 'interceptor',
        interceptor: {
          id: 'test-interceptor',
          direction: 'before'
        }
      }

      await manager.handle(error, context)

      expect(customHandler).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          eventKey: 'test-event',
          payload: { id: 1, name: 'test' },
          phase: 'interceptor',
          interceptor: {
            id: 'test-interceptor',
            direction: 'before'
          }
        }),
        expect.any(Object)
      )
    })

    it('should handle minimal error context', async () => {
      const customHandler = jest.fn()
      const manager = createErrorHandler(customHandler)
      const error = new Error('Test error')
      const context: ErrorContext = {
        eventKey: 'test-event',
        payload: {},
        phase: 'subscription'
      }

      await manager.handle(error, context)

      expect(customHandler).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          eventKey: 'test-event',
          payload: {},
          phase: 'subscription'
        }),
        expect.any(Object)
      )
    })
  })
})

