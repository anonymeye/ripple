/**
 * Tests for the registrar module
 * Tests handler registration, retrieval, existence checks, and clearing
 */

import { createRegistrar, Registrar, HandlerKind } from '../../src/modules/registrar'

describe('Registrar', () => {
  let registrar: Registrar
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
    registrar = createRegistrar()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  describe('createRegistrar', () => {
    it('should create a new registrar instance', () => {
      expect(registrar).toBeDefined()
      expect(registrar.register).toBeInstanceOf(Function)
      expect(registrar.get).toBeInstanceOf(Function)
      expect(registrar.has).toBeInstanceOf(Function)
      expect(registrar.clear).toBeInstanceOf(Function)
    })

    it('should create registrar with default warnOnOverwrite option', () => {
      const reg = createRegistrar()
      reg.register('event', 'test-id', () => {})
      reg.register('event', 'test-id', () => {})
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        're-frame: overwriting event handler for: test-id'
      )
    })

    it('should create registrar with warnOnOverwrite disabled', () => {
      const reg = createRegistrar({ warnOnOverwrite: false })
      reg.register('event', 'test-id', () => {})
      reg.register('event', 'test-id', () => {})
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })
  })

  describe('register', () => {
    it('should register a handler for a given kind and id', () => {
      const handler = () => {}
      const result = registrar.register('event', 'test-event', handler)

      expect(result).toBe(handler)
      expect(registrar.has('event', 'test-event')).toBe(true)
    })

    it('should store handlers by kind and id', () => {
      const eventHandler = () => {}
      const effectHandler = () => {}

      registrar.register('event', 'test-id', eventHandler)
      registrar.register('effect', 'test-id', effectHandler)

      expect(registrar.get('event', 'test-id')).toBe(eventHandler)
      expect(registrar.get('effect', 'test-id')).toBe(effectHandler)
      expect(registrar.get('event', 'test-id')).not.toBe(effectHandler)
    })

    it('should warn when overwriting an existing handler', () => {
      const handler1 = () => {}
      const handler2 = () => {}

      registrar.register('event', 'test-id', handler1)
      registrar.register('event', 'test-id', handler2)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        're-frame: overwriting event handler for: test-id'
      )
      expect(registrar.get('event', 'test-id')).toBe(handler2)
    })

    it('should support multiple handler kinds', () => {
      const eventHandler = () => {}
      const effectHandler = () => {}
      const cofxHandler = () => {}
      const subHandler = () => {}
      const errorHandler = () => {}

      registrar.register('event', 'test', eventHandler)
      registrar.register('effect', 'test', effectHandler)
      registrar.register('cofx', 'test', cofxHandler)
      registrar.register('sub', 'test', subHandler)
      registrar.register('error', 'test', errorHandler)

      expect(registrar.get('event', 'test')).toBe(eventHandler)
      expect(registrar.get('effect', 'test')).toBe(effectHandler)
      expect(registrar.get('cofx', 'test')).toBe(cofxHandler)
      expect(registrar.get('sub', 'test')).toBe(subHandler)
      expect(registrar.get('error', 'test')).toBe(errorHandler)
    })

    it('should return the registered handler', () => {
      const handler = () => {}
      const result = registrar.register('event', 'test-id', handler)
      expect(result).toBe(handler)
    })

    it('should handle non-function handlers', () => {
      const objectHandler = { handle: () => {} }
      const stringHandler = 'handler-string'
      const numberHandler = 42

      registrar.register('event', 'obj', objectHandler)
      registrar.register('event', 'str', stringHandler)
      registrar.register('event', 'num', numberHandler)

      expect(registrar.get('event', 'obj')).toBe(objectHandler)
      expect(registrar.get('event', 'str')).toBe(stringHandler)
      expect(registrar.get('event', 'num')).toBe(numberHandler)
    })
  })

  describe('get', () => {
    it('should retrieve a registered handler', () => {
      const handler = () => {}
      registrar.register('event', 'test-id', handler)

      const retrieved = registrar.get('event', 'test-id')
      expect(retrieved).toBe(handler)
    })

    it('should return undefined for non-existent handler', () => {
      expect(registrar.get('event', 'non-existent')).toBeUndefined()
    })

    it('should return undefined for non-existent kind', () => {
      registrar.register('event', 'test-id', () => {})
      expect(registrar.get('effect', 'test-id')).toBeUndefined()
    })

    it('should return undefined when kind exists but id does not', () => {
      registrar.register('event', 'other-id', () => {})
      expect(registrar.get('event', 'test-id')).toBeUndefined()
    })

    it('should support type inference', () => {
      const handler = (x: number) => x * 2
      registrar.register<typeof handler>('event', 'test', handler)
      const retrieved = registrar.get<typeof handler>('event', 'test')
      expect(retrieved).toBe(handler)
      if (retrieved) {
        expect(retrieved(5)).toBe(10)
      }
    })
  })

  describe('has', () => {
    it('should return true for existing handler', () => {
      registrar.register('event', 'test-id', () => {})
      expect(registrar.has('event', 'test-id')).toBe(true)
    })

    it('should return false for non-existent handler', () => {
      expect(registrar.has('event', 'non-existent')).toBe(false)
    })

    it('should return false for non-existent kind', () => {
      registrar.register('event', 'test-id', () => {})
      expect(registrar.has('effect', 'test-id')).toBe(false)
    })

    it('should return false when kind exists but id does not', () => {
      registrar.register('event', 'other-id', () => {})
      expect(registrar.has('event', 'test-id')).toBe(false)
    })

    it('should return true after registration and false after clearing', () => {
      expect(registrar.has('event', 'test-id')).toBe(false)
      registrar.register('event', 'test-id', () => {})
      expect(registrar.has('event', 'test-id')).toBe(true)
      registrar.clear('event', 'test-id')
      expect(registrar.has('event', 'test-id')).toBe(false)
    })
  })

  describe('clear', () => {
    it('should clear all handlers when called without arguments', () => {
      registrar.register('event', 'id1', () => {})
      registrar.register('event', 'id2', () => {})
      registrar.register('effect', 'id1', () => {})

      registrar.clear()

      expect(registrar.has('event', 'id1')).toBe(false)
      expect(registrar.has('event', 'id2')).toBe(false)
      expect(registrar.has('effect', 'id1')).toBe(false)
    })

    it('should clear all handlers of a specific kind', () => {
      registrar.register('event', 'id1', () => {})
      registrar.register('event', 'id2', () => {})
      registrar.register('effect', 'id1', () => {})

      registrar.clear('event')

      expect(registrar.has('event', 'id1')).toBe(false)
      expect(registrar.has('event', 'id2')).toBe(false)
      expect(registrar.has('effect', 'id1')).toBe(true) // Should remain
    })

    it('should clear a specific handler by kind and id', () => {
      registrar.register('event', 'id1', () => {})
      registrar.register('event', 'id2', () => {})
      registrar.register('effect', 'id1', () => {})

      registrar.clear('event', 'id1')

      expect(registrar.has('event', 'id1')).toBe(false)
      expect(registrar.has('event', 'id2')).toBe(true) // Should remain
      expect(registrar.has('effect', 'id1')).toBe(true) // Should remain
    })

    it('should warn when trying to clear non-existent handler', () => {
      registrar.clear('event', 'non-existent')
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "re-frame: can't clear event handler for non-existent. Handler not found."
      )
    })

    it('should not warn when clearing existing handler', () => {
      registrar.register('event', 'test-id', () => {})
      registrar.clear('event', 'test-id')
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('should handle clearing from non-existent kind gracefully', () => {
      registrar.clear('effect', 'test-id')
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "re-frame: can't clear effect handler for test-id. Handler not found."
      )
    })

    it('should isolate handlers by kind when clearing', () => {
      registrar.register('event', 'same-id', () => {})
      registrar.register('effect', 'same-id', () => {})

      registrar.clear('event', 'same-id')

      expect(registrar.has('event', 'same-id')).toBe(false)
      expect(registrar.has('effect', 'same-id')).toBe(true)
    })
  })

  describe('multiple handler kinds isolation', () => {
    it('should keep handlers of different kinds separate', () => {
      const eventHandler = () => {}
      const effectHandler = () => {}
      const cofxHandler = () => {}

      registrar.register('event', 'shared-id', eventHandler)
      registrar.register('effect', 'shared-id', effectHandler)
      registrar.register('cofx', 'shared-id', cofxHandler)

      expect(registrar.get('event', 'shared-id')).toBe(eventHandler)
      expect(registrar.get('effect', 'shared-id')).toBe(effectHandler)
      expect(registrar.get('cofx', 'shared-id')).toBe(cofxHandler)
    })

    it('should allow same id across different kinds', () => {
      registrar.register('event', 'test', () => {})
      registrar.register('effect', 'test', () => {})
      registrar.register('sub', 'test', () => {})

      expect(registrar.has('event', 'test')).toBe(true)
      expect(registrar.has('effect', 'test')).toBe(true)
      expect(registrar.has('sub', 'test')).toBe(true)
    })
  })
})

