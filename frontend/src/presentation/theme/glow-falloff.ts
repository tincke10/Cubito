/** Pure Gaussian radial-alpha field for the glow sprite's DataTexture — approximates feGaussianBlur. */
export const radialAlphaTexels = (size: number, sigmaTexels: number): Uint8Array => {
  const texels = new Uint8Array(size * size)
  const center = (size - 1) / 2
  const denominator = 2 * sigmaTexels * sigmaTexels

  for (let y = 0; y < size; y += 1) {
    const dy = y - center
    for (let x = 0; x < size; x += 1) {
      const dx = x - center
      const distanceSquared = dx * dx + dy * dy
      texels[y * size + x] = Math.round(Math.exp(-distanceSquared / denominator) * 255)
    }
  }

  return texels
}
