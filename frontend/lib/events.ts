/**
 * Tiny event bus for global UI commands.
 * Allows e.g. a "Try it" button on the home page
 * to open the FloatingChat at the bottom-right.
 */

const events = new EventTarget();

export type AppEvent = "open-floating-chat" | "close-floating-chat" | "open-analysis-page";

export function emit(name: AppEvent, detail?: unknown) {
  events.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on<T = unknown>(name: AppEvent, handler: (detail?: T) => void) {
  const listener = (event: Event) => {
    handler(event instanceof CustomEvent ? event.detail : undefined);
  };
  events.addEventListener(name, listener);
  return () => events.removeEventListener(name, listener);
}
