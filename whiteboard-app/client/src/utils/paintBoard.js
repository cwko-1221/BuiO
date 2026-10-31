// Coordinates and pen widths match the existing student's editable vector format.
export function paintStrokes(ctx, strokes, width, height) {
    for (const stroke of strokes || []) {
        const count = stroke.pointData ? stroke.pointData.length / 2 : stroke.points?.length;
        if (!count) continue;
        const x = i => stroke.pointData ? stroke.pointData[i * 2] : stroke.points[i].x;
        const y = i => stroke.pointData ? stroke.pointData[i * 2 + 1] : stroke.points[i].y;
        ctx.save();
        const referenceWidth = stroke.surfaceWidth || 800, referenceHeight = stroke.surfaceHeight || 600;
        ctx.scale(width / referenceWidth, height / referenceHeight);
        ctx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over';
        ctx.strokeStyle = stroke.color || '#111827';
        ctx.lineWidth = stroke.size || 1.5;
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < count; i++) ctx[i ? 'lineTo' : 'moveTo'](x(i) * referenceWidth, y(i) * referenceHeight);
        if (count === 1) ctx.lineTo(x(0) * referenceWidth, y(0) * referenceHeight);
        ctx.stroke();
        ctx.restore();
    }
}

export function paintStrokeSegment(ctx, from, to, brush, width, height) {
    const referenceWidth = brush.surfaceWidth || 800, referenceHeight = brush.surfaceHeight || 600;
    ctx.save();
    ctx.scale(width / referenceWidth, height / referenceHeight);
    ctx.globalCompositeOperation = brush.isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = brush.color || '#111827';
    ctx.lineWidth = brush.size;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(from.x * referenceWidth, from.y * referenceHeight);
    ctx.lineTo(to.x * referenceWidth, to.y * referenceHeight); ctx.stroke(); ctx.restore();
}

export function decodeStrokes(strokes) {
    return strokes.map(({ pointData, ...stroke }) => ({ ...stroke,
        points: pointData ? Array.from({ length: pointData.length / 2 }, (_, i) => ({ x: pointData[i * 2], y: pointData[i * 2 + 1] }))
            : (stroke.points || []).map(point => ({ ...point })),
    }));
}
