/**
 * Effects Module
 * Handles effect execution and built-in effects
 * Inspired by re-frame's fx.cljc
 */

import { 
    EffectMap, 
    EffectHandler, 
    EffectExecutionTrace 
} from './types'
import { Registrar } from './registrar'
import { StateManager } from './state'
import { ErrorHandlerManager } from './errorHandler'

/**
 * Dependencies for effect executor
 */
export interface EffectExecutorDependencies<State> {
    registrar: Registrar
    stateManager: StateManager<State>
    errorHandler: ErrorHandlerManager
    dispatch: (eventKey: string, payload: any) => Promise<void>
    deregisterEvent: (eventKey: string) => void
    registerEffect: <Config = any>(effectType: string, handler: EffectHandler<Config>) => void
}

/**
 * Effect executor interface
 */
export interface EffectExecutor<State> {
    /**
     * Execute effects from an effect map
     */
    execute(
        effectMap: EffectMap,
        eventKey: string,
        payload: any,
        effectsExecuted?: EffectExecutionTrace[]
    ): Promise<void>

    /**
     * Register built-in effects
     */
    registerBuiltInEffects(): void
}

/**
 * Create an effect executor
 */
export function createEffectExecutor<State>(
    deps: EffectExecutorDependencies<State>
): EffectExecutor<State> {
    const { registrar, stateManager, errorHandler, dispatch, deregisterEvent, registerEffect } = deps

    /**
     * Execute effects from an effect map
     */
    async function execute(
        effectMap: EffectMap,
        eventKey: string,
        payload: any,
        effectsExecuted?: EffectExecutionTrace[]
    ): Promise<void> {
        // :db effect is guaranteed to execute first (synchronously)
        if (effectMap.db !== undefined) {
            const dbHandler = registrar.get<EffectHandler>('effect', 'db')
            if (dbHandler) {
                const effectStart = Date.now()
                try {
                    await dbHandler(effectMap.db, deps as any) // Pass deps as store-like object
                    const effectEnd = Date.now()
                    if (effectsExecuted) {
                        effectsExecuted.push({
                            effectType: 'db',
                            config: effectMap.db,
                            start: effectStart,
                            end: effectEnd,
                            duration: effectEnd - effectStart
                        })
                    }
                } catch (error) {
                    const effectEnd = Date.now()
                    if (effectsExecuted) {
                        effectsExecuted.push({
                            effectType: 'db',
                            config: effectMap.db,
                            start: effectStart,
                            end: effectEnd,
                            duration: effectEnd - effectStart,
                            error: error as Error
                        })
                    }
                    await errorHandler.handle(error as Error, {
                        eventKey,
                        payload,
                        phase: 'effect',
                        interceptor: {
                            id: 'db',
                            direction: 'after'
                        }
                    })
                }
            }
        }

        // Execute all other effects in parallel (except :db and :fx)
        const effectsWithoutDb = Object.entries(effectMap).filter(
            ([key]) => key !== 'db' && key !== 'fx'
        ) as Array<[keyof EffectMap, any]>

        await Promise.all(
            effectsWithoutDb.map(async ([effectType, config]) => {
                if (config === undefined || config === null) {
                    return
                }

                const handler = registrar.get<EffectHandler>('effect', effectType as string)
                if (!handler) {
                    console.warn(`No effect handler registered for "${String(effectType)}"`)
                    return
                }

                const effectStart = Date.now()
                try {
                    await handler(config, deps as any) // Pass deps as store-like object
                    const effectEnd = Date.now()
                    if (effectsExecuted) {
                        effectsExecuted.push({
                            effectType: effectType as string,
                            config,
                            start: effectStart,
                            end: effectEnd,
                            duration: effectEnd - effectStart
                        })
                    }
                } catch (error) {
                    const effectEnd = Date.now()
                    if (effectsExecuted) {
                        effectsExecuted.push({
                            effectType: effectType as string,
                            config,
                            start: effectStart,
                            end: effectEnd,
                            duration: effectEnd - effectStart,
                            error: error as Error
                        })
                    }
                    await errorHandler.handle(error as Error, {
                        eventKey,
                        payload,
                        phase: 'effect',
                        interceptor: {
                            id: effectType as string,
                            direction: 'after'
                        }
                    })
                }
            })
        )

        // :fx meta-effect executes last, sequentially
        if (effectMap.fx !== undefined) {
            const fxHandler = registrar.get<EffectHandler>('effect', 'fx')
            if (fxHandler) {
                const effectStart = Date.now()
                try {
                    await fxHandler(effectMap.fx, deps as any) // Pass deps as store-like object
                    const effectEnd = Date.now()
                    if (effectsExecuted) {
                        effectsExecuted.push({
                            effectType: 'fx',
                            config: effectMap.fx,
                            start: effectStart,
                            end: effectEnd,
                            duration: effectEnd - effectStart
                        })
                    }
                } catch (error) {
                    const effectEnd = Date.now()
                    if (effectsExecuted) {
                        effectsExecuted.push({
                            effectType: 'fx',
                            config: effectMap.fx,
                            start: effectStart,
                            end: effectEnd,
                            duration: effectEnd - effectStart,
                            error: error as Error
                        })
                    }
                    await errorHandler.handle(error as Error, {
                        eventKey,
                        payload,
                        phase: 'effect',
                        interceptor: {
                            id: 'fx',
                            direction: 'after'
                        }
                    })
                }
            }
        }
    }

    /**
     * Register built-in effects
     */
    function registerBuiltInEffects(): void {
        // :db effect - updates state directly (executes first)
        registerEffect('db', (newState: State) => {
            stateManager.setState(newState)
        })

        // :dispatch effect - dispatches a single event
        // Note: We don't await the dispatch to avoid deadlock when dispatching from within an event
        registerEffect('dispatch', (config: NonNullable<EffectMap['dispatch']>) => {
            if (!config || typeof config.event !== 'string') {
                console.error('re-frame: ignoring bad :dispatch value. Expected {event: string, payload: any}, but got:', config)
                return
            }
            dispatch(config.event, config.payload)
        })

        // :dispatch-n effect - dispatches multiple events
        // Note: We don't await dispatches to avoid deadlock when dispatching from within an event
        registerEffect('dispatch-n', (configs: NonNullable<EffectMap['dispatch-n']>) => {
            if (!Array.isArray(configs)) {
                console.error('re-frame: ignoring bad :dispatch-n value. Expected an array, but got:', configs)
                return
            }
            // Add all to queue - they'll be processed sequentially by the router
            for (const config of configs) {
                if (config && config.event) {
                    dispatch(config.event, config.payload)
                }
            }
        })

        // :dispatch-later effect - dispatches events after delays
        registerEffect('dispatch-later', (value: NonNullable<EffectMap['dispatch-later']>) => {
            if (!Array.isArray(value)) {
                console.error('re-frame: ignoring bad :dispatch-later value. Expected an array, but got:', value)
                return
            }

            for (const effect of value.filter(e => e != null)) {
                if (!effect || typeof effect.ms !== 'number' || !effect.event) {
                    console.error('re-frame: ignoring bad :dispatch-later entry:', effect)
                    continue
                }

                setTimeout(() => {
                    dispatch(effect.event, effect.payload)
                }, effect.ms)
            }
        })

        // :fx meta-effect - executes multiple effects from tuples
        registerEffect('fx', async (seqOfEffects: NonNullable<EffectMap['fx']>) => {
            if (!Array.isArray(seqOfEffects)) {
                console.warn('re-frame: ":fx" effect expects an array, but was given', typeof seqOfEffects)
                return
            }

            // Execute effects sequentially (in order)
            for (const effectTuple of seqOfEffects) {
                if (effectTuple == null) {
                    continue // nil entries are ignored
                }

                const [effectKey, effectValue] = effectTuple

                if (effectKey === 'db') {
                    console.warn('re-frame: ":fx" effect should not contain a :db effect. Use top-level :db instead.')
                    continue
                }

                const handler = registrar.get<EffectHandler>('effect', effectKey)
                if (!handler) {
                    console.warn(`re-frame: in ":fx" effect found "${effectKey}" which has no associated handler. Ignoring.`)
                    continue
                }

                try {
                    await handler(effectValue, deps as any) // Pass deps as store-like object
                } catch (error) {
                    await errorHandler.handle(error as Error, {
                        eventKey: `fx:${effectKey}`,
                        payload: effectValue,
                        phase: 'effect',
                        interceptor: {
                            id: effectKey,
                            direction: 'after'
                        }
                    })
                }
            }
        })

        // :deregister-event-handler effect - removes event handlers
        registerEffect('deregister-event-handler', (value: NonNullable<EffectMap['deregister-event-handler']>) => {
            if (Array.isArray(value)) {
                for (const eventKey of value) {
                    if (typeof eventKey === 'string') {
                        deregisterEvent(eventKey)
                    }
                }
            } else if (typeof value === 'string') {
                deregisterEvent(value)
            }
        })
    }

    return {
        execute,
        registerBuiltInEffects
    }
}

/**
 * Merge multiple effect maps into a single effect map
 * 
 * Handles special merging rules for:
 * - `dispatch-n`: Arrays are concatenated
 * - `dispatch-later`: Arrays are concatenated
 * - `fx`: Arrays are concatenated
 * - `deregister-event-handler`: Arrays or strings are merged
 * - Other effects: Last one wins
 * 
 * @example
 * ```typescript
 * import { mergeEffects } from '@rplx/core'
 * 
 * const effects = mergeEffects(
 *   { db: newState },
 *   { dispatch: { event: 'save', payload: {} } },
 *   { 'dispatch-n': [{ event: 'log', payload: {} }] }
 * )
 * ```
 */
export function mergeEffects(...effects: EffectMap[]): EffectMap {
    const result: EffectMap = {} 

    for (const effect of effects) {
        for (const [key, value] of Object.entries(effect)) {
            if (key === 'dispatch-n' && Array.isArray(value)) {
                // Merge dispatch-n arrays
                result['dispatch-n'] = [
                    ...(result['dispatch-n'] || []),
                    ...value
                ]
            } else if (key === 'dispatch-later' && Array.isArray(value)) {
                // Merge dispatch-later arrays
                result['dispatch-later'] = [
                    ...(result['dispatch-later'] || []),
                    ...value
                ]
            } else if (key === 'fx' && Array.isArray(value)) {
                // Merge fx arrays
                result.fx = [
                    ...(result.fx || []),
                    ...value
                ]
            } else if (key === 'deregister-event-handler') {
                // Merge deregister arrays or combine strings
                if (Array.isArray(value)) {
                    const existing = result['deregister-event-handler']
                    if (Array.isArray(existing)) {
                        result['deregister-event-handler'] = [...existing, ...value]
                    } else if (typeof existing === 'string') {
                        result['deregister-event-handler'] = [existing, ...value]
                    } else {
                        result['deregister-event-handler'] = value
                    }
                } else if (typeof value === 'string') {
                    const existing = result['deregister-event-handler']
                    if (Array.isArray(existing)) {
                        result['deregister-event-handler'] = [...existing, value]
                    } else if (typeof existing === 'string') {
                        result['deregister-event-handler'] = [existing, value]
                    } else {
                        result['deregister-event-handler'] = value
                    }
                }
            } else {
                // For other effects (including :db and :dispatch), last one wins
                (result as any)[key] = value
            }
        }
    }

    return result 
}

