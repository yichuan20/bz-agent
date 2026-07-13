import { cloneDeep, isEmpty, isEqual, last } from 'lodash';
import { uuidv4 } from './common';
import {
  C_START,
  getNumberOfColumns,
  getNumberOfRows,
  R_START,
  T_END,
  T_START,
  TABLE_CHARS,
} from './word-utils-refactor';

const EMPTY_BLOCK = {
  text: '',
  styles: [],
};

const isCharStyleQueryOnly = charStyle => {
  const copyStyle = cloneDeep(charStyle);
  delete copyStyle?.queryId;
  delete copyStyle?.prompt;

  return isEmpty(copyStyle);
};

export const getBlocksFromDoc = (doc = { text: '', styles: [] }) => {
  const blocks = [];

  let block = cloneDeep(EMPTY_BLOCK);
  // First block's alignment is stored at styles[0] (same position as prefix for first paragraph)
  if (doc?.styles?.[0]?.alignment) {
    block.alignment = doc.styles[0].alignment;
  }
  const cursor = { blockIndex: 0, letterIndex: 0 };

  let i = 0;
  let iInBlock = 0;
  let blockIndex = 0;

  let rowIndex = -1;
  let columnIndex = -1;
  let numberOfColumns = 0;
  let numberOfRows = 0;
  let isInTable = false;
  let tableId = '';

  let styleHash = 'null';
  const insertedQueryIds = [];

  while (i < doc.text.length) {
    if (i === doc?.selStart) {
      cursor.blockIndex = blockIndex;
      cursor.letterIndex = iInBlock;
    }

    const char = doc.text[i];
    const charStyle = doc?.styles?.[i];

    // if prompt is there, and no query block, add it
    if (charStyle?.queryId && !insertedQueryIds.includes(charStyle.queryId)) {
      insertedQueryIds.push(charStyle.queryId);
      blocks.push({
        ...cloneDeep(EMPTY_BLOCK),
        isQuery: true,
        queryId: charStyle.queryId,
        text: charStyle.prompt,
      });
      block.queryId = charStyle.queryId;
      blockIndex++;
    }

    if (JSON.stringify(charStyle) !== styleHash) {
      styleHash = JSON.stringify(charStyle);
      if (charStyle && !isCharStyleQueryOnly(charStyle)) {
        block?.styles?.push({
          start: iInBlock,
          end: iInBlock + 1,  // exclusive end: covers [start, end)
          ...charStyle,
        });
      }
    }

    if (charStyle && JSON.stringify(charStyle) === styleHash && !isCharStyleQueryOnly(charStyle)) {
      last(block?.styles).end = iInBlock + 1;  // exclusive end
    }

    if (char === T_START) {
      tableId = uuidv4();
      rowIndex = -1;
      columnIndex = -1;
      isInTable = true;
      numberOfColumns = getNumberOfColumns({ text: doc?.text, tStartI: i });
      numberOfRows = getNumberOfRows({ text: doc?.text, tStartI: i });
    }

    if (char === T_END) {
      isInTable = false;
      numberOfColumns = 0;
      numberOfRows = 0;
    }

    if (char === R_START) {
      rowIndex += 1;
      columnIndex = -1;
    }

    if (char === C_START) {
      columnIndex += 1;
    }

    if (charStyle?.queryId) {
      block.queryId = charStyle.queryId;
    }

    if (char === C_START) {
      blockIndex++;
      iInBlock = -1;
      blocks.push(block);
      block = {
        ...cloneDeep(EMPTY_BLOCK),
        isTableCell: true,
        tableId,
        rowIndex,
        columnIndex,
        numberOfRows,
        numberOfColumns,
      };
      i++;
      iInBlock++;
      continue;
    }

    if (char === '\n' || char === T_END) {
      styleHash = 'null';
      blockIndex++;
      iInBlock = 0;
      blocks.push(block);
      block = cloneDeep(EMPTY_BLOCK);

      // if next line is indented or bulleted
      if (charStyle?.indent) {
        block = {
          ...block,
          indent: charStyle?.indent * 0.1,
          prefix: charStyle?.prefix,
        };
      }

      // propagate alignment to the next block
      if (charStyle?.alignment) {
        block = { ...block, alignment: charStyle.alignment };
      }

      // propagate lineSpacing to the next block
      if (charStyle?.lineSpacing) {
        block = { ...block, lineSpacing: charStyle.lineSpacing };
      }

      if (isInTable) {
        block = { ...block, isTableCell: true, rowIndex, columnIndex };
      }
      i++;
      continue;
    }

    if (TABLE_CHARS.includes(char)) {
      i++;
      iInBlock++;
      continue;
    }

    block.text += char;
    i++;
    iInBlock++;
  }

  if (doc?.selStart === doc?.text.length) {
    cursor.blockIndex = blockIndex;
    cursor.letterIndex = iInBlock;
  }

  blocks.push(block);

  return { blocks, cursor };
};

export const getSelStartFromCursor = (blocks = [], cursor = { blockIndex: 0, letterIndex: 0 }) => {
  let selStart = 0;

  let blockIndex = 0;
  while (blockIndex < cursor.blockIndex) {
    if (blocks[blockIndex]?.isQuery) {
      blockIndex++;
      continue;
    }

    selStart += blocks[blockIndex].text.length + 1;
    blockIndex++;
  }

  selStart += cursor.letterIndex;

  return selStart;
};

const getStyleAt = (blocks, blockIndex, iBlock = 0) => {
  const block = blocks[blockIndex];

  // Backend uses exclusive end (end = start + len), so use strict <.
  // Fallback to last style for positions at/past the end (e.g. the \n sentinel char).
  let charStyle = block?.styles?.find(s => iBlock >= s.start && iBlock < s.end);
  if (!charStyle && block?.styles?.length) {
    const last = block.styles[block.styles.length - 1];
    if (iBlock >= last.start) charStyle = last;
  }
  charStyle = cloneDeep(charStyle) || {};
  delete charStyle?.start;
  delete charStyle?.end;

  if (block?.queryId) {
    const queryBlock = blocks?.find(b => b?.isQuery && b.queryId === block.queryId);

    charStyle = {
      ...charStyle,
      queryId: block.queryId,
      prompt: queryBlock?.text,
    };
  }

  // metas=null keys gets added by BE sometimes
  if (!charStyle?.metas) {
    delete charStyle?.metas;
  }

  if (!isEmpty(charStyle)) {
    return charStyle;
  }

  return null;
};

const getTableChars = (blocks, blockIndex) => {
  const block = blocks?.[blockIndex];
  const prevBlock = blocks?.[blockIndex - 1];

  if (!block?.isTableCell && prevBlock?.isTableCell) {
    return T_END;
  }

  if (!block?.isTableCell && !prevBlock?.isTableCell) {
    return '';
  }

  if (block?.isTableCell && !prevBlock?.isTableCell) {
    return T_START + R_START + C_START;
  }

  if (block?.rowIndex !== prevBlock?.rowIndex) {
    return R_START + C_START;
  }

  if (block?.columnIndex !== prevBlock?.columnIndex) {
    return C_START;
  }

  return '';
};

const shouldAddNewLineAtEndOfBlock = (blocks, blockIndex) => {
  // dont add for the very last block
  if (blockIndex === blocks.length - 1) {
    return false;
  }

  const block = blocks?.[blockIndex];
  const nextBlock = blocks?.[blockIndex + 1];
  const nextNextBlock = blocks?.[blockIndex + 2];

  // dont add right before table
  if (!block?.isTableCell && nextBlock?.isTableCell) {
    return false;
  }

  // if last block in cell
  if (
    block?.isTableCell &&
    (nextBlock?.rowIndex !== block?.rowIndex || nextBlock?.columnIndex !== block?.columnIndex)
  ) {
    return false;
  }

  // dont add right before generated
  if (!block?.isTableCell && nextBlock?.isQuery && nextNextBlock?.isTableCell) {
    return false;
  }

  return true;
};

const getTableTextAndStyles = (blocks, blockIndex) => {
  const block = blocks?.[blockIndex];
  let i = 0;
  let blockStyles = [];
  let blockText = '';

  const queryBlock = blocks?.find(b => b?.isQuery && b.queryId === block.queryId);

  while (i < block.text.length) {
    const tableAtChar = block?.tables?.find(t => i === t.start);

    if (!tableAtChar) {
      blockText += block.text[i];

      // preserve prompt
      let styleBlocks = [block];
      if (queryBlock) {
        styleBlocks = [queryBlock, block];
      }

      blockStyles.push(getStyleAt(styleBlocks, styleBlocks?.length - 1, i));
      i++;
      continue;
    }

    let tableBlocks = tableAtChar?.blocks;
    if (queryBlock) {
      tableBlocks = [queryBlock, ...tableBlocks];
    }

    const tableDoc = getDocFromBlocks(tableBlocks);
    blockText += tableDoc.text;
    blockStyles = [...blockStyles, ...tableDoc?.styles];
    i = tableAtChar.end + 1;
  }

  return {
    blockText,
    blockStyles,
  };
};

export const getDocFromBlocks = (blocks = [], cursor = { blockIndex: 0, letterIndex: 0 }) => {
  const doc = {
    text: '',
    styles: [],
    selStart: getSelStartFromCursor(blocks, cursor),
    selEnd: getSelStartFromCursor(blocks, cursor),
  };

  let blockIndex = 0;
  let i = 0;

  while (blockIndex < blocks.length) {
    const block = blocks[blockIndex];
    if (block?.tables?.length) {
      const { blockText, blockStyles } = getTableTextAndStyles(blocks, blockIndex);
      doc.text += blockText;
      doc.styles = [...doc.styles, ...blockStyles];
      blockIndex++;
      continue;
    }

    if (block?.isQuery) {
      blockIndex++;
      continue;
    }

    // check if table cell block
    if (getTableChars(blocks, blockIndex)) {
      const tChars = getTableChars(blocks, blockIndex);
      doc.text += tChars;
      i += tChars.length;
    }

    // go through text in block
    let iBlock = 0;
    while (iBlock < block.text.length) {
      doc.text += block.text[iBlock];
      let charStyle = getStyleAt(blocks, blockIndex, iBlock);
      // First char of first block: store this block's alignment so getSelectionStyle can read it
      if (blockIndex === 0 && iBlock === 0 && block?.alignment) {
        charStyle = { ...(charStyle || {}), alignment: block.alignment };
      }
      doc.styles[i] = charStyle;
      i++;
      iBlock++;
    }

    if (block?.isTableCell && blockIndex === blocks.length - 1) {
      doc.text += T_END;
      doc.styles[i] = null;
      i++;
    }

    if (shouldAddNewLineAtEndOfBlock(blocks, blockIndex)) {
      doc.text += '\n';
      // The \n's style stores the NEXT block's properties (alignment, lineSpacing)
      const nextBlock = blocks[blockIndex + 1];
      const baseStyle = getStyleAt(blocks, blockIndex, iBlock);
      const nextAlignment = nextBlock?.alignment;
      const nextLineSpacing = nextBlock?.lineSpacing;
      if (nextAlignment || nextLineSpacing) {
        doc.styles[i] = {
          ...(baseStyle || {}),
          ...(nextAlignment ? { alignment: nextAlignment } : {}),
          ...(nextLineSpacing ? { lineSpacing: nextLineSpacing } : {}),
        };
      } else {
        doc.styles[i] = baseStyle;
      }
      i++;
    }
    blockIndex++;
  }

  const docWithMdStyles = addMdStyling(doc);

  return docWithMdStyles;
};

const addMdStyling = doc => {
  if (!doc.text) {
    return doc;
  }

  const newDoc = cloneDeep(doc);
  newDoc.text = '';
  newDoc.styles = [];

  let i = 0;
  let isBold = false;
  let isTitle = false;
  while (i < doc?.text?.length) {
    const newCharStyle = doc?.styles?.[i] || {};

    if (doc?.text?.slice(i, i + 2) === '**') {
      isBold = !isBold;
      i += 2;
      continue;
    }

    if (doc?.text?.slice(i, i + 2) === '# ') {
      isTitle = true;
      i += 2;
      continue;
    }
    if (isTitle && doc?.text?.[i] === '\n') {
      isTitle = false;
    }

    if (isTitle) {
      newCharStyle.fontSize = 28;
    }

    let finalStyle = {
      ...newCharStyle,
      isBold: newCharStyle?.isBold || isBold,
    };

    if (isEqual(finalStyle, { isBold: false })) {
      finalStyle = null;
    }

    newDoc.styles.push(finalStyle);
    newDoc.text += doc.text[i];

    i++;
  }

  return newDoc;
};
