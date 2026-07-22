/**
 * Text analysis utilities for document processing
 * Pure functions for analyzing text structure (paragraphs, indents, lists)
 */

/**
 * Checks if a word at the current position would overlap the end boundary
 */
export const isWordOverlappingEnd = ({ x, text, i, ctx, endX }) => {
  if (text?.[i] !== ' ') {
    return false;
  }

  let word = '';
  let j = i + 1;
  while (text[j] !== ' ' && text[j] !== '\n' && j < text.length) {
    word += text[j];
    j++;
  }

  return x + ctx.measureText(word).width > endX;
};

/**
 * Checks if the current position is within a list paragraph
 */
export const isListParagraph = ({ styles = [], text, i }) => {
  if (!text?.length) {
    return false;
  }

  let j = i - 1;
  while (text[j] !== '\n' && j > 0) {
    if (styles[j]?.prefix) {
      return true;
    }
    j--;
  }
  if (styles[j]?.prefix) {
    return true;
  }

  return false;
};

/**
 * Checks if the current position is within an indented paragraph
 * Returns the style object if indented, null otherwise
 */
export const isIndentedParagraph = ({ text, styles, i }) => {
  if (!text?.length) {
    return null;
  }

  // newline belongs to next paragraph
  let j = i - 1;
  while (text[j] !== '\n' && j > 0) {
    j--;
  }
  if (styles?.[j]?.indent > 0) {
    return styles?.[j];
  }

  return null;
};

/**
 * Gets the index of the previous newline character from the current selection
 */
export const getPrevNewlineIndex = doc => {
  const start = Math.min(doc?.selStart, doc?.selEnd);
  let j = start - 1;
  while (j > 0) {
    if (doc?.text[j] === '\n') {
      return j;
    }
    j--;
  }

  return Math.max(j, 0);
};

/**
 * Check if a style represents a numbered list item
 * Matches format: "1.", "2.", "123.", etc.
 */
export const isNumberedStyle = style => style?.prefix && /^\d+\.$/.test(style.prefix);

/**
 * Finds the previous newline index from a given position
 */
export const getPrevNewlineIndexFromPosition = (text, position) => {
  let j = position - 1;
  while (j > 0) {
    if (text[j] === '\n') {
      return j;
    }
    j--;
  }
  return Math.max(j, 0);
};
