/// Base effect map - contains only built-in effects common to all users
/// Consumers should extend this interface via TypeScript module augmentation to add custom effects
/// Example: declare module '@rplx/core' { interface EffectMap { 'my-effect'?: {...} } }
export interface EffectMap {
    /// Update state directly via effects (executes first, before other effects)
    db?: any

    /// Dispatch a single event
    dispatch?: {
        event: string 
        payload: any 
    }

    /// Dispatch multiple events
    'dispatch-n'?: Array<{
        event: string 
        payload: any 
    }>

    /// Dispatch events after delays
    'dispatch-later'?: Array<{
        ms: number
        event: string
        payload: any
    }>

    /// Meta-effect: execute multiple effects from a collection of [effect-key, effect-value] tuples
    /// nil entries are ignored (allows conditional effects)
    fx?: Array<[string, any] | null>

    /// Deregister event handlers dynamically
    'deregister-event-handler'?: string | string[]
}

/// Context provided to every handler (coeffects)
/// Cofx allows users to define their own coeffect types
export type Context<State, Cofx = {}> = {
    db: State 
    event?: any  // Event payload, added by the store when processing events
} & Cofx

/// Event handler for registerEventDb - returns state only (auto-wrapped to {:db: state})
export type EventHandlerDb<State, Cofx = {}, Payload = any> = (
    context: Context<State, Cofx>, 
    payload: Payload
) => State

/// Event handler for registerEvent - returns effects map (may include :db effect)
export type EventHandlerFx<State, Cofx = {}, Payload = any> = (
    context: Context<State, Cofx>, 
    payload: Payload
) => EffectMap

/// Error handling types

export interface ErrorContext {
    eventKey: string
    payload: any
    phase: 'interceptor' | 'effect' | 'subscription'
    interceptor?: {
        id?: string
        direction: 'before' | 'after'
    }
}

export interface ErrorHandlerConfig {
    /** Whether to re-throw the error after handling (default: false) */
    rethrow?: boolean
}

export type ErrorHandler = (
    error: Error,
    context: ErrorContext,
    config: ErrorHandlerConfig
) => void | Promise<void>

/// Effect handler signature 
export type EffectHandler<Config = any> = (
    config: Config, 
    store: any  // Store type - will be properly typed when Store is available
) => Promise<void> | void 

/// Coeffect providers - functions that compute coeffect values
export type CoeffectProviders<Cofx> = {
    [K in keyof Cofx]: () => Cofx[K]
}

/// Trace types for debugging tools
export interface EffectExecutionTrace {
    effectType: string
    config: any
    start: number
    end: number
    duration: number
    error?: Error
}

export interface EventTrace<State = any> {
    id: number
    eventKey: string
    payload: any
    timestamp: number
    stateBefore: State
    stateAfter: State
    interceptors: Array<{
        id?: string
        order: number
    }>
    effectMap: EffectMap
    effectsExecuted: EffectExecutionTrace[]
    duration: number
    error?: Error
}

export type TraceCallback<State = any> = (traces: EventTrace<State>[]) => void

/// Store configuration
export interface StoreConfig<State, Cofx = {}> {
    initialState: State
    coeffects?: CoeffectProviders<Cofx>
    onStateChange?: (state: State) => void
    /** Error handler configuration */
    errorHandler?: {
        handler?: ErrorHandler
        rethrow?: boolean
    }
    /** Tracing configuration */
    tracing?: {
        enabled?: boolean
        debounceTime?: number
    }
    /** 
     * Optional scheduler for batching state updates
     * Defaults to requestAnimationFrame
     * @internal - For testing purposes only
     */
    __scheduler?: (callback: FrameRequestCallback) => number
}

/// Internal event queue type
export interface QueuedEvent {
    eventKey: string 
    payload: any 
}

