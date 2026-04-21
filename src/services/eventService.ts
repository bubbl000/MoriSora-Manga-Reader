import { listen } from '@tauri-apps/api/event'

export type EventName =
  | 'scan_progress'
  | 'library_updated'
  | 'path_added'
  | 'path_removed'
  | 'reading_progress_saved'
  | 'favorite_toggled'
  | 'tag_added'
  | 'tag_removed'
  | 'error'

type EventCallback<T = unknown> = (payload: T) => void

const listeners = new Map<string, Set<EventCallback>>()

export const onEvent = async <T = unknown>(eventName: EventName, callback: EventCallback<T>) => {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set())
  }
  listeners.get(eventName)!.add(callback as EventCallback)

  const unlisten = await listen<T>(eventName, (event) => {
    callback(event.payload)
  })

  return unlisten
}

export const offEvent = <T = unknown>(eventName: EventName, callback: EventCallback<T>) => {
  const cbs = listeners.get(eventName)
  if (cbs) {
    cbs.delete(callback as EventCallback)
    if (cbs.size === 0) {
      listeners.delete(eventName)
    }
  }
}

export const clearAllListeners = () => {
  listeners.clear()
}
