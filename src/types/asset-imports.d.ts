// electron-vite's build resolved these ?asset-suffixed imports to a packaged file path at
// build time; its `electron-vite/node` types package supplied this ambient declaration too.
// Kept standalone here now that electron-vite itself is gone from the fork.
declare module '*?asset' {
  const src: string
  export default src
}

declare module '*?asset&asarUnpack' {
  const src: string
  export default src
}
