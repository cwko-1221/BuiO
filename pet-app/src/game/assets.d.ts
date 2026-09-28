declare module '*.webp' {
  const assetUrl: string;
  export default assetUrl;
}

declare module '*.glb?url' {
  const url: string;
  export default url;
}

declare module '*.wasm?url' {
  const assetUrl: string;
  export default assetUrl;
}
