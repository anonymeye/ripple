/**
 * Unit Tests: Effect Executor
 * Tests the core effect execution logic
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { createEffectExecutor, EffectExecutorDependencies } from '../../src/modules/effects'
import { createRegistrar } from '../../src/modules/registrar'
import { createStateManager } from '../../src/modules/state'
import { createErrorHandler } from '../../src/modules/errorHandler'
import { EffectHandler, EffectMap } from '../../src/modules/types'

describe('Effect Executor', () => {
    let registrar: ReturnType<typeof createRegistrar>
    let stateManager: ReturnType<typeof createStateManager<any>>
    let errorHandler: ReturnType<typeof createErrorHandler>
    let dispatch: jest.Mock<(eventKey: string, payload: any) => Promise<void>>
    let deregisterEvent: jest.Mock<(eventKey: string) => void>
    let registerEffect: jest.Mock<(effectType: string, handler: EffectHandler) => void>
    let deps: EffectExecutorDependencies<any>
    let executor: ReturnType<typeof createEffectExecutor<any>>

    beforeEach(() => {
        registrar = createRegistrar()
        stateManager = createStateManager({ count: 0 })
        errorHandler = createErrorHandler()
        dispatch = jest.fn().mockResolvedValue(undefined)
        deregisterEvent = jest.fn()
        registerEffect = jest.fn((effectType, handler) => {
            registrar.register('effect', effectType, handler)
        })

        deps = {
            registrar,
            stateManager,
            errorHandler,
            dispatch,
            deregisterEvent,
            registerEffect
        }

        executor = createEffectExecutor(deps)
    })

    describe('execute()', () => {
        it('should execute :db effect first', async () => {
            const executionOrder: string[] = []

            // Register effects
            registrar.register('effect', 'db', (newState: any) => {
                executionOrder.push('db')
                stateManager.setState(newState)
            })

            registrar.register('effect', 'custom', async () => {
                executionOrder.push('custom')
            })

            // Execute effects
            const effectMap: EffectMap = {
                db: { count: 1 },
                custom: {}
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(executionOrder).toEqual(['db', 'custom'])
            expect(stateManager.getState()).toEqual({ count: 1 })
        })

        it('should execute non-db/fx effects in parallel', async () => {
            const startTimes: Record<string, number> = {}
            const endTimes: Record<string, number> = {}

            // Register effects that take time
            registrar.register('effect', 'effect1', async () => {
                startTimes.effect1 = Date.now()
                await new Promise(resolve => setTimeout(resolve, 50))
                endTimes.effect1 = Date.now()
            })

            registrar.register('effect', 'effect2', async () => {
                startTimes.effect2 = Date.now()
                await new Promise(resolve => setTimeout(resolve, 50))
                endTimes.effect2 = Date.now()
            })

            const effectMap: EffectMap = {
                effect1: {},
                effect2: {}
            }

            await executor.execute(effectMap, 'test-event', {})

            // If parallel, start times should be close (within 10ms)
            const timeDiff = Math.abs(startTimes.effect1 - startTimes.effect2)
            expect(timeDiff).toBeLessThan(10)
        })

        it('should execute :fx effect last', async () => {
            const executionOrder: string[] = []

            registrar.register('effect', 'db', () => {
                executionOrder.push('db')
            })

            registrar.register('effect', 'custom', async () => {
                executionOrder.push('custom')
            })

            registrar.register('effect', 'fx', async () => {
                executionOrder.push('fx')
            })

            const effectMap: EffectMap = {
                db: { count: 1 },
                custom: {},
                fx: []
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(executionOrder[0]).toBe('db')
            expect(executionOrder[executionOrder.length - 1]).toBe('fx')
        })

        it('should warn when effect handler is missing', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

            const effectMap: EffectMap = {
                'missing-effect': { data: 'test' }
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'No effect handler registered for "missing-effect"'
            )

            consoleWarnSpy.mockRestore()
        })

        it('should skip null and undefined effect values', async () => {
            const customHandler = jest.fn()
            registrar.register('effect', 'custom', customHandler)

            const effectMap: EffectMap = {
                custom: null as any
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(customHandler).not.toHaveBeenCalled()
        })

        it('should isolate effect errors (one fails, others continue)', async () => {
            const effect1 = jest.fn().mockRejectedValue(new Error('Effect 1 failed'))
            const effect2 = jest.fn().mockResolvedValue(undefined)
            const effect3 = jest.fn().mockResolvedValue(undefined)

            registrar.register('effect', 'effect1', effect1)
            registrar.register('effect', 'effect2', effect2)
            registrar.register('effect', 'effect3', effect3)

            const effectMap: EffectMap = {
                effect1: {},
                effect2: {},
                effect3: {}
            }

            // Should not throw
            await executor.execute(effectMap, 'test-event', {})

            expect(effect1).toHaveBeenCalled()
            expect(effect2).toHaveBeenCalled()
            expect(effect3).toHaveBeenCalled()
        })

        it('should handle errors in :db effect', async () => {
            const errorHandlerSpy = jest.spyOn(errorHandler, 'handle')

            registrar.register('effect', 'db', () => {
                throw new Error('DB effect failed')
            })

            const effectMap: EffectMap = {
                db: { count: 1 }
            }

            await executor.execute(effectMap, 'test-event', { value: 123 })

            expect(errorHandlerSpy).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    eventKey: 'test-event',
                    payload: { value: 123 },
                    phase: 'effect',
                    interceptor: {
                        id: 'db',
                        direction: 'after'
                    }
                })
            )
        })

        it('should handle errors in :fx effect', async () => {
            const errorHandlerSpy = jest.spyOn(errorHandler, 'handle')

            registrar.register('effect', 'fx', () => {
                throw new Error('FX effect failed')
            })

            const effectMap: EffectMap = {
                fx: []
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(errorHandlerSpy).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    eventKey: 'test-event',
                    phase: 'effect',
                    interceptor: {
                        id: 'fx',
                        direction: 'after'
                    }
                })
            )
        })

        it('should track effect execution traces', async () => {
            registrar.register('effect', 'db', (newState: any) => {
                stateManager.setState(newState)
            })

            registrar.register('effect', 'custom', async () => {
                await new Promise(resolve => setTimeout(resolve, 10))
            })

            const effectMap: EffectMap = {
                db: { count: 1 },
                custom: { data: 'test' }
            }

            const effectsExecuted: any[] = []
            await executor.execute(effectMap, 'test-event', {}, effectsExecuted)

            expect(effectsExecuted).toHaveLength(2)
            expect(effectsExecuted[0]).toMatchObject({
                effectType: 'db',
                config: { count: 1 },
                duration: expect.any(Number)
            })
            expect(effectsExecuted[1]).toMatchObject({
                effectType: 'custom',
                config: { data: 'test' },
                duration: expect.any(Number)
            })
        })

        it('should track effect errors in traces', async () => {
            registrar.register('effect', 'failing', () => {
                throw new Error('Effect failed')
            })

            const effectMap: EffectMap = {
                failing: {}
            }

            const effectsExecuted: any[] = []
            await executor.execute(effectMap, 'test-event', {}, effectsExecuted)

            expect(effectsExecuted).toHaveLength(1)
            expect(effectsExecuted[0]).toMatchObject({
                effectType: 'failing',
                error: expect.any(Error)
            })
        })

        it('should pass deps to effect handlers', async () => {
            let receivedDeps: any = null

            registrar.register('effect', 'custom', async (config: any, deps: any) => {
                receivedDeps = deps
            })

            const effectMap: EffectMap = {
                custom: {}
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(receivedDeps).toBe(deps)
        })

        it('should handle empty effect map', async () => {
            const effectMap: EffectMap = {}

            // Should not throw
            await expect(executor.execute(effectMap, 'test-event', {})).resolves.toBeUndefined()
        })

        it('should execute effects in correct order: db → parallel → fx', async () => {
            const executionOrder: string[] = []

            registrar.register('effect', 'db', () => {
                executionOrder.push('db')
            })

            registrar.register('effect', 'effect1', async () => {
                await new Promise(resolve => setTimeout(resolve, 10))
                executionOrder.push('effect1')
            })

            registrar.register('effect', 'effect2', async () => {
                await new Promise(resolve => setTimeout(resolve, 5))
                executionOrder.push('effect2')
            })

            registrar.register('effect', 'fx', async () => {
                executionOrder.push('fx')
            })

            const effectMap: EffectMap = {
                db: { count: 1 },
                effect1: {},
                effect2: {},
                fx: []
            }

            await executor.execute(effectMap, 'test-event', {})

            // db should be first
            expect(executionOrder[0]).toBe('db')
            // fx should be last
            expect(executionOrder[executionOrder.length - 1]).toBe('fx')
            // effect1 and effect2 should be in between (order may vary due to parallel execution)
            expect(executionOrder).toContain('effect1')
            expect(executionOrder).toContain('effect2')
        })
    })

    describe('registerBuiltInEffects()', () => {
        it('should register all built-in effects', () => {
            executor.registerBuiltInEffects()

            expect(registrar.has('effect', 'db')).toBe(true)
            expect(registrar.has('effect', 'dispatch')).toBe(true)
            expect(registrar.has('effect', 'dispatch-n')).toBe(true)
            expect(registrar.has('effect', 'dispatch-later')).toBe(true)
            expect(registrar.has('effect', 'fx')).toBe(true)
            expect(registrar.has('effect', 'deregister-event-handler')).toBe(true)
        })

        it('should register effect handlers via registerEffect callback', () => {
            executor.registerBuiltInEffects()

            expect(registerEffect).toHaveBeenCalledWith('db', expect.any(Function))
            expect(registerEffect).toHaveBeenCalledWith('dispatch', expect.any(Function))
            expect(registerEffect).toHaveBeenCalledWith('dispatch-n', expect.any(Function))
            expect(registerEffect).toHaveBeenCalledWith('dispatch-later', expect.any(Function))
            expect(registerEffect).toHaveBeenCalledWith('fx', expect.any(Function))
            expect(registerEffect).toHaveBeenCalledWith('deregister-event-handler', expect.any(Function))
        })
    })

    describe('Effect Execution Order', () => {
        it('should guarantee :db executes before other effects', async () => {
            let dbExecuted = false
            let customCanSeeDbChange = false

            registrar.register('effect', 'db', (newState: any) => {
                stateManager.setState(newState)
                dbExecuted = true
            })

            registrar.register('effect', 'custom', () => {
                customCanSeeDbChange = dbExecuted && stateManager.getState().count === 5
            })

            const effectMap: EffectMap = {
                db: { count: 5 },
                custom: {}
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(customCanSeeDbChange).toBe(true)
        })

        it('should guarantee :fx executes after all other effects', async () => {
            const executionOrder: string[] = []

            registrar.register('effect', 'effect1', async () => {
                await new Promise(resolve => setTimeout(resolve, 20))
                executionOrder.push('effect1')
            })

            registrar.register('effect', 'effect2', async () => {
                await new Promise(resolve => setTimeout(resolve, 10))
                executionOrder.push('effect2')
            })

            registrar.register('effect', 'fx', () => {
                executionOrder.push('fx')
            })

            const effectMap: EffectMap = {
                effect1: {},
                effect2: {},
                fx: []
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(executionOrder[executionOrder.length - 1]).toBe('fx')
            expect(executionOrder).toContain('effect1')
            expect(executionOrder).toContain('effect2')
        })
    })

    describe('Custom Effect Registration', () => {
        it('should allow registering custom effects', async () => {
            const customHandler = jest.fn()
            registrar.register('effect', 'my-custom-effect', customHandler)

            const effectMap: EffectMap = {
                'my-custom-effect': { data: 'test' }
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(customHandler).toHaveBeenCalledWith({ data: 'test' }, deps)
        })

        it('should allow custom effects to access deps', async () => {
            let capturedState: any = null

            registrar.register('effect', 'read-state', (config: any, deps: any) => {
                capturedState = deps.stateManager.getState()
            })

            stateManager.setState({ count: 42 })

            const effectMap: EffectMap = {
                'read-state': {}
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(capturedState).toEqual({ count: 42 })
        })
    })
})

