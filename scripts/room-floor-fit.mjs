import sharp from 'sharp';

/**
 * Find a room's floor by its edges rather than its colour: the wall meets the floor along three
 * long straight lines, and a straight line can be searched for even where the wall and the floor
 * are both wood. Each side edge is a segment from the picture's side up to the back corner, and
 * the one that runs along the most gradient wins.
 */
export async function findFloor(file) {
  const W = 418;
  const meta = await sharp(file).metadata();
  const H = Math.round(W * meta.height / meta.width);
  const { data } = await sharp(file).resize(W, H, { fit: 'fill' }).blur(1.2).removeAlpha()
    .raw().toBuffer({ resolveWithObject: true });

  const grad = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let c = 0; c < 3; c++) sum += Math.abs(data[((y + 1) * W + x) * 3 + c] - data[((y - 1) * W + x) * 3 + c]);
    grad[y * W + x] = sum;
  }
  const gradAt = (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    return xi < 0 || yi < 1 || xi >= W || yi >= H - 1 ? 0 : grad[yi * W + xi];
  };

  let backY = 0, backScore = -1;
  for (let y = Math.round(H * .18); y < H * .6; y++) {
    let score = 0;
    for (let x = Math.round(W * .35); x < W * .65; x++) score += grad[y * W + x];
    if (score > backScore) { backScore = score; backY = y; }
  }

  /** The segment from the picture's side up to the back corner, scored by the gradient under it. */
  const sideEdge = (side) => {
    let best = null;
    for (let corner = Math.round(W * .08); corner <= W * .3; corner++) {
      for (let atEdge = backY + H * .12; atEdge < H * 1.8; atEdge += 1) {
        const steps = Math.round(corner);
        let score = 0, seen = 0;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = side < 0 ? t * corner : W - 1 - t * corner;
          const y = atEdge + (backY - atEdge) * t;
          if (y >= H || y < backY) continue;
          score += gradAt(x, y); seen++;
        }
        if (seen < steps * .4) continue;                  // too little of it is in the picture
        if (!best || score > best.score) best = { score, corner, atEdge };
      }
    }
    const cornerX = side < 0 ? best.corner / W : (W - 1 - best.corner) / W;
    const edgeX = side < 0 ? 0 : 1;
    return (y) => cornerX + (edgeX - cornerX) * (y - backY / H) / (best.atEdge / H - backY / H);
  };

  const left = sideEdge(-1), right = sideEdge(1), back = backY / H;
  return { quad: [[left(back), back], [right(back), back], [right(1), 1], [left(1), 1]] };
}
