/**
 * Unit Tests: Built-in Effects
 * Tests all 6 built-in effect handlers
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { createEffectExecutor, EffectExecutorDependencies } from '../../src/modules/effects'
import { createRegistrar } from '../../src/modules/registrar'
import { createStateManager } from '../../src/modules/state'
import { createErrorHandler } from '../../src/modules/errorHandler'
import { EffectHandler, EffectMap } from '../../src/modules/types'

describe('Built-in Effects', () => {
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
        stateManager = createStateManager({ count: 0, items: [] })
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
        executor.registerBuiltInEffects()
    })

    describe(':db effect', () => {
        it('should update state', async () => {
            const effectMap: EffectMap = {
                db: { count: 5, items: ['a', 'b'] }
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(stateManager.getState()).toEqual({ count: 5, items: ['a', 'b'] })
        })

        it('should execute first before other effects', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
            const executionOrder: string[] = []

            registrar.register('effect', 'custom', () => {
                executionOrder.push('custom')
            })

            // Override db to track execution
            const originalDbHandler = registrar.get('effect', 'db')
            registrar.register('effect', 'db', (newState: any) => {
                executionOrder.push('db')
                if (originalDbHandler) {
                    originalDbHandler(newState, deps)
                }
            })

            const effectMap: EffectMap = {
                db: { count: 1 },
                custom: {}
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(executionOrder[0]).toBe('db')
            consoleWarnSpy.mockRestore()
        })

        it('should replace entire state', async () => {
            stateManager.setState({ count: 10, items: ['old'] })

            const effectMap: EffectMap = {
                db: { count: 0, newField: 'test' }
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(stateManager.getState()).toEqual({ count: 0, newField: 'test' })
        })

        it('should handle null state', async () => {
            const effectMap: EffectMap = {
                db: null as any
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(stateManager.getState()).toBe(null)
        })
    })

    describe(':dispatch effect', () => {
        it('should dispatch a single event', async () => {
            const effectMap: EffectMap = {
                dispatch: { event: 'save-data', payload: { id: 123 } }
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(dispatch).toHaveBeenCalledWith('save-data', { id: 123 })
        })

        it('should dispatch event without payload', async () => {
            const effectMap: EffectMap = {
                dispatch: { event: 'refresh' }
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(dispatch).toHaveBeenCalledWith('refresh', undefined)
        })

        it('should log error for invalid config (no event)', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

            const effectMap: EffectMap = {
                dispatch: { payload: 'test' } as any
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('ignoring bad :dispatch value'),
                expect.anything()
            )
            expect(dispatch).not.toHaveBeenCalled()

            consoleErrorSpy.mockRestore()
        })

        it('should skip null config silently', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

            const effectMap: EffectMap = {
                dispatch: null as any
            }

            await executor.execute(effectMap, 'test-event', {})

            // Null values are silently skipped by the executor before reaching the handler
            expect(consoleErrorSpy).not.toHaveBeenCalled()
            expect(dispatch).not.toHaveBeenCalled()

            consoleErrorSpy.mockRestore()
        })

        it('should log error for non-string event', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

            const effectMap: EffectMap = {
                dispatch: { event: 123 as any, payload: {} }
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(consoleErrorSpy).toHaveBeenCalled()
            expect(dispatch).not.toHaveBeenCalled()

            consoleErrorSpy.mockRestore()
        })
    })

    describe(':dispatch-n effect', () => {
        it('should dispatch multiple events sequentially', async () => {
            const effectMap: EffectMap = {
                'dispatch-n': [
                    { event: 'event1', payload: { id: 1 } },
                    { event: 'event2', payload: { id: 2 } },
                    { event: 'event3', payload: { id: 3 } }
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(dispatch).toHaveBeenCalledTimes(3)
            expect(dispatch).toHaveBeenNthCalledWith(1, 'event1', { id: 1 })
            expect(dispatch).toHaveBeenNthCalledWith(2, 'event2', { id: 2 })
            expect(dispatch).toHaveBeenNthCalledWith(3, 'event3', { id: 3 })
        })

        it('should dispatch events without payloads', async () => {
            const effectMap: EffectMap = {
                'dispatch-n': [
                    { event: 'event1' },
                    { event: 'event2' }
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(dispatch).toHaveBeenCalledTimes(2)
            expect(dispatch).toHaveBeenNthCalledWith(1, 'event1', undefined)
            expect(dispatch).toHaveBeenNthCalledWith(2, 'event2', undefined)
        })

        it('should handle empty array', async () => {
            const effectMap: EffectMap = {
                'dispatch-n': []
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(dispatch).not.toHaveBeenCalled()
        })

        it('should skip invalid entries', async () => {
            const effectMap: EffectMap = {
                'dispatch-n': [
                    { event: 'event1', payload: {} },
                    null as any,
                    { event: 'event2', payload: {} }
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(dispatch).toHaveBeenCalledTimes(2)
            expect(dispatch).toHaveBeenCalledWith('event1', {})
            expect(dispatch).toHaveBeenCalledWith('event2', {})
        })

        it('should log error for non-array config', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

            const effectMap: EffectMap = {
                'dispatch-n': { event: 'test' } as any
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('ignoring bad :dispatch-n value'),
                expect.anything()
            )
            expect(dispatch).not.toHaveBeenCalled()

            consoleErrorSpy.mockRestore()
        })
    })

    describe(':dispatch-later effect', () => {
        beforeEach(() => {
            jest.useFakeTimers()
        })

        afterEach(async () => {
            // Run all pending timers to completion to ensure all callbacks execute
            // This ensures any promises created by dispatch-later are resolved
            jest.runAllTimers()
            // Wait a tick to ensure all promise callbacks are processed
            await Promise.resolve()
            // Clear any remaining timers
            jest.clearAllTimers()
            jest.useRealTimers()
        })

        it('should dispatch events after specified delays', async () => {
            const effectMap: EffectMap = {
                'dispatch-later': [
                    { ms: 100, event: 'delayed1', payload: { id: 1 } },
                    { ms: 200, event: 'delayed2', payload: { id: 2 } }
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            // Initially no dispatches
            expect(dispatch).not.toHaveBeenCalled()

            // After 100ms
            jest.advanceTimersByTime(100)
            expect(dispatch).toHaveBeenCalledTimes(1)
            expect(dispatch).toHaveBeenCalledWith('delayed1', { id: 1 })

            // After another 100ms (200ms total)
            jest.advanceTimersByTime(100)
            expect(dispatch).toHaveBeenCalledTimes(2)
            expect(dispatch).toHaveBeenCalledWith('delayed2', { id: 2 })
        })

        it('should dispatch without payload', async () => {
            const effectMap: EffectMap = {
                'dispatch-later': [
                    { ms: 100, event: 'delayed' }
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            jest.advanceTimersByTime(100)
            expect(dispatch).toHaveBeenCalledWith('delayed', undefined)
        })

        it('should handle empty array', async () => {
            const effectMap: EffectMap = {
                'dispatch-later': []
            }

            await executor.execute(effectMap, 'test-event', {})

            jest.advanceTimersByTime(1000)
            expect(dispatch).not.toHaveBeenCalled()
        })

        it('should skip null entries', async () => {
            const effectMap: EffectMap = {
                'dispatch-later': [
                    { ms: 100, event: 'event1' },
                    null as any,
                    { ms: 200, event: 'event2' }
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            jest.advanceTimersByTime(300)
            expect(dispatch).toHaveBeenCalledTimes(2)
        })

        it('should log error for invalid entries (missing ms)', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

            const effectMap: EffectMap = {
                'dispatch-later': [
                    { event: 'test' } as any
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('ignoring bad :dispatch-later entry'),
                expect.anything()
            )

            consoleErrorSpy.mockRestore()
        })

        it('should log error for invalid entries (missing event)', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

            const effectMap: EffectMap = {
                'dispatch-later': [
                    { ms: 100 } as any
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('ignoring bad :dispatch-later entry'),
                expect.anything()
            )

            consoleErrorSpy.mockRestore()
        })

        it('should log error for non-array config', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

            const effectMap: EffectMap = {
                'dispatch-later': { ms: 100, event: 'test' } as any
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('ignoring bad :dispatch-later value'),
                expect.anything()
            )

            consoleErrorSpy.mockRestore()
        })

        it('should dispatch at correct times with different delays', async () => {
            const effectMap: EffectMap = {
                'dispatch-later': [
                    { ms: 50, event: 'fast' },
                    { ms: 150, event: 'medium' },
                    { ms: 300, event: 'slow' }
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            jest.advanceTimersByTime(50)
            expect(dispatch).toHaveBeenCalledTimes(1)
            expect(dispatch).toHaveBeenCalledWith('fast', undefined)

            jest.advanceTimersByTime(100)
            expect(dispatch).toHaveBeenCalledTimes(2)
            expect(dispatch).toHaveBeenCalledWith('medium', undefined)

            jest.advanceTimersByTime(150)
            expect(dispatch).toHaveBeenCalledTimes(3)
            expect(dispatch).toHaveBeenCalledWith('slow', undefined)
        })
    })

    describe(':fx meta-effect', () => {
        it('should execute effect tuples sequentially', async () => {
            const executionOrder: string[] = []

            registrar.register('effect', 'effect1', async () => {
                executionOrder.push('effect1')
                await new Promise(resolve => setTimeout(resolve, 10))
            })

            registrar.register('effect', 'effect2', async () => {
                executionOrder.push('effect2')
            })

            const effectMap: EffectMap = {
                fx: [
                    ['effect1', {}],
                    ['effect2', {}]
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(executionOrder).toEqual(['effect1', 'effect2'])
        })

        it('should pass config to effect handlers', async () => {
            const capturedConfigs: any[] = []

            registrar.register('effect', 'custom', (config: any) => {
                capturedConfigs.push(config)
            })

            const effectMap: EffectMap = {
                fx: [
                    ['custom', { id: 1 }],
                    ['custom', { id: 2 }]
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(capturedConfigs).toEqual([{ id: 1 }, { id: 2 }])
        })

        it('should skip null entries', async () => {
            const handler = jest.fn()
            registrar.register('effect', 'custom', handler)

            const effectMap: EffectMap = {
                fx: [
                    ['custom', { id: 1 }],
                    null as any,
                    ['custom', { id: 2 }]
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(handler).toHaveBeenCalledTimes(2)
        })

        it('should warn for missing effect handlers', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

            const effectMap: EffectMap = {
                fx: [
                    ['missing-effect', {}]
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('in ":fx" effect found "missing-effect" which has no associated handler')
            )

            consoleWarnSpy.mockRestore()
        })

        it('should warn for :db effect in fx', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

            const effectMap: EffectMap = {
                fx: [
                    ['db', { count: 1 }]
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('":fx" effect should not contain a :db effect')
            )

            consoleWarnSpy.mockRestore()
        })

        it('should handle errors in individual effects', async () => {
            const effect1 = jest.fn().mockRejectedValue(new Error('Effect 1 failed'))
            const effect2 = jest.fn().mockResolvedValue(undefined)

            registrar.register('effect', 'effect1', effect1)
            registrar.register('effect', 'effect2', effect2)

            const effectMap: EffectMap = {
                fx: [
                    ['effect1', {}],
                    ['effect2', {}]
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(effect1).toHaveBeenCalled()
            expect(effect2).toHaveBeenCalled()
        })

        it('should handle empty array', async () => {
            const effectMap: EffectMap = {
                fx: []
            }

            // Should not throw
            await expect(executor.execute(effectMap, 'test-event', {})).resolves.toBeUndefined()
        })

        it('should warn for non-array config', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

            const effectMap: EffectMap = {
                fx: { effect: 'test' } as any
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('":fx" effect expects an array'),
                expect.anything()
            )

            consoleWarnSpy.mockRestore()
        })

        it('should execute effects in order even with async handlers', async () => {
            const executionOrder: string[] = []

            registrar.register('effect', 'fast', async () => {
                await new Promise(resolve => setTimeout(resolve, 5))
                executionOrder.push('fast')
            })

            registrar.register('effect', 'slow', async () => {
                await new Promise(resolve => setTimeout(resolve, 20))
                executionOrder.push('slow')
            })

            const effectMap: EffectMap = {
                fx: [
                    ['slow', {}],
                    ['fast', {}]
                ]
            }

            await executor.execute(effectMap, 'test-event', {})

            // Should execute in order, not based on completion time
            expect(executionOrder).toEqual(['slow', 'fast'])
        })
    })

    describe(':deregister-event-handler effect', () => {
        it('should deregister a single event handler (string)', async () => {
            const effectMap: EffectMap = {
                'deregister-event-handler': 'event-to-remove'
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(deregisterEvent).toHaveBeenCalledWith('event-to-remove')
        })

        it('should deregister multiple event handlers (array)', async () => {
            const effectMap: EffectMap = {
                'deregister-event-handler': ['event1', 'event2', 'event3']
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(deregisterEvent).toHaveBeenCalledTimes(3)
            expect(deregisterEvent).toHaveBeenCalledWith('event1')
            expect(deregisterEvent).toHaveBeenCalledWith('event2')
            expect(deregisterEvent).toHaveBeenCalledWith('event3')
        })

        it('should skip non-string entries in array', async () => {
            const effectMap: EffectMap = {
                'deregister-event-handler': ['event1', 123 as any, 'event2', null as any]
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(deregisterEvent).toHaveBeenCalledTimes(2)
            expect(deregisterEvent).toHaveBeenCalledWith('event1')
            expect(deregisterEvent).toHaveBeenCalledWith('event2')
        })

        it('should handle empty array', async () => {
            const effectMap: EffectMap = {
                'deregister-event-handler': []
            }

            await executor.execute(effectMap, 'test-event', {})

            expect(deregisterEvent).not.toHaveBeenCalled()
        })
    })

    describe('Effect Config Validation', () => {
        it('should handle undefined effect values gracefully', async () => {
            const effectMap: EffectMap = {
                dispatch: undefined,
                'dispatch-n': undefined,
                'dispatch-later': undefined
            }

            // Should not throw
            await expect(executor.execute(effectMap, 'test-event', {})).resolves.toBeUndefined()
        })

        it('should handle malformed configs without crashing', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

            const effectMap: EffectMap = {
                dispatch: 'invalid' as any,
                'dispatch-n': 'invalid' as any,
                'dispatch-later': 'invalid' as any,
                fx: 'invalid' as any
            }

            // Should not throw
            await expect(executor.execute(effectMap, 'test-event', {})).resolves.toBeUndefined()

            consoleErrorSpy.mockRestore()
            consoleWarnSpy.mockRestore()
        })
    })
})

