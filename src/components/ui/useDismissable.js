import { useEffect, useRef } from 'react';

/**
 * Close a popup when the pointer goes down outside it, or on Escape.
 *
 * Returns a ref to put on the popup's outermost element — anything inside it
 * counts as "in".
 *
 * `pointerdown` on the document rather than a full-screen backdrop element: a
 * backdrop has to sit above the page to catch the click, which means it also
 * sits above the popup's own controls unless the z-indexes are kept in step
 * forever. Listening on the document has no such ordering to get wrong, and it
 * fires before focus moves, so the trigger's own click does not immediately
 * reopen what it just closed.
 */
export function useDismissable(open, onClose) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return ref;
}
