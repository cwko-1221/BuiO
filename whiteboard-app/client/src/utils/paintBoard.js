// Coordinates and pen widths match the existing student's editable vector format.
export function paintStrokes(ctx, strokes, width, height) {
    for (const stroke of strokes || []) {
        const count = stroke.pointData ? stroke.pointData.length / 2 : stroke.points?.length;
        if (!count) continue;
        const x = i => stroke.pointData ? stroke.pointData[i * 2] : stroke.points[i].x;
        const y = i => stroke.pointData ? stroke.pointData[i * 2 + 1] : stroke.points[i].y;
        ctx.save();
        ctx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over';
        ctx.strokeStyle = stroke.color || '#111827';
        ctx.lineWidth = stroke.size || 1.5;
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < count; i++) ctx[i ? 'lineTo' : 'moveTo'](x(i) * width, y(i) * height);
        if (count === 1) ctx.lineTo(x(0) * width, y(0) * height);
        ctx.stroke();
        ctx.restore();
    }
}

export function decodeStrokes(strokes) {
    return strokes.map(({ pointData, ...stroke }) => ({ ...stroke,
        points: pointData ? Array.from({ length: pointData.length / 2 }, (_, i) => ({ x: pointData[i * 2], y: pointData[i * 2 + 1] }))
            : (stroke.points || []).map(point => ({ ...point })),
    }));
}
