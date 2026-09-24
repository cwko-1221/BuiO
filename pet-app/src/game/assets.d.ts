declare module '*.webp' {
  const assetUrl: string;
  export default assetUrl;
}

declare module '*.wasm?url' {
  const assetUrl: string;
  export default assetUrl;
}
