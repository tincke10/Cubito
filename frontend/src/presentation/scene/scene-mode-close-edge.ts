/** True exactly on the sceneModeOpen open->closed transition (Change W13): the worktree 3D
 *  scene goes from `hidden` back to visible, so its renderer needs a fresh measurement — a
 *  window resize that happened while `#app` was `hidden` (0×0 clientWidth/Height) otherwise
 *  sticks until the next unrelated resize. */
export const didSceneModeClose = (previousOpen: boolean, nextOpen: boolean): boolean =>
  previousOpen && !nextOpen
