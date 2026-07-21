import { cloneDeep } from 'lodash';
import { SF } from './word-constants';
import { safeCaret } from './word-mutation';
import { drawYToContentY } from './word-render-utils';

/**
 * Finds the nearest character index to a given x,y coordinate
 */
const getNearestCharIndex = ({ x, y, xs = [], ys = [], text: _text = '' }) => {
  if (!xs.length || !ys.length) {
    return 0;
  }

  // Original bz-office algorithm: find first char with y > click y
  let i = ys.findIndex(yCoord => yCoord > y);
  let initialY;

  if (i === -1) {
    // Clicking on or below the last line — use the last line's Y coordinate
    initialY = ys[ys.length - 1];
    i = 0;
  } else {
    initialY = ys[i];
  }

  let xDistance = Infinity;
  let minI = 0;

  for (let j = 0; j < xs.length; j++) {
    if (ys[j] === initialY) {
      const d = Math.abs(xs[j] - x);
      if (d < xDistance) {
        xDistance = d;
        minI = j;
      }
    }
  }

  // Allow cursor to be positioned after a character if clicking to its right
  if (x > xs?.[minI] + 10) {
    const isEndOfDocument = minI === xs.length - 1;
    const isEndOfLine = minI + 1 < ys.length && ys[minI + 1] !== initialY;
    if (isEndOfDocument || isEndOfLine) {
      minI++;
    }
  }

  return minI;
};

/**
 * Gets the nearest character index from a mouse event
 * @param {Event} e - Mouse event
 * @param {number} scrollY - Current scroll position
 * @param {number[]} xs - X coordinates array (content space)
 * @param {number[]} ys - Y coordinates array (content space)
 * @param {string} text - Document text
 * @param {number} topMargin - Top margin before first page (for coordinate conversion)
 */
export const getNearestCharIndexFromEvent = (
  e,
  scrollY = 0,
  xs = [],
  ys = [],
  text = '',
  topMargin = 0,
) => {
  const { offsetX, offsetY } = e?.nativeEvent ?? {};
  const x = offsetX * SF;
  const canvasY = offsetY * SF + scrollY;
  const contentY = drawYToContentY(canvasY, topMargin);
  const nearestIndex = getNearestCharIndex({
    x,
    y: contentY,
    xs,
    ys,
    text,
  });

  return safeCaret(nearestIndex, text);
};

/**
 * Expands selection backward and forward until it finds the specified character
 */
const growSelectionUntil = (doc, char = ' ') => {
  const newDoc = cloneDeep(doc);

  let start = newDoc.selStart;
  while (start > 0 && newDoc.text[start] !== char) {
    start--;
  }
  if (start !== 0) {
    start++;
  }

  let end = newDoc.selEnd;
  while (end < newDoc.text.length && newDoc.text[end] !== char) {
    end++;
  }

  return { ...newDoc, selStart: start, selEnd: end };
};

/**
 * Handles multi-click selection (double-click for word, triple-click for line)
 */
export const addMultiClickSelection = (doc, e) => {
  if (e.detail === 1) {
    return doc;
  }
  if (e.detail === 2) {
    return growSelectionUntil(doc, ' ');
  }
  if (e.detail === 3) {
    return growSelectionUntil(doc, '\n');
  }

  return doc;
};

/**
 * Gets the start and end indices of the current selection, ordered
 */
export const getStartEnd = (doc = {}) => {
  const start = Math.min(doc?.selStart, doc?.selEnd);
  const end = Math.max(doc?.selStart, doc?.selEnd);
  return [start, end];
};
