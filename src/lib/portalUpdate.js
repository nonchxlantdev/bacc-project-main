/** The service worker asks the page to refresh. One listener is enough. */
let listener = null;

export function onPortalUpdate(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function notifyPortalUpdate() {
  listener?.();
}
