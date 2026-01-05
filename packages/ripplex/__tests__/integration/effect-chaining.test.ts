/**
 * Integration Tests: Effect Chaining
 * Tests complex effect execution scenarios and chaining
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { createEffectExecutor, EffectExecutorDependencies, mergeEffects } from '../../src/modules/effects'
import { createRegistrar } from '../../src/modules/registrar'
import { createStateManager } from '../../src/modules/state'
import { createErrorHandler } from '../../src/modules/errorHandler'
import { EffectMap } from '../../src/modules/types'

describe('Effect Chaining Integration', () => {
    let registrar: ReturnType<typeof createRegistrar>
    let stateManager: ReturnType<typeof createStateManager<any>>
    let errorHandler: ReturnType<typeof createErrorHandler>
    let dispatch: jest.Mock<(eventKey: string, payload: any) => Promise<void>>
    let deregisterEvent: jest.Mock<(eventKey: string) => void>
    let registerEffect: jest.Mock
    let deps: EffectExecutorDependencies<any>
    let executor: ReturnType<typeof createEffectExecutor<any>>

    beforeEach(() => {
        registrar = createRegistrar()
        stateManager = createStateManager({ count: 0, items: [], logs: [] })
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

    describe('Event → Effect → Dispatch → Event Chain', () => {
        it('should handle event dispatching from effects', async () => {
            const effectMap: EffectMap = {
                db: { count: 1 },
                dispatch: { event: 'save-complete', payload: { id: 123 } }
            }

            await executor.execute(effectMap, 'increment', {})

            expect(stateManager.getState().count).toBe(1)
            expect(dispatch).toHaveBeenCalledWith('save-complete', { id: 123 })
        })

        it('should handle multiple nested dispatches', async () => {
            const effectMap: EffectMap = {
                db: { count: 1 },
                'dispatch-n': [
                    { event: 'log-action', payload: { action: 'increment' } },
                    { event: 'update-ui', payload: {} },
                    { event: 'sync-server', payload: { count: 1 } }
                ]
            }

            await executor.execute(effectMap, 'increment', {})

            expect(dispatch).toHaveBeenCalledTimes(3)
            expect(dispatch).toHaveBeenNthCalledWith(1, 'log-action', { action: 'increment' })
            expect(dispatch).toHaveBeenNthCalledWith(2, 'update-ui', {})
            expect(dispatch).toHaveBeenNthCalledWith(3, 'sync-server', { count: 1 })
        })

        it('should handle dispatch chain with state updates', async () => {
            const events: string[] = []

            // Simulate a chain: increment → save → notify
            dispatch.mockImplementation(async (event: string) => {
                events.push(event)
            })

            const effectMap: EffectMap = {
                db: { count: 5 },
                dispatch: { event: 'save-data' }
            }

            await executor.execute(effectMap, 'increment', {})

            expect(stateManager.getState().count).toBe(5)
            expect(events).toContain('save-data')
        })
    })

    describe('Effect Execution with :fx', () => {
        it('should execute fx effects sequentially after other effects', async () => {
            const executionLog: string[] = []

            registrar.register('effect', 'log', (message: string) => {
                executionLog.push(message)
            })

            const effectMap: EffectMap = {
                db: { count: 1 },
                fx: [
                    ['log', 'first'],
                    ['log', 'second'],
                    ['log', 'third']
                ]
            }

            await executor.execute(effectMap, 'test', {})

            expect(executionLog).toEqual(['first', 'second', 'third'])
            expect(stateManager.getState().count).toBe(1)
        })

        it('should allow fx effects to dispatch events', async () => {
            registrar.register('effect', 'custom-dispatch', async (config: any, deps: any) => {
                await deps.dispatch(config.event, config.payload)
            })

            const effectMap: EffectMap = {
                db: { count: 1 },
                fx: [
                    ['custom-dispatch', { event: 'event1', payload: { id: 1 } }],
                    ['custom-dispatch', { event: 'event2', payload: { id: 2 } }]
                ]
            }

            await executor.execute(effectMap, 'test', {})

            expect(dispatch).toHaveBeenCalledTimes(2)
            expect(dispatch).toHaveBeenCalledWith('event1', { id: 1 })
            expect(dispatch).toHaveBeenCalledWith('event2', { id: 2 })
        })

        it('should execute fx effects after parallel effects complete', async () => {
            jest.useFakeTimers()
            try {
                const executionLog: string[] = []

                registrar.register('effect', 'async-effect', async () => {
                    await new Promise(resolve => setTimeout(resolve, 20))
                    executionLog.push('async-effect')
                })

                registrar.register('effect', 'log', (message: string) => {
                    executionLog.push(message)
                })

                const effectMap: EffectMap = {
                    'async-effect': {},
                    fx: [['log', 'fx-effect']]
                }

                // Start execution and run timers asynchronously
                const executePromise = executor.execute(effectMap, 'test', {})
                await jest.runAllTimersAsync()
                await executePromise

                expect(executionLog).toEqual(['async-effect', 'fx-effect'])
            } finally {
                jest.clearAllTimers()
                jest.useRealTimers()
            }
        })
    })

    describe('Effect Merging in Interceptor Chain', () => {
        it('should merge effects from multiple interceptors', () => {
            const beforeInterceptor1: EffectMap = {
                'dispatch-n': [{ event: 'validate' }]
            }

            const beforeInterceptor2: EffectMap = {
                'dispatch-n': [{ event: 'log' }]
            }

            const handlerEffects: EffectMap = {
                db: { count: 1 },
                dispatch: { event: 'save' }
            }

            const afterInterceptor1: EffectMap = {
                'dispatch-n': [{ event: 'notify' }]
            }

            const merged = mergeEffects(
                beforeInterceptor1,
                beforeInterceptor2,
                handlerEffects,
                afterInterceptor1
            )

            expect(merged).toEqual({
                db: { count: 1 },
                dispatch: { event: 'save' },
                'dispatch-n': [
                    { event: 'validate' },
                    { event: 'log' },
                    { event: 'notify' }
                ]
            })
        })

        it('should allow interceptors to override :db effect', () => {
            const handlerEffects: EffectMap = {
                db: { count: 1, loading: true }
            }

            const afterInterceptor: EffectMap = {
                db: { count: 1, loading: false, timestamp: Date.now() }
            }

            const merged = mergeEffects(handlerEffects, afterInterceptor)

            expect(merged.db).toHaveProperty('loading', false)
            expect(merged.db).toHaveProperty('timestamp')
            expect(merged.db).not.toHaveProperty('loading', true)
        })

        it('should accumulate side effects from interceptors', () => {
            const validationEffects: EffectMap = {
                'dispatch-n': [{ event: 'validation-passed' }]
            }

            const loggingEffects: EffectMap = {
                fx: [['log', { level: 'info', message: 'Action executed' }]]
            }

            const analyticsEffects: EffectMap = {
                'dispatch-later': [{ ms: 100, event: 'track-event' }]
            }

            const merged = mergeEffects(validationEffects, loggingEffects, analyticsEffects)

            expect(merged['dispatch-n']).toHaveLength(1)
            expect(merged.fx).toHaveLength(1)
            expect(merged['dispatch-later']).toHaveLength(1)
        })
    })

    describe('Error Recovery in Effect Chains', () => {
        it('should continue executing effects after one fails', async () => {
            const successEffect = jest.fn().mockResolvedValue(undefined)
            const failingEffect = jest.fn().mockRejectedValue(new Error('Effect failed'))

            registrar.register('effect', 'success', successEffect)
            registrar.register('effect', 'failing', failingEffect)

            const effectMap: EffectMap = {
                failing: {},
                success: {}
            }

            await executor.execute(effectMap, 'test', {})

            expect(failingEffect).toHaveBeenCalled()
            expect(successEffect).toHaveBeenCalled()
        })

        it('should handle errors in :fx effects without stopping chain', async () => {
            const executionLog: string[] = []

            registrar.register('effect', 'success', () => {
                executionLog.push('success')
            })

            registrar.register('effect', 'failing', () => {
                executionLog.push('failing')
                throw new Error('Effect failed')
            })

            const effectMap: EffectMap = {
                fx: [
                    ['success', {}],
                    ['failing', {}],
                    ['success', {}]
                ]
            }

            await executor.execute(effectMap, 'test', {})

            expect(executionLog).toEqual(['success', 'failing', 'success'])
        })

        it('should report errors to error handler', async () => {
            const errorHandlerSpy = jest.spyOn(errorHandler, 'handle')

            registrar.register('effect', 'failing', () => {
                throw new Error('Custom effect failed')
            })

            const effectMap: EffectMap = {
                failing: { data: 'test' }
            }

            await executor.execute(effectMap, 'test-event', { value: 123 })

            expect(errorHandlerSpy).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    eventKey: 'test-event',
                    payload: { value: 123 },
                    phase: 'effect'
                })
            )
        })
    })

    describe('Complex Real-World Scenarios', () => {
        it('should handle form submission workflow', async () => {
            jest.useFakeTimers()
            try {
                const effectMap: EffectMap = {
                    db: { form: { submitted: true, loading: true } },
                    'dispatch-n': [
                        { event: 'validate-form', payload: {} },
                        { event: 'show-loading', payload: {} }
                    ],
                    'dispatch-later': [
                        { ms: 2000, event: 'submit-to-server', payload: { formData: {} } }
                    ]
                }

                await executor.execute(effectMap, 'submit-form', {})

                // Run all timers to ensure dispatch-later callbacks execute
                jest.runAllTimers()
                await Promise.resolve()

                expect(stateManager.getState().form).toEqual({ submitted: true, loading: true })
                expect(dispatch).toHaveBeenCalledWith('validate-form', {})
                expect(dispatch).toHaveBeenCalledWith('show-loading', {})
            } finally {
                jest.clearAllTimers()
                jest.useRealTimers()
            }
        })

        it('should handle data fetching workflow', async () => {
            jest.useFakeTimers()
            try {
                registrar.register('effect', 'http-get', async (config: any, deps: any) => {
                    // Simulate API call
                    await new Promise(resolve => setTimeout(resolve, 10))
                    await deps.dispatch('fetch-success', { data: ['item1', 'item2'] })
                })

                const effectMap: EffectMap = {
                    db: { loading: true },
                    fx: [
                        ['http-get', { url: '/api/items' }]
                    ]
                }

                // Start execution and run timers asynchronously
                const executePromise = executor.execute(effectMap, 'fetch-items', {})
                await jest.runAllTimersAsync()
                await executePromise

                expect(stateManager.getState().loading).toBe(true)
                expect(dispatch).toHaveBeenCalledWith('fetch-success', { data: ['item1', 'item2'] })
            } finally {
                jest.clearAllTimers()
                jest.useRealTimers()
            }
        })

        it('should handle cleanup workflow', async () => {
            const effectMap: EffectMap = {
                db: { activeView: null },
                'deregister-event-handler': ['view-mounted', 'view-updated'],
                'dispatch-n': [
                    { event: 'cleanup-subscriptions', payload: {} },
                    { event: 'clear-cache', payload: {} }
                ]
            }

            await executor.execute(effectMap, 'unmount-view', {})

            expect(stateManager.getState().activeView).toBeNull()
            expect(deregisterEvent).toHaveBeenCalledWith('view-mounted')
            expect(deregisterEvent).toHaveBeenCalledWith('view-updated')
            expect(dispatch).toHaveBeenCalledWith('cleanup-subscriptions', {})
            expect(dispatch).toHaveBeenCalledWith('clear-cache', {})
        })

        it('should handle multi-step wizard workflow', async () => {
            jest.useFakeTimers()
            try {
                const executionLog: string[] = []

                registrar.register('effect', 'save-step', async (step: number) => {
                    executionLog.push(`save-step-${step}`)
                    await new Promise(resolve => setTimeout(resolve, 5))
                })

                const effectMap: EffectMap = {
                    db: { currentStep: 2, steps: { 1: { completed: true } } },
                    fx: [
                        ['save-step', 1],
                        ['save-step', 2]
                    ],
                    'dispatch-later': [
                        { ms: 100, event: 'navigate-to-step', payload: { step: 3 } }
                    ]
                }

                // Start execution and run timers asynchronously
                const executePromise = executor.execute(effectMap, 'complete-step', {})
                await jest.runAllTimersAsync()
                await executePromise

                expect(stateManager.getState().currentStep).toBe(2)
                expect(executionLog).toEqual(['save-step-1', 'save-step-2'])
            } finally {
                jest.clearAllTimers()
                jest.useRealTimers()
            }
        })
    })

    describe('Delayed Dispatch Integration', () => {
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

        it('should handle immediate and delayed dispatches together', async () => {
            const effectMap: EffectMap = {
                db: { count: 1 },
                'dispatch-n': [
                    { event: 'immediate1' },
                    { event: 'immediate2' }
                ],
                'dispatch-later': [
                    { ms: 100, event: 'delayed1' },
                    { ms: 200, event: 'delayed2' }
                ]
            }

            await executor.execute(effectMap, 'test', {})

            // Immediate dispatches happen right away
            expect(dispatch).toHaveBeenCalledTimes(2)
            expect(dispatch).toHaveBeenCalledWith('immediate1', undefined)
            expect(dispatch).toHaveBeenCalledWith('immediate2', undefined)

            // Delayed dispatches happen later
            jest.advanceTimersByTime(100)
            expect(dispatch).toHaveBeenCalledTimes(3)
            expect(dispatch).toHaveBeenCalledWith('delayed1', undefined)

            jest.advanceTimersByTime(100)
            expect(dispatch).toHaveBeenCalledTimes(4)
            expect(dispatch).toHaveBeenCalledWith('delayed2', undefined)
        })

        it('should handle debouncing pattern with dispatch-later', async () => {
            const effectMap: EffectMap = {
                db: { searchQuery: 'test' },
                'dispatch-later': [
                    { ms: 300, event: 'perform-search', payload: { query: 'test' } }
                ]
            }

            await executor.execute(effectMap, 'update-search', {})

            // Search hasn't been dispatched yet
            expect(dispatch).not.toHaveBeenCalledWith('perform-search', expect.anything())

            // After delay, search is dispatched
            jest.advanceTimersByTime(300)
            expect(dispatch).toHaveBeenCalledWith('perform-search', { query: 'test' })
        })
    })

    describe('Effect Execution Order Guarantees', () => {
        it('should guarantee :db → parallel → :fx order', async () => {
            jest.useFakeTimers()
            try {
                const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
                const executionLog: string[] = []

                registrar.register('effect', 'parallel1', async () => {
                    await new Promise(resolve => setTimeout(resolve, 10))
                    executionLog.push('parallel1')
                })

                registrar.register('effect', 'parallel2', async () => {
                    await new Promise(resolve => setTimeout(resolve, 5))
                    executionLog.push('parallel2')
                })

                registrar.register('effect', 'log', (message: string) => {
                    executionLog.push(message)
                })

                // Override db to track execution
                const originalDbHandler = registrar.get('effect', 'db')
                registrar.register('effect', 'db', (newState: any) => {
                    executionLog.push('db')
                    if (originalDbHandler) {
                        originalDbHandler(newState, deps)
                    }
                })

                const effectMap: EffectMap = {
                    db: { count: 1 },
                    parallel1: {},
                    parallel2: {},
                    fx: [['log', 'fx']]
                }

                // Start execution and run timers asynchronously
                const executePromise = executor.execute(effectMap, 'test', {})
                await jest.runAllTimersAsync()
                await executePromise

                expect(executionLog[0]).toBe('db')
                expect(executionLog[executionLog.length - 1]).toBe('fx')
                expect(executionLog).toContain('parallel1')
                expect(executionLog).toContain('parallel2')
                consoleWarnSpy.mockRestore()
            } finally {
                jest.clearAllTimers()
                jest.useRealTimers()
            }
        })

        it('should allow :db state to be visible to parallel effects', async () => {
            let capturedState: any = null

            registrar.register('effect', 'read-state', (config: any, deps: any) => {
                capturedState = deps.stateManager.getState()
            })

            const effectMap: EffectMap = {
                db: { count: 42, name: 'test' },
                'read-state': {}
            }

            await executor.execute(effectMap, 'test', {})

            // Parallel effect should see the updated state from :db
            expect(capturedState).toEqual({ count: 42, name: 'test' })
        })
    })

    describe('Effect Tracing', () => {
        it('should track all effect executions', async () => {
            const effectsExecuted: any[] = []

            const effectMap: EffectMap = {
                db: { count: 1 },
                dispatch: { event: 'save' }
            }

            await executor.execute(effectMap, 'test-event', {}, effectsExecuted)

            expect(effectsExecuted).toHaveLength(2)
            expect(effectsExecuted[0]).toMatchObject({
                effectType: 'db',
                config: { count: 1 }
            })
            expect(effectsExecuted[1]).toMatchObject({
                effectType: 'dispatch',
                config: { event: 'save' }
            })
        })

        it('should track effect execution times', async () => {
            jest.useFakeTimers()
            try {
                registrar.register('effect', 'slow-effect', async () => {
                    await new Promise(resolve => setTimeout(resolve, 20))
                })

                const effectsExecuted: any[] = []
                const effectMap: EffectMap = {
                    'slow-effect': {}
                }

                // Start execution and run timers asynchronously
                const executePromise = executor.execute(effectMap, 'test', {}, effectsExecuted)
                await jest.runAllTimersAsync()
                await executePromise

                expect(effectsExecuted[0].duration).toBeGreaterThanOrEqual(0)
            } finally {
                jest.clearAllTimers()
                jest.useRealTimers()
            }
        })

        it('should track effect errors in traces', async () => {
            registrar.register('effect', 'failing', () => {
                throw new Error('Effect failed')
            })

            const effectsExecuted: any[] = []
            const effectMap: EffectMap = {
                failing: {}
            }

            await executor.execute(effectMap, 'test', {}, effectsExecuted)

            expect(effectsExecuted[0]).toMatchObject({
                effectType: 'failing',
                error: expect.any(Error)
            })
        })
    })
})

