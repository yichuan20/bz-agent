/**
 * Document manipulation utilities for WordDoc toolbar
 * Extracted from DocToolbar.jsx for use with the new WordDocToolbar
 */

import { cloneDeep, isEmpty } from 'lodash';
import {
  FONT_SIZE,
  getPrevNewlineIndex,
  getStartEnd,
  insertText,
  isNumberedStyle,
  scanAndRenumber,
  T_START,
  R_START,
  C_START,
  T_END,
} from './word-utils-refactor';

// Types
export interface DocStyle {
  isBold?: boolean;
  isItalic?: boolean;
  isUnderlined?: boolean;
  isStrikethrough?: boolean;
  textColor?: string;
  bgColor?: string;
  fontSize?: number;
  url?: string;
  indent?: number;
  prefix?: string;
  imageUrl?: string;
  description?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface Doc {
  text: string;
  styles: (DocStyle | null)[];
  selStart: number;
  selEnd: number;
}

export interface SelectionStyle {
  isBold: boolean;
  isItalic: boolean;
  isUnderlined: boolean;
  isStrikethrough: boolean;
  isBullet: boolean;
  isNumbered: boolean;
  textColor: string;
  bgColor: string;
  url: string | undefined;
  fontSize: number;
}

// Indent constants
const INDENT_STEP = 100;
const MIN_INDENT = 0;
const MAX_INDENT = 800;

/**
 * Get the current selection style from the document
 */
export const getSelectionStyle = (doc: Doc): SelectionStyle => {
  const [start, end] = getStartEnd(doc);
  const selectedStyles = doc?.styles?.slice(start, end);

  // Get the paragraph style at selection start
  const prefixIndex = getPrevNewlineIndex(doc);
  const currentParagraphStyle = doc?.styles?.[prefixIndex];

  const isBullet = currentParagraphStyle?.prefix === '•';
  const isNumbered = isNumberedStyle(currentParagraphStyle);

  if (!selectedStyles?.length) {
    return {
      isBold: false,
      isItalic: false,
      isUnderlined: false,
      isStrikethrough: false,
      isBullet,
      isNumbered,
      textColor: '#000000',
      bgColor: 'transparent',
      url: undefined,
      fontSize: 16,
    };
  }

  return {
    isBold: selectedStyles?.every((style: DocStyle | null) => style?.isBold) ?? false,
    isItalic: selectedStyles?.every((style: DocStyle | null) => style?.isItalic) ?? false,
    isUnderlined: selectedStyles?.every((style: DocStyle | null) => style?.isUnderlined) ?? false,
    isStrikethrough: selectedStyles?.every((style: DocStyle | null) => style?.isStrikethrough) ?? false,
    isBullet,
    isNumbered,
    textColor: selectedStyles?.find((style: DocStyle | null) => style?.textColor)?.textColor || '#000000',
    bgColor: selectedStyles?.find((style: DocStyle | null) => style?.bgColor)?.bgColor || 'transparent',
    url: selectedStyles?.find((style: DocStyle | null) => style?.url)?.url,
    fontSize: selectedStyles?.find((style: DocStyle | null) => style?.fontSize)?.fontSize || 16,
  };
};

/**
 * Toggle a style field (bold, italic, underline, strikethrough)
 */
export const toggleStyle = (doc: Doc, styleField: string): Doc => {
  const [start, end] = getStartEnd(doc);
  const selectedStyles = doc?.styles?.slice(start, end);
  const isActive = selectedStyles?.every((style: DocStyle | null) => style?.[styleField as keyof DocStyle]);

  const newDoc = cloneDeep(doc);
  let i = start;
  while (i < end) {
    if (isActive) {
      delete (newDoc.styles[i] as DocStyle)?.[styleField as keyof DocStyle];
      if (isEmpty(newDoc.styles[i])) {
        newDoc.styles[i] = null;
      }
    } else {
      newDoc.styles[i] = {
        ...newDoc.styles[i],
        [styleField]: true,
      };
    }
    i++;
  }

  return newDoc;
};

/**
 * Add a style field value (fontSize, url, bgColor, textColor)
 */
export const addStyleField = (doc: Doc, fieldName: string, fieldValue: string | number): Doc => {
  const newDoc = cloneDeep(doc);

  if (fieldName === 'fontSize') {
    const fontSize = typeof fieldValue === 'string' ? parseInt(fieldValue) : fieldValue;
    const [start, end] = getStartEnd(doc);
    let i = start;
    while (i < end) {
      if (fontSize === FONT_SIZE) {
        delete (newDoc.styles[i] as DocStyle)?.fontSize;
        if (isEmpty(newDoc.styles[i])) {
          newDoc.styles[i] = null;
        }
      } else {
        newDoc.styles[i] = {
          ...newDoc.styles[i],
          fontSize,
        };
      }
      i++;
    }
  }

  if (fieldName === 'url') {
    const [start, end] = getStartEnd(doc);
    let i = start;
    while (i < end) {
      if (!fieldValue) {
        delete (newDoc.styles[i] as DocStyle)?.url;
        if (isEmpty(newDoc.styles[i])) {
          newDoc.styles[i] = null;
        }
      } else {
        newDoc.styles[i] = {
          ...newDoc.styles[i],
          url: fieldValue as string,
        };
      }
      i++;
    }
  }

  if (fieldName === 'bgColor') {
    const [start, end] = getStartEnd(doc);
    let i = start;
    while (i < end) {
      if (fieldValue === 'transparent') {
        delete (newDoc.styles[i] as DocStyle)?.bgColor;
        if (isEmpty(newDoc.styles[i])) {
          newDoc.styles[i] = null;
        }
      } else {
        newDoc.styles[i] = {
          ...newDoc.styles[i],
          bgColor: fieldValue as string,
        };
      }
      i++;
    }
  }

  if (fieldName === 'textColor') {
    const [start, end] = getStartEnd(doc);
    let i = start;
    while (i < end) {
      if (fieldValue === 'black') {
        delete (newDoc.styles[i] as DocStyle)?.textColor;
        if (isEmpty(newDoc.styles[i])) {
          newDoc.styles[i] = null;
        }
      } else {
        newDoc.styles[i] = {
          ...newDoc.styles[i],
          textColor: fieldValue as string,
        };
      }
      i++;
    }
  }

  return newDoc;
};

/**
 * Get all prefix indices (newline positions) for the current selection
 */
const getPrefixIndices = (doc: Doc): number[] => {
  const [, end] = getStartEnd(doc);
  const firstPrefixIndex = getPrevNewlineIndex(doc);

  const prefixIndices = [firstPrefixIndex];
  let i = firstPrefixIndex + 1;
  while (i < end) {
    if (doc.text[i] === '\n') {
      prefixIndices.push(i);
    }
    i++;
  }

  return prefixIndices;
};

/**
 * Add bullet list formatting
 */
export const addBullet = (doc: Doc): Doc => {
  const prefixIndices = getPrefixIndices(doc);
  const newDoc = cloneDeep(doc);

  prefixIndices.forEach(i => {
    const currentIndent = (newDoc.styles?.[i] as DocStyle)?.indent || 0;
    const hasIndent = currentIndent > 0;
    newDoc.styles[i] = {
      indent: hasIndent ? currentIndent : 100,
      prefix: '•',
    };
  });

  return newDoc;
};

/**
 * Remove bullet list formatting
 */
export const removeBullet = (doc: Doc): Doc => {
  const prefixIndices = getPrefixIndices(doc);
  const newDoc = cloneDeep(doc);

  prefixIndices.forEach(i => {
    const currentIndent = (newDoc.styles?.[i] as DocStyle)?.indent || 0;
    const newIndent = currentIndent - 100;
    if (newIndent <= 0) {
      newDoc.styles[i] = null;
      return;
    }
    newDoc.styles[i] = {
      indent: newIndent,
    };
  });

  return newDoc;
};

/**
 * Add numbered list formatting
 */
export const addNumberedList = (doc: Doc): Doc => {
  const prefixIndices = getPrefixIndices(doc);
  const newDoc = cloneDeep(doc);

  prefixIndices.forEach(i => {
    const currentIndent = (newDoc.styles?.[i] as DocStyle)?.indent || 0;
    const hasIndent = currentIndent > 0;

    newDoc.styles[i] = {
      ...(newDoc.styles[i] || {}),
      indent: hasIndent ? currentIndent : 100,
      prefix: '1.',
    };
  });

  // Renumber from the first affected line
  if (prefixIndices.length > 0) {
    scanAndRenumber(newDoc, prefixIndices[0]);
  }

  return newDoc;
};

/**
 * Remove numbered list formatting
 */
export const removeNumberedList = (doc: Doc): Doc => {
  const prefixIndices = getPrefixIndices(doc);
  const newDoc = cloneDeep(doc);

  prefixIndices.forEach(i => {
    if (!newDoc.styles?.[i]) return;

    const currentIndent = (newDoc.styles[i] as DocStyle).indent || 0;
    const newIndent = Math.max(0, currentIndent - 100);

    delete (newDoc.styles[i] as DocStyle).prefix;

    if (newIndent > 0) {
      (newDoc.styles[i] as DocStyle).indent = newIndent;
    } else {
      delete (newDoc.styles[i] as DocStyle).indent;
    }

    if (isEmpty(newDoc.styles[i])) {
      newDoc.styles[i] = null;
    }
  });

  // Renumber the following list items if they exist
  const lastIndex = prefixIndices[prefixIndices.length - 1];
  let nextLineIndex = lastIndex + 1;
  while (nextLineIndex < newDoc.text.length && newDoc.text[nextLineIndex] !== '\n') {
    nextLineIndex++;
  }

  if (nextLineIndex < newDoc.text.length && isNumberedStyle(newDoc.styles[nextLineIndex])) {
    scanAndRenumber(newDoc, nextLineIndex);
  }

  return newDoc;
};

/**
 * Increase indent
 */
export const increaseIndent = (doc: Doc): Doc => {
  const prefixIndices = getPrefixIndices(doc);
  const newDoc = cloneDeep(doc);

  prefixIndices.forEach(i => {
    const currentIndent = (newDoc.styles?.[i] as DocStyle)?.indent || 0;
    if (currentIndent >= MAX_INDENT) {
      return;
    }
    const newIndent = Math.min(currentIndent + INDENT_STEP, MAX_INDENT);
    newDoc.styles[i] = {
      ...(newDoc?.styles?.[i] || {}),
      indent: newIndent,
    };
  });

  return newDoc;
};

/**
 * Decrease indent
 */
export const decreaseIndent = (doc: Doc): Doc => {
  const prefixIndices = getPrefixIndices(doc);
  const newDoc = cloneDeep(doc);

  prefixIndices.forEach(i => {
    const currentIndent = (newDoc.styles?.[i] as DocStyle)?.indent || 0;
    const newIndent = currentIndent - INDENT_STEP;
    if (newIndent <= MIN_INDENT) {
      newDoc.styles[i] = null;
      return;
    }
    newDoc.styles[i] = {
      ...(newDoc?.styles?.[i] || {}),
      indent: newIndent,
    };
  });

  return newDoc;
};

/**
 * Check if a position is inside a table
 */
const isPositionInTable = (text: string, position: number): boolean => {
  let tableDepth = 0;
  for (let i = 0; i < position && i < text.length; i++) {
    if (text[i] === T_START) {
      tableDepth++;
    } else if (text[i] === T_END) {
      tableDepth--;
    }
  }

  if (tableDepth > 0) {
    return true;
  }
  if (position > 0 && text[position - 1] === T_END) {
    return true;
  }

  return false;
};

/**
 * Check if cursor is inside a table
 */
export const isCursorInTable = (doc: Doc): boolean => {
  if (!doc?.text) return false;
  const { text, selStart, selEnd } = doc;
  return isPositionInTable(text, selStart) || isPositionInTable(text, selEnd);
};

/**
 * Generate table string
 */
const generateTableString = (rows: number, cols: number): string => {
  if (rows <= 0 || cols <= 0) {
    return '';
  }

  let tableString = T_START;

  for (let r = 0; r < rows; r++) {
    tableString += R_START;
    for (let c = 0; c < cols; c++) {
      tableString += C_START;
    }
  }

  tableString += T_END;
  return tableString;
};

/**
 * Insert a table at the current cursor position
 */
export const insertTable = ({ doc, rows = 1, cols = 1 }: { doc: Doc; rows?: number; cols?: number }): Doc => {
  const tableString = generateTableString(rows, cols);
  if (!tableString) {
    return doc;
  }

  const newDoc = insertText({ doc, textToInsert: tableString }) as Doc;
  return newDoc;
};

/**
 * Insert an image at the current cursor position
 */
/**
 * Insert text at the current cursor position with neutral styling
 * (removes font size, colors, etc. to avoid inheriting large headings)
 */
export const insertTextAtCursor = (doc: Doc, text: string): Doc => {
  if (!doc) return doc;

  // First, insert the text normally (this will inherit styles at cursor)
  let newDoc = insertText({ doc, textToInsert: text }) as Doc;

  // Then, strip formatting styles from the inserted text
  // Keep only structural styles like indent/prefix
  const selStart = Math.min(doc.selStart, doc.selEnd);
  const insertLength = text.length;

  // Clear formatting styles (fontSize, colors, bold, italic, etc.)
  // but keep paragraph styles (indent, prefix)
  for (let i = selStart; i < selStart + insertLength; i++) {
    const currentStyle = newDoc.styles[i];
    if (currentStyle) {
      const cleanedStyle: DocStyle = {};

      // Keep only paragraph-level styles
      if (currentStyle.indent !== undefined) {
        cleanedStyle.indent = currentStyle.indent;
      }
      if (currentStyle.prefix !== undefined) {
        cleanedStyle.prefix = currentStyle.prefix;
      }

      newDoc.styles[i] = isEmpty(cleanedStyle) ? null : cleanedStyle;
    }
  }

  // If the inserted text doesn't end with a newline, add one
  if (!text.endsWith('\n')) {
    newDoc = insertText({ doc: newDoc, textToInsert: '\n' }) as Doc;
  }

  return newDoc;
};

export const insertImage = ({
  doc,
  imageUrl = '',
  description = '',
  width = 64,
  height = 64,
}: {
  doc: Doc;
  imageUrl?: string;
  description?: string;
  width?: number;
  height?: number;
}): Doc => {
  const newDoc = cloneDeep(doc);
  const selSmaller = Math.min(newDoc.selStart, newDoc.selEnd);
  const selBigger = Math.max(newDoc.selStart, newDoc.selEnd);

  // Insert a placeholder character (space) for the image
  const placeholder = ' ';
  newDoc.text = newDoc.text.slice(0, selSmaller) + placeholder + newDoc.text.slice(selBigger);

  // Create style with image information
  const imageStyle: DocStyle = {
    imageUrl,
    description,
    imageWidth: width,
    imageHeight: height,
  };

  newDoc.styles = [
    ...newDoc.styles.slice(0, selSmaller),
    imageStyle,
    ...newDoc.styles.slice(selBigger),
  ];

  newDoc.selStart = selSmaller + 1;
  newDoc.selEnd = newDoc.selStart;

  return newDoc;
};
