/**
 * Tiny event bus for global UI commands.
 * Allows e.g. a "Try it" button on the home page
 * to open the FloatingChat at the bottom-right.
 */

const events = new EventTarget();

export type AppEvent = "open-floating-chat" | "close-floating-chat";

export function emit(name: AppEvent) {
  events.dispatchEvent(new Event(name));
}

export function on(name: AppEvent, handler: () => void) {
  events.addEventListener(name, handler);
  return () => events.removeEventListener(name, handler);
}
