import { cloneDeep, isEmpty, isNil } from 'lodash';
import { C_START, R_START, T_END, TABLE_CHARS } from './word-constants';
import {
  countTableRows,
  findTableEnd,
  findTableStart,
  getRowBoundaries,
  isAtRowFirstCellStart,
} from './word-table-utils';
import {
  getPrevNewlineIndexFromPosition,
  isIndentedParagraph,
  isNumberedStyle,
} from './word-text-analysis';

/**
 * Scans and renumbers a numbered list block with the same indentation level
 * Starting from the given line index, finds the start of the list block
 * and renumbers all consecutive numbered items at the same indent level
 */
export const scanAndRenumber = (doc, startLineIndex) => {
  const { text, styles } = doc;

  if (!isNumberedStyle(styles[startLineIndex])) {
    return;
  }

  const targetIndent = styles[startLineIndex]?.indent || 0;

  // Step 1: Find the start of this numbered list block (look backwards)
  let blockStart = startLineIndex;
  while (blockStart > 0) {
    const prevLineIndex = getPrevNewlineIndexFromPosition(text, blockStart);

    if (prevLineIndex === blockStart || prevLineIndex < 0) {
      break;
    }

    const prevStyle = styles[prevLineIndex];

    if (isNumberedStyle(prevStyle) && (prevStyle.indent || 0) === targetIndent) {
      blockStart = prevLineIndex;
    } else {
      break;
    }
  }

  // Step 2: Scan forward and renumber items at the same indent level
  let counter = 1;
  let currentI = blockStart;

  while (currentI < text.length) {
    const style = styles[currentI];
    const currentIndent = style?.indent || 0;

    if (text[currentI] === '\n' || currentI === 0) {
      if (currentIndent < targetIndent) {
        break;
      }

      if (currentIndent === targetIndent) {
        if (isNumberedStyle(style)) {
          doc.styles[currentI] = {
            ...style,
            prefix: `${counter}.`,
          };
          counter++;
        } else if (style?.prefix) {
          break;
        }
      }
    }

    // Move to next newline
    currentI++;
    while (currentI < text.length && text[currentI] !== '\n') {
      currentI++;
    }
  }
};

/**
 * Checks if a character should be skipped during caret navigation
 */
export const shouldSkipChar = (i, text) => {
  const prevChar = text?.[i - 1];
  const char = text?.[i];

  if (char === R_START && prevChar === C_START) {
    return false;
  }

  if (char === C_START && prevChar === C_START) {
    return false;
  }

  if (char === T_END) {
    return false;
  }

  return TABLE_CHARS?.includes(prevChar) && TABLE_CHARS?.includes(char);
};

/**
 * Returns a safe caret position, skipping table control characters
 */
export const safeCaret = (i, text = '', direction = 'forward') => {
  if (!shouldSkipChar(i, text)) {
    return i;
  }

  while (shouldSkipChar(i, text) && i < text.length - 1 && i >= 0) {
    i += direction === 'forward' ? 1 : -1;
  }

  return i;
};

/**
 * Moves caret to a different line (up or down)
 */
const moveCaretToLine = ({ i, xs = [], ys = [], direction = 'forward' }) => {
  const increment = direction === 'forward' ? 1 : -1;

  const initialY = ys[i];
  let targetY = null;
  let j = i;

  let xDistance = Infinity;
  let closestIndex = i;

  while (j >= 0 && j < ys?.length) {
    const y = ys[j];

    if (isNil(targetY) && y !== initialY) {
      targetY = y;
    }

    const newXDistance = Math.abs(xs[j] - xs[i]);
    if (y === targetY && newXDistance < xDistance) {
      xDistance = newXDistance;
      closestIndex = j;
    }

    if (!isNil(targetY) && y !== targetY) {
      break;
    }

    j += increment;
  }

  return closestIndex;
};

/**
 * Inserts text at the current selection, replacing any selected text
 */
export const insertText = ({ doc = {}, textToInsert = '' }) => {
  const newDoc = cloneDeep(doc);
  const selSmaller = Math.min(newDoc.selStart, newDoc.selEnd);
  const selBigger = Math.max(newDoc.selStart, newDoc.selEnd);

  newDoc.text = newDoc.text.slice(0, selSmaller) + textToInsert + newDoc.text.slice(selBigger);

  let styleAtStart = cloneDeep(newDoc.styles[selSmaller]);

  // Clear image-related properties when inserting regular text
  // to prevent copying image styles to new characters
  if (styleAtStart?.imageUrl) {
    delete styleAtStart.imageUrl;
    delete styleAtStart.imageWidth;
    delete styleAtStart.imageHeight;
    if (isEmpty(styleAtStart)) {
      styleAtStart = null;
    }
  }

  // if press Enter in indented paragraph
  const indentedStyle = isIndentedParagraph({
    text: doc.text,
    styles: doc.styles,
    i: selSmaller,
  });

  // Check if we're in a numbered list before modifying styles
  const wasInNumberedList = isNumberedStyle(indentedStyle);

  if (textToInsert === '\n' && indentedStyle) {
    styleAtStart = {
      ...styleAtStart,
      ...indentedStyle,
    };
  }
  if (!indentedStyle || textToInsert !== '\n') {
    delete styleAtStart?.indent;
    delete styleAtStart?.prefix;
    if (isEmpty(styleAtStart)) {
      styleAtStart = null;
    }
  }

  newDoc.styles = [
    ...newDoc.styles.slice(0, selSmaller),
    ...Array(textToInsert.length).fill(styleAtStart),
    ...newDoc.styles.slice(selBigger),
  ];

  // if press Enter in AI style (but NOT in numbered/bulleted list)
  // Don't override styles if we're in a list, as we need to preserve the list formatting
  if (
    textToInsert === '\n' &&
    styleAtStart?.queryId &&
    selSmaller === selBigger &&
    !wasInNumberedList &&
    !indentedStyle?.prefix
  ) {
    const nextChar = doc?.text?.[selBigger + 1];
    let nextCharStyle = { ...doc?.styles?.[selBigger] };
    if (nextChar === '\n' || TABLE_CHARS?.includes(nextChar)) {
      nextCharStyle = null;
    }

    newDoc.styles = [
      ...(doc?.styles?.slice(0, selSmaller) ?? []),
      null,
      nextCharStyle,
      ...(doc?.styles?.slice(selBigger + 1) ?? []),
    ];
  }

  newDoc.selStart += textToInsert.length;
  newDoc.selEnd = newDoc.selStart;

  // Renumber list items if we inserted a newline in a numbered list
  if (textToInsert === '\n' && wasInNumberedList) {
    // The new line is at selSmaller, renumber from there
    scanAndRenumber(newDoc, selSmaller);
  }

  return newDoc;
};

/**
 * Moves the caret based on arrow key input
 */
export const moveCaret = ({ doc = {}, key = '', xs = [], ys = [] }) => {
  const newDoc = cloneDeep(doc);
  let caretIndex = newDoc.selStart;
  let direction = 'forward';

  if (key === 'ArrowDown') {
    caretIndex = moveCaretToLine({ i: caretIndex, xs, ys, direction });
  }
  if (key === 'ArrowUp') {
    direction = 'back';
    caretIndex = moveCaretToLine({ i: caretIndex, xs, ys, direction });
  }
  if (key === 'ArrowRight') {
    caretIndex++;
  }
  if (key === 'ArrowLeft') {
    direction = 'back';
    caretIndex--;
  }
  caretIndex = Math.max(0, Math.min(newDoc.text.length, caretIndex));

  newDoc.selStart = safeCaret(caretIndex, newDoc.text, direction);
  newDoc.selEnd = newDoc.selStart;

  return newDoc;
};

/**
 * Deletes text at the current selection or the character before the caret
 */
export const deleteText = ({ doc = {} }) => {
  const newDoc = cloneDeep(doc);

  if (newDoc.selStart === newDoc.selEnd) {
    // Check if we're about to delete a table control character
    const charToDelete = newDoc.text[newDoc.selStart - 1];
    if (TABLE_CHARS.includes(charToDelete)) {
      // Check if at first cell of a row - delete entire row
      if (isAtRowFirstCellStart(newDoc.text, newDoc.selStart)) {
        const tStartIndex = findTableStart(newDoc.text, newDoc.selStart);
        const numRows = countTableRows(newDoc.text, tStartIndex);

        // If only one row, delete entire table
        if (numRows <= 1) {
          const tEndIndex = findTableEnd(newDoc.text, newDoc.selStart);
          if (tStartIndex >= 0 && tEndIndex >= 0) {
            newDoc.text = newDoc.text.slice(0, tStartIndex) + newDoc.text.slice(tEndIndex + 1);
            newDoc.styles = [
              ...newDoc.styles.slice(0, tStartIndex),
              ...newDoc.styles.slice(tEndIndex + 1),
            ];
            newDoc.selStart = tStartIndex;
            newDoc.selEnd = tStartIndex;
            newDoc.xs = [];
            newDoc.ys = [];
            return newDoc;
          }
        }

        // Delete the row
        const { rowStart, rowEnd } = getRowBoundaries(newDoc.text, newDoc.selStart);
        newDoc.text = newDoc.text.slice(0, rowStart) + newDoc.text.slice(rowEnd);
        newDoc.styles = [...newDoc.styles.slice(0, rowStart), ...newDoc.styles.slice(rowEnd)];
        newDoc.selStart = safeCaret(rowStart, newDoc.text, 'forward');
        newDoc.selEnd = newDoc.selStart;
        newDoc.xs = [];
        newDoc.ys = [];
        return newDoc;
      }

      // Move caret back past the table control character but don't delete
      newDoc.selStart = safeCaret(newDoc.selStart - 1, newDoc.text, 'back');
      newDoc.selEnd = newDoc.selStart;
      return newDoc;
    }
    newDoc.selStart--;
  }

  const selSmaller = Math.max(0, Math.min(newDoc.selStart, newDoc.selEnd));
  const selBigger = Math.max(newDoc.selStart, newDoc.selEnd);

  // Check if selection contains any table control characters
  for (let i = selSmaller; i < selBigger; i++) {
    if (TABLE_CHARS.includes(newDoc.text[i])) {
      // Don't allow deletion that would break table structure
      return doc;
    }
  }

  // Check if we're deleting a newline that's part of a numbered list
  // We need to check if the line after the deleted content has a numbered prefix
  let needsRenumber = false;
  const renumberStartIndex = selSmaller;

  // Check if deleting a newline character that has a numbered style
  for (let i = selSmaller; i < selBigger; i++) {
    if (doc.text[i] === '\n' && isNumberedStyle(doc.styles[i])) {
      needsRenumber = true;
      break;
    }
  }

  // Also check if the position after deletion has a numbered style
  if (!needsRenumber && selBigger < doc.text.length) {
    const styleAfterDeletion = doc.styles[selBigger];
    if (isNumberedStyle(styleAfterDeletion)) {
      needsRenumber = true;
    }
  }

  newDoc.text = newDoc.text.slice(0, selSmaller) + newDoc.text.slice(selBigger);
  newDoc.styles = [...newDoc.styles.slice(0, selSmaller), ...newDoc.styles.slice(selBigger)];
  newDoc.xs = [];
  newDoc.ys = [];

  newDoc.selStart = selSmaller;
  newDoc.selEnd = selSmaller;

  // Renumber if we deleted content that affects numbered list
  if (needsRenumber) {
    // Find the nearest newline before the deletion point to start renumbering
    const prevNewlineIdx = getPrevNewlineIndexFromPosition(newDoc.text, renumberStartIndex);
    if (isNumberedStyle(newDoc.styles[prevNewlineIdx])) {
      scanAndRenumber(newDoc, prevNewlineIdx);
    } else if (
      renumberStartIndex < newDoc.text.length &&
      isNumberedStyle(newDoc.styles[renumberStartIndex])
    ) {
      scanAndRenumber(newDoc, renumberStartIndex);
    }
  }

  return newDoc;
};
