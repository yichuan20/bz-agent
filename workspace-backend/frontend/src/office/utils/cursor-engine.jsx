/**
 * cursor-engine.js — scratch-built cursor location calculation and paint.
 *
 * Coordinate contract:
 *   xs[i], ys[i]  — absolute canvas pixel position of character i
 *                   (same space as ctx drawing calls, before subtracting scrollY)
 *   clickX, clickY — offsetX * SF,  offsetY * SF + scrollY
 *   drawY          — ys[i] - scrollY  (position on the visible canvas)
 */

const LINE_SNAP_PX = 4; // px tolerance for grouping chars on the same line
const CURSOR_WIDTH = 3; // px line width for the cursor
const CURSOR_EXTRA = 6; // px the cursor extends below the baseline

/**
 * findCursorIndex
 * Given a click position (in absolute canvas pixels), return the character
 * index where the cursor should be placed.
 *
 * Algorithm:
 *  1. Find the line whose Y is closest to clickY.
 *  2. Among all characters on that line, find the one whose X is closest to clickX.
 *  3. If the click is clearly to the right of that character and the next character
 *     is still on the same line, advance by one so the cursor lands between chars.
 */
export function findCursorIndex(clickX, clickY, xs, ys) {
  if (!xs || !ys || xs.length === 0) return 0;

  // ── Step 1: find the Y of the nearest line ──────────────────────────────
  let nearestLineY = null;
  let minYDist = Infinity;

  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    if (y == null) continue;
    const d = Math.abs(y - clickY);
    if (d < minYDist) {
      minYDist = d;
      nearestLineY = y;
    }
  }

  if (nearestLineY === null) return 0;

  // ── Step 2: among chars on that line, find nearest X ───────────────────
  let bestIndex = 0;
  let minXDist = Infinity;

  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null || Math.abs(ys[i] - nearestLineY) > LINE_SNAP_PX) continue;
    const d = Math.abs(xs[i] - clickX);
    if (d < minXDist) {
      minXDist = d;
      bestIndex = i;
    }
  }

  // ── Step 3: if click is to the right of the char, advance one ──────────
  const charX = xs[bestIndex];
  if (charX != null && clickX > charX) {
    const next = bestIndex + 1;
    if (next < ys.length && ys[next] != null && Math.abs(ys[next] - nearestLineY) <= LINE_SNAP_PX) {
      bestIndex = next;
    }
  }

  return Math.max(0, Math.min(bestIndex, xs.length - 1));
}

/**
 * paintCursor
 * Draw the cursor caret at a specific character position.
 * Call this AFTER the document has been drawn so the cursor is on top.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[]} xs        — absolute canvas x positions
 * @param {number[]} ys        — absolute canvas y positions
 * @param {number}   selStart  — character index where cursor sits
 * @param {number}   scrollY   — current scroll offset in canvas pixels
 * @param {number}   lineHeight — line height in canvas pixels
 */
export function paintCursor(ctx, xs, ys, selStart, scrollY, lineHeight) {
  if (!ctx || !xs || !ys) return;

  const absX = xs[selStart];
  const absY = ys[selStart];
  if (absX == null || absY == null) return;

  const drawX = absX;
  const drawY = absY - scrollY; // convert absolute → visible canvas

  const prevStroke = ctx.strokeStyle;
  const prevWidth = ctx.lineWidth;
  const prevCap = ctx.lineCap;

  ctx.strokeStyle = '#111111';
  ctx.lineWidth = CURSOR_WIDTH;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(drawX, drawY - lineHeight + CURSOR_EXTRA);
  ctx.lineTo(drawX, drawY + CURSOR_EXTRA);
  ctx.stroke();

  ctx.strokeStyle = prevStroke;
  ctx.lineWidth = prevWidth;
  ctx.lineCap = prevCap;
}
