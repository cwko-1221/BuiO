'use strict';
// Keep two numbers per point instead of retaining an object per point in every
// student's server checkpoint. Wire checkpoints and durable rows use this form.
function packStrokes(strokes) {
  return strokes.map(stroke => {
    if (stroke.pointData) return stroke;
    const { points, ...rest } = stroke, pointData = [];
    for (const point of points) pointData.push(point.x, point.y);
    return { ...rest, pointData };
  });
}
const pointCount = strokes => strokes.reduce((n,stroke) => n + (stroke.pointData ? stroke.pointData.length / 2 : stroke.points.length), 0);
module.exports = { packStrokes, pointCount };
