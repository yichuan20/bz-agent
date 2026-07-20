import { getColorFromString } from './common';
import {
  LINE_HEIGHT,
  PAGE_CONTENT_HEIGHT,
  PAGE_GAP,
  PAGE_HEIGHT,
  PAGE_MARGIN_BOTTOM,
  PAGE_MARGIN_TOP,
  SF,
  VIEW_H,
  VIEW_W,
} from './word-constants';

/**
 * Calculate which page a content Y position falls on (0-indexed)
 */
export const getPageFromContentY = contentY => {
  if (contentY < 0) return 0;
  return Math.floor(contentY / PAGE_CONTENT_HEIGHT);
};

/**
 * Convert content Y (continuous) to canvas Y (with page gaps)
 * contentY: the logical Y position in continuous content space
 * returns: the actual Y position on canvas accounting for page breaks and gaps
 */
export const contentYToCanvasY = (contentY, topMargin = 0) => {
  const pageNum = getPageFromContentY(contentY);
  const yWithinPage = contentY - pageNum * PAGE_CONTENT_HEIGHT;
  // Each page adds: PAGE_HEIGHT + PAGE_GAP, but first page starts at topMargin
  const pageStartY = topMargin + pageNum * (PAGE_HEIGHT + PAGE_GAP);
  return pageStartY + PAGE_MARGIN_TOP + yWithinPage;
};

/**
 * Convert canvas Y (with page gaps) back to content Y (continuous)
 */
export const canvasYToContentY = (canvasY, topMargin = 0) => {
  // Subtract topMargin
  const adjustedY = canvasY - topMargin;
  if (adjustedY < 0) return 0;

  // Calculate which page we're on
  const pageWithGap = PAGE_HEIGHT + PAGE_GAP;
  const pageNum = Math.floor(adjustedY / pageWithGap);
  const yWithinPageArea = adjustedY - pageNum * pageWithGap;

  // Check if we're in the gap between pages
  if (yWithinPageArea > PAGE_HEIGHT) {
    // In the gap, return end of current page
    return (pageNum + 1) * PAGE_CONTENT_HEIGHT;
  }

  // Subtract page margins to get content Y within page
  const yWithinContent = yWithinPageArea - PAGE_MARGIN_TOP;
  if (yWithinContent < 0) return pageNum * PAGE_CONTENT_HEIGHT;
  if (yWithinContent > PAGE_CONTENT_HEIGHT) return (pageNum + 1) * PAGE_CONTENT_HEIGHT;

  return pageNum * PAGE_CONTENT_HEIGHT + yWithinContent;
};

/**
 * Get the total canvas height needed for a given number of pages
 */
export const getTotalCanvasHeight = (numPages, topMargin = 0) => {
  if (numPages <= 0) return topMargin + PAGE_HEIGHT;
  return topMargin + numPages * PAGE_HEIGHT + (numPages - 1) * PAGE_GAP;
};

/**
 * Convert canvas Y (with page gaps) back to content Y (continuous space)
 * This is used for click handling - converts click position to content coordinates
 * @param {number} drawY - Y position on canvas (with page gaps)
 * @param {number} topMargin - Top margin before first page
 * @returns {number} - Y position in continuous content space (matching ys array values)
 */
export const drawYToContentY = (drawY, topMargin) => {
  const pageWithGap = PAGE_HEIGHT + PAGE_GAP;
  const relativeDrawY = drawY - topMargin;

  // Before first page content area
  if (relativeDrawY < PAGE_MARGIN_TOP) {
    return drawY;
  }

  // Find which page the draw Y is on
  const pageNum = Math.floor(relativeDrawY / pageWithGap);
  const yWithinPageArea = relativeDrawY - pageNum * pageWithGap;

  // Check if in gap between pages
  if (yWithinPageArea >= PAGE_HEIGHT) {
    // In gap - snap to end of current page content
    return topMargin + PAGE_MARGIN_TOP + (pageNum + 1) * PAGE_CONTENT_HEIGHT;
  }

  // Within a page - clamp to [0, PAGE_CONTENT_HEIGHT) so top/bottom margins
  // never map to a different page's content coordinates
  const yWithinPageContent = Math.min(
    PAGE_CONTENT_HEIGHT - 1,
    Math.max(0, yWithinPageArea - PAGE_MARGIN_TOP),
  );
  return topMargin + PAGE_MARGIN_TOP + pageNum * PAGE_CONTENT_HEIGHT + yWithinPageContent;
};

/**
 * Convert content Y (continuous space) to canvas Y (with page gaps)
 * This is used when drawing to account for visual page separations
 * @param {number} contentY - Y position in continuous content space
 * @param {number} topMargin - Top margin before first page
 * @returns {number} - Y position on canvas with page gaps included
 */
export const contentYToDrawY = (contentY, topMargin) => {
  const firstPageContentStart = topMargin + PAGE_MARGIN_TOP;
  const relativeY = contentY - firstPageContentStart;

  if (relativeY < 0) return contentY;

  const pageNum = Math.floor(relativeY / PAGE_CONTENT_HEIGHT);
  const yWithinPage = relativeY % PAGE_CONTENT_HEIGHT;

  // Page start includes all previous pages plus their gaps
  const pageStartY = topMargin + pageNum * (PAGE_HEIGHT + PAGE_GAP);
  return pageStartY + PAGE_MARGIN_TOP + yWithinPage;
};

/**
 * Draws the caret (text cursor) at the specified position
 */
export const drawCaret = ({ x, y, ctx }) => {
  ctx.lineWidth = 4;
  ctx.beginPath();
  const bottomY = y - LINE_HEIGHT + 24;
  const topY = y + 8;
  ctx.moveTo(x, bottomY);
  ctx.lineTo(x, topY);
  ctx.stroke();
};

/**
 * Draws a selection box highlight for a character
 */
export const drawSelectionBox = ({ x, y, ctx, char }) => {
  const prevFillStyle = ctx.fillStyle;
  ctx.fillStyle = '#0b57d033';
  ctx.fillRect(x, y - LINE_HEIGHT + 18, ctx.measureText(char).width, LINE_HEIGHT);
  ctx.fillStyle = prevFillStyle;
};

/**
 * Draws a colored box for debug characters
 */
export const drawCharBox = ({ x, y, ctx, char, fill = 'salmon' }) => {
  const prevFillStyle = ctx.fillStyle;
  ctx.fillStyle = fill;
  ctx.fillRect(x, y - LINE_HEIGHT + 18, ctx.measureText(char).width, LINE_HEIGHT);
  ctx.fillStyle = prevFillStyle;
};

/**
 * Draws a query highlight box for AI-generated content
 */
export const drawQueryBox = ({ x, y, ctx, char, queryId }) => {
  const prevFillStyle = ctx.fillStyle;
  ctx.fillStyle = `${getColorFromString(queryId)}`;
  ctx.fillRect(0, y - LINE_HEIGHT + 18, 6, LINE_HEIGHT);
  ctx.fillStyle = prevFillStyle;
};

/**
 * Draws a background color box for styled text
 */
export const drawBgBox = ({ x, y, ctx, char, bgColor }) => {
  const prevFillStyle = ctx.fillStyle;
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y - LINE_HEIGHT + 18, ctx.measureText(char).width, LINE_HEIGHT);
  ctx.fillStyle = prevFillStyle;
};

/**
 * Sets up the page layout - clears canvas, draws multiple pages with gaps
 * @param {Object} params
 * @param {CanvasRenderingContext2D} params.ctx - Canvas context
 * @param {number} params.topMargin - Top margin before first page
 * @param {number} params.scrollY - Current scroll position
 * @param {number} params.numPages - Number of pages to draw (default 3)
 * @param {string} params.headerText - Optional header text to display on each page
 * @param {string} params.footerText - Optional footer text to display on each page
 * @param {string} params.gapColor - Background/gap color (for dark mode support)
 */
export const drawPageSetup = ({
  ctx,
  topMargin,
  scrollY,
  numPages = 3,
  headerText = '',
  footerText = '',
  gapColor = '#e8e8e8',
}) => {
  const prevFillStyle = ctx.fillStyle;
  const prevStrokeStyle = ctx.strokeStyle;
  const prevShadowColor = ctx.shadowColor;
  const prevShadowBlur = ctx.shadowBlur;
  const prevShadowOffsetX = ctx.shadowOffsetX;
  const prevShadowOffsetY = ctx.shadowOffsetY;

  // Reset
  ctx.lineWidth = 1;

  // Clear entire canvas with background (page gap color)
  ctx.fillStyle = gapColor;
  ctx.fillRect(0, 0, VIEW_W * SF, VIEW_H * SF);

  // Draw each page
  for (let pageNum = 0; pageNum < numPages; pageNum++) {
    const pageStartY = topMargin + pageNum * (PAGE_HEIGHT + PAGE_GAP) - scrollY;
    const pageEndY = pageStartY + PAGE_HEIGHT;

    // Skip pages that are completely off-screen
    if (pageEndY < 0) continue;
    if (pageStartY > VIEW_H * SF) break;

    // Draw bottom shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 10 * SF;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4 * SF;

    // Draw white page background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, pageStartY, VIEW_W * SF, PAGE_HEIGHT);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw top shadow in the gap area above the page
    const topShadowHeight = 6 * SF;
    const topGradient = ctx.createLinearGradient(0, pageStartY - topShadowHeight, 0, pageStartY);
    topGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    topGradient.addColorStop(1, 'rgba(0, 0, 0, 0.04)');
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, pageStartY - topShadowHeight, VIEW_W * SF, topShadowHeight);

    // Draw page border
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, pageStartY, VIEW_W * SF, PAGE_HEIGHT);

    // Draw page number at bottom center
    const pageNumberText = `${pageNum + 1}`;
    ctx.font = `${12 * SF}px Arial`;
    ctx.fillStyle = '#666666';
    const textWidth = ctx.measureText(pageNumberText).width;
    const pageNumberX = (VIEW_W * SF - textWidth) / 2;
    const pageNumberY = pageStartY + PAGE_HEIGHT - PAGE_MARGIN_BOTTOM / 2;
    ctx.fillText(pageNumberText, pageNumberX, pageNumberY);

    // Draw header text (centered at top of page margin)
    if (headerText) {
      ctx.font = `${11 * SF}px Arial`;
      ctx.fillStyle = '#888888';
      const headerWidth = ctx.measureText(headerText).width;
      const headerX = (VIEW_W * SF - headerWidth) / 2;
      const headerY = pageStartY + PAGE_MARGIN_TOP / 2 + 4 * SF;
      ctx.fillText(headerText, headerX, headerY);
    }

    // Draw footer text (centered, above page number)
    if (footerText) {
      ctx.font = `${11 * SF}px Arial`;
      ctx.fillStyle = '#888888';
      const footerWidth = ctx.measureText(footerText).width;
      const footerX = (VIEW_W * SF - footerWidth) / 2;
      const footerY = pageStartY + PAGE_HEIGHT - PAGE_MARGIN_BOTTOM / 2 - 20 * SF;
      ctx.fillText(footerText, footerX, footerY);
    }
  }

  // Clear gap areas between pages (shadows may have bled into them)
  ctx.fillStyle = gapColor;
  for (let pageNum = 0; pageNum < numPages - 1; pageNum++) {
    const gapStartY = topMargin + pageNum * (PAGE_HEIGHT + PAGE_GAP) + PAGE_HEIGHT - scrollY;
    const gapEndY = gapStartY + PAGE_GAP;

    // Only fill if gap is visible on screen
    if (gapEndY > 0 && gapStartY < VIEW_H * SF) {
      ctx.fillRect(0, gapStartY, VIEW_W * SF, PAGE_GAP);
    }
  }

  // Clear area above first page (topMargin area)
  const firstPageTop = topMargin - scrollY;
  if (firstPageTop > 0) {
    ctx.fillStyle = gapColor;
    ctx.fillRect(0, 0, VIEW_W * SF, firstPageTop);
  }

  // Restore context state
  ctx.fillStyle = prevFillStyle;
  ctx.strokeStyle = prevStrokeStyle;
  ctx.shadowColor = prevShadowColor;
  ctx.shadowBlur = prevShadowBlur;
  ctx.shadowOffsetX = prevShadowOffsetX;
  ctx.shadowOffsetY = prevShadowOffsetY;
};

/**
 * Draws underline or strikethrough line for text
 */
export const drawLine = ({ x, y, ctx, char, mode = 'underline' }) => {
  const { width } = ctx.measureText(char);
  if (mode === 'strike') {
    ctx.fillRect(x, y - LINE_HEIGHT * 0.15, width, 3);
    return;
  }

  ctx.fillRect(x, y + 4, width, 3);
};

/**
 * Draws list prefix (bullet point, number, etc.)
 */
export const drawPrefix = ({ x, y, ctx, style }) => {
  const prevFont = ctx.font;
  ctx.font = '50px Arial';
  ctx.fillText(style?.prefix, x, y + 8);
  ctx.font = prevFont;
};
