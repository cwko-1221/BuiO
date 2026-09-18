export function drawShape(ctx, shape, startX, startY, endX, endY) {
    const width = endX - startX;
    const height = endY - startY;
    const left = Math.min(startX, endX);
    const right = Math.max(startX, endX);
    const top = Math.min(startY, endY);
    const bottom = Math.max(startY, endY);
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;

    ctx.beginPath();

    if (shape === 'triangle') {
        ctx.moveTo(centerX, top);
        ctx.lineTo(right, bottom);
        ctx.lineTo(left, bottom);
    } else if (shape === 'square' || shape === 'circle') {
        const side = Math.max(Math.abs(width), Math.abs(height));
        const squareLeft = width < 0 ? startX - side : startX;
        const squareTop = height < 0 ? startY - side : startY;

        if (shape === 'square') {
            ctx.rect(squareLeft, squareTop, side, side);
        } else {
            ctx.arc(squareLeft + side / 2, squareTop + side / 2, side / 2, 0, Math.PI * 2);
        }
    } else if (shape === 'parallelogram') {
        const skew = Math.min(Math.abs(width) * 0.25, Math.abs(height) * 0.75);
        const skewDirection = width < 0 ? -1 : 1;
        ctx.moveTo(left + skew * skewDirection, top);
        ctx.lineTo(right + skew * skewDirection, top);
        ctx.lineTo(right - skew * skewDirection, bottom);
        ctx.lineTo(left - skew * skewDirection, bottom);
    } else if (shape === 'diamond') {
        ctx.moveTo(centerX, top);
        ctx.lineTo(right, centerY);
        ctx.lineTo(centerX, bottom);
        ctx.lineTo(left, centerY);
    } else {
        ctx.rect(left, top, right - left, bottom - top);
    }

    ctx.closePath();
    ctx.stroke();
}

export function getShapeBounds(shape, startX, startY, endX, endY) {
    const width = endX - startX;
    const height = endY - startY;

    if (shape === 'square' || shape === 'circle') {
        const side = Math.max(Math.abs(width), Math.abs(height));
        const left = width < 0 ? startX - side : startX;
        const top = height < 0 ? startY - side : startY;
        return { left, top, right: left + side, bottom: top + side };
    }

    return {
        left: Math.min(startX, endX),
        top: Math.min(startY, endY),
        right: Math.max(startX, endX),
        bottom: Math.max(startY, endY),
    };
}

export function shapeContainsPoint(shape, startX, startY, endX, endY, x, y, padding = 12) {
    const bounds = getShapeBounds(shape, startX, startY, endX, endY);
    return x >= bounds.left - padding
        && x <= bounds.right + padding
        && y >= bounds.top - padding
        && y <= bounds.bottom + padding;
}

export function renderShapeLayer(ctx, canvas, shapes, width, height) {
    if (!ctx || !canvas) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    shapes.forEach((item) => {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = item.color;
        ctx.lineWidth = item.size || 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawShape(
            ctx,
            item.shape,
            item.startX * width,
            item.startY * height,
            item.endX * width,
            item.endY * height
        );
        ctx.restore();
    });
}

export function createCompositeCanvas(baseCanvas, overlayCanvas) {
    const composite = document.createElement('canvas');
    composite.width = baseCanvas.width;
    composite.height = baseCanvas.height;
    const ctx = composite.getContext('2d');
    ctx.drawImage(baseCanvas, 0, 0);
    if (overlayCanvas) ctx.drawImage(overlayCanvas, 0, 0);
    return composite;
}
