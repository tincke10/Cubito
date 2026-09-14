/** What decides the WebGL canvas's box: whether a scene-replacing mode hides it, and whether
 *  the compare side panel narrows it. */
export type CanvasBox = { hidden: boolean; narrowed: boolean }

/** A remeasure is needed when the canvas is visible NOW and its box differs from the last
 *  measured one — it just became visible again, or the side panel just opened/closed.
 *  Subsumes the old didSceneModeClose: `!next.hidden && previous.hidden`. */
export const needsRemeasure = (previous: CanvasBox, next: CanvasBox): boolean =>
  !next.hidden && (previous.hidden || previous.narrowed !== next.narrowed)
