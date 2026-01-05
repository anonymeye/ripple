/**
 * Router Module
 * Handles event queue and dispatching
 * Inspired by re-frame's router.cljc
 * 
 * Manages the event queue and processes events sequentially.
 * Event handler execution is delegated to the events module.
 */

import { QueuedEvent } from './types'
import { EventManager } from './events'

/**
 * Dependencies for router
 */
export interface RouterDependencies<State, Cofx> {
    eventManager: EventManager<State, Cofx>
}

/**
 * Router interface
 */
export interface Router<State, Cofx> {
    /**
     * Dispatch an event - adds to queue
     * Returns a promise that resolves when the event is processed
     */
    dispatch<Payload = any>(eventKey: string, payload: Payload): Promise<void>

    /**
     * Flush the event queue immediately (for testing)
     */
    flush(): Promise<void>
}

/**
 * Extended queued event with promise resolution callbacks
 */
interface QueuedEventWithPromise extends QueuedEvent {
    resolve: () => void
    reject: (error: Error) => void
}

/**
 * Create a router instance
 */
export function createRouter<State, Cofx>(
    deps: RouterDependencies<State, Cofx>
): Router<State, Cofx> {
    const { eventManager } = deps

    // Event queue with promise callbacks
    const eventQueue: QueuedEventWithPromise[] = []
    let isProcessing = false
    let processingPromise: Promise<void> | null = null

    /**
     * Process a single event
     * Delegates to event manager for handler execution
     */
    async function processEvent<Payload = any>(
        eventKey: string,
        payload: Payload
    ): Promise<void> {
        await eventManager.handleEvent(eventKey, payload)
    }

    /**
     * Process events from queue sequentially
     */
    async function processQueue(): Promise<void> {
        // If already processing, the current loop will handle new events
        if (isProcessing) return

        isProcessing = true
        
        const promise = (async () => {
            try {
                // Keep processing while there are events in the queue
                // This handles events added during effect execution
                while (eventQueue.length > 0) {
                    const event = eventQueue.shift()!
                    try {
                        await processEvent(event.eventKey, event.payload)
                        event.resolve()
                    } catch (error) {
                        event.reject(error instanceof Error ? error : new Error(String(error)))
                    }
                }
            } finally {
                isProcessing = false
                processingPromise = null
            }
        })()
        
        processingPromise = promise
        await promise
    }

    /**
     * Dispatch an event - adds to queue
     * Returns a promise that resolves when the event is processed
     */
    function dispatch<Payload = any>(
        eventKey: string,
        payload: Payload
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            // Add event to queue with promise callbacks
            eventQueue.push({ 
                eventKey, 
                payload,
                resolve,
                reject
            })

            // Start processing if not already processing
            if (!isProcessing) {
                processQueue().catch((error) => {
                    // This should not happen as errors are handled per-event,
                    // but log just in case
                    console.error('Unexpected error in processQueue:', error)
                })
            }
        })
    }

    /**
     * Flush the event queue immediately (for testing)
     * Waits for current processing to complete and processes any remaining events
     */
    async function flush(): Promise<void> {
        // Wait for current processing to complete
        if (processingPromise) {
            await processingPromise
        }
        
        // Process any remaining events in the queue
        if (eventQueue.length > 0) {
            await processQueue()
        }
    }

    return {
        dispatch,
        flush
    }
}

