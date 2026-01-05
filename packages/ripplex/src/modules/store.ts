/**
 * Store Factory Module
 * Creates a store instance by composing all modules together
 * 
 * This is the primary API for creating stores (replaces the Store class)
 */

import { StoreConfig, EventHandlerDb, EventHandlerFx, EffectHandler, ErrorHandler, ErrorHandlerConfig, TraceCallback, CoeffectProviders } from './types'
import { Interceptor } from './interceptor'
import { SubscriptionConfig } from './subscription'
import { createRegistrar } from './registrar'
import { createStateManager } from './state'
import { createTracer } from './tracing'
import { createErrorHandler } from './errorHandler'
import { createEffectExecutor } from './effects'
import { createEventManager } from './events'
import { createRouter } from './router'
import { createSubscriptionManager, SubscriptionManager } from './subscriptions'

/**
 * Store API interface - all public methods available on a store instance
 */
export interface StoreAPI<State, Cofx = {}> {
    // Event registration
    registerEventDb<Payload = any>(
        eventKey: string,
        handler: EventHandlerDb<State, Cofx, Payload>,
        interceptors?: Interceptor<State, Cofx>[]
    ): void

    registerEvent<Payload = any>(
        eventKey: string,
        handler: EventHandlerFx<State, Cofx, Payload>,
        interceptors?: Interceptor<State, Cofx>[]
    ): void

    deregisterEvent(eventKey: string): void

    // Effect registration
    registerEffect<Config = any>(
        effectType: string,
        handler: EffectHandler<Config>
    ): void

    // Event dispatching
    dispatch<Payload = any>(
        eventKey: string,
        payload: Payload
    ): Promise<void>

    flush(): Promise<void>

    // State access
    getState(): Readonly<State>

    // Interceptor inspection
    getInterceptors(eventKey: string): Interceptor<State, Cofx>[] | undefined

    // Error handling
    registerErrorHandler(handler: ErrorHandler, config?: ErrorHandlerConfig): void

    // Subscriptions
    registerSubscription<Result, Params extends any[] = [], Deps extends any[] = any[]>(
        key: string,
        config: SubscriptionConfig<State, Result, Params, Deps>
    ): void

    subscribe<Result, Params extends any[]>(
        key: string,
        params: Params,
        callback: (result: Result) => void
    ): () => void

    query<Result, Params extends any[]>(
        key: string,
        params: Params
    ): Result

    getSubscription<Result, Params extends any[]>(
        key: string,
        params: Params
    ): any

    // Tracing
    registerTraceCallback(key: string, callback: TraceCallback<State>): void

    removeTraceCallback(key: string): void
}

/**
 * Create a new store instance by composing all modules
 * 
 * This is the recommended way to create a store (replaces `new Store()`)
 * 
 * @param config - Store configuration
 * @returns Store API instance
 */
export function createStore<State, Cofx = {}>(
    config: StoreConfig<State, Cofx>
): StoreAPI<State, Cofx> {
    // Create registrar first (used by all other modules)
    const registrar = createRegistrar()
    
    // Extract coeffect providers
    const coeffectProviders = (config.coeffects || {}) as CoeffectProviders<Cofx>

    // Create error handler manager
    const errorHandlerManager = createErrorHandler(
        config.errorHandler?.handler,
        config.errorHandler?.rethrow !== undefined
            ? { rethrow: config.errorHandler.rethrow }
            : undefined
    )

    // Create state manager with subscription notification callback
    // We'll set up the subscription manager reference after it's created
    let subscriptionManagerRef: SubscriptionManager<State> | null = null

    const stateManager = createStateManager(
        config.initialState,
        config.onStateChange,
        (state) => {
            // Notify subscriptions when state changes
            if (subscriptionManagerRef) {
                subscriptionManagerRef.notifyListeners(state)
            }
        },
        config.__scheduler ?? requestAnimationFrame // Use scheduler if provided, otherwise default to RAF
    )

    // Create subscription manager (needs state manager and error handler)
    const subscriptionManager = createSubscriptionManager({
        stateManager,
        errorHandler: errorHandlerManager
    })
    subscriptionManagerRef = subscriptionManager

    // Create tracer
    const tracer = createTracer<State>(config.tracing)

    // Create a dispatch function that will reference the router
    // We'll set this up after the router is created
    let dispatchFn: (eventKey: string, payload: any) => Promise<void> = () => {
        throw new Error('Router not initialized yet. This should not happen during store creation.')
    }

    // Create wrapper functions for deregisterEvent and registerEffect
    // These will be set up after the event manager is created
    let deregisterEventFn: (eventKey: string) => void = () => {
        throw new Error('Event manager not initialized yet.')
    }
    let registerEffectFn: <Config = any>(effectType: string, handler: EffectHandler<Config>) => void = () => {
        throw new Error('Event manager not initialized yet.')
    }

    // Create effect executor with dispatch function that uses the closure
    const effectExecutor = createEffectExecutor({
        registrar,
        stateManager,
        errorHandler: errorHandlerManager,
        dispatch: (eventKey: string, payload: any) => {
            return dispatchFn(eventKey, payload)
        },
        deregisterEvent: (eventKey: string) => {
            deregisterEventFn(eventKey)
        },
        registerEffect: <Config = any>(effectType: string, handler: EffectHandler<Config>) => {
            registerEffectFn(effectType, handler)
        }
    })

    // Create event manager (needs effect executor)
    const eventManager = createEventManager({
        registrar,
        stateManager,
        effectExecutor,
        errorHandler: errorHandlerManager,
        tracer,
        coeffectProviders
    })

    // Set up the wrapper functions now that event manager exists
    deregisterEventFn = (eventKey: string) => {
        eventManager.deregisterEvent(eventKey)
    }
    registerEffectFn = <Config = any>(effectType: string, handler: EffectHandler<Config>) => {
        registrar.register('effect', effectType, handler)
    }

    // Create router (needs event manager)
    const router = createRouter({
        eventManager
    })

    // Set the dispatch function to use the router
    dispatchFn = (eventKey: string, payload: any) => {
        return router.dispatch(eventKey, payload)
    }

    // Register built-in effects
    effectExecutor.registerBuiltInEffects()

    // Return composed API
    return {
        // Event registration
        registerEventDb: <Payload = any>(
            eventKey: string,
            handler: EventHandlerDb<State, Cofx, Payload>,
            interceptors?: Interceptor<State, Cofx>[]
        ) => {
            eventManager.registerEventDb(eventKey, handler, interceptors)
        },

        registerEvent: <Payload = any>(
            eventKey: string,
            handler: EventHandlerFx<State, Cofx, Payload>,
            interceptors?: Interceptor<State, Cofx>[]
        ) => {
            eventManager.registerEvent(eventKey, handler, interceptors)
        },

        deregisterEvent: (eventKey: string) => {
            eventManager.deregisterEvent(eventKey)
        },

        // Effect registration
        registerEffect: <Config = any>(
            effectType: string,
            handler: EffectHandler<Config>
        ) => {
            if (registrar.has('effect', effectType)) {
                console.warn(`Effect handler for "${effectType}" is being overwritten`)
            }
            registrar.register('effect', effectType, handler)
        },

        // Event dispatching
        dispatch: <Payload = any>(
            eventKey: string,
            payload: Payload
        ) => {
            return router.dispatch(eventKey, payload)
        },

        flush: async () => {
            await router.flush()
        },

        // State access
        getState: () => {
            return stateManager.getState()
        },

        // Interceptor inspection
        getInterceptors: (eventKey: string) => {
            return registrar.get<Interceptor<State, Cofx>[]>('event', eventKey)
        },

        // Error handling
        registerErrorHandler: (handler: ErrorHandler, config?: ErrorHandlerConfig) => {
            errorHandlerManager.register(handler, config)
        },

        // Subscriptions
        registerSubscription: <Result, Params extends any[] = [], Deps extends any[] = any[]>(
            key: string,
            config: SubscriptionConfig<State, Result, Params, Deps>
        ) => {
            subscriptionManager.registerSubscription(key, config)
        },

        subscribe: <Result, Params extends any[]>(
            key: string,
            params: Params,
            callback: (result: Result) => void
        ) => {
            return subscriptionManager.subscribe(key, params, callback)
        },

        query: <Result, Params extends any[]>(
            key: string,
            params: Params
        ) => {
            return subscriptionManager.query<Result, Params>(key, params)
        },

        getSubscription: <Result, Params extends any[]>(
            key: string,
            params: Params
        ) => {
            return subscriptionManager.getSubscription<Result, Params>(key, params)
        },

        // Tracing
        registerTraceCallback: (key: string, callback: TraceCallback<State>) => {
            tracer.registerTraceCallback(key, callback)
        },

        removeTraceCallback: (key: string) => {
            tracer.removeTraceCallback(key)
        }
    }
}

