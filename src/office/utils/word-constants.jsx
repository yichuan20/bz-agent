// Document canvas dimensions and scaling
export const VIEW_W = 816;
export const VIEW_H = 1000;
export const SF = 2;

// Typography
export const FONT_SIZE = 16;
export const LINE_HEIGHT = FONT_SIZE * 3.5;
export const PADDING = 10;

// Page dimensions (US Letter: 8.5" x 11" at 96 DPI)
export const PAGE_WIDTH = VIEW_W * SF; // Full width of canvas
export const PAGE_HEIGHT = 1056 * SF; // ~11 inches at 96 DPI, scaled
export const PAGE_GAP = 40 * SF; // Gray gap between pages
export const PAGE_MARGIN_TOP = 96 * SF;
export const PAGE_MARGIN_BOTTOM = 96 * SF;
export const PAGE_CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN_TOP - PAGE_MARGIN_BOTTOM;

// Document margins
export const START_X = 95 * SF;
export const START_Y = 120 * SF;
export const END_X = (VIEW_W - 100) * SF;

// Table control characters
export const T_START = '\u0010';
export const R_START = '\u0012';
export const C_START = '\u001c';
export const T_END = '\u0011';

export const TABLE_CHARS = [T_START, R_START, C_START, T_END];

// Cell padding for tables
export const PAD = 12;

// Arrow keys for navigation
export const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

// Style field definitions
export const STYLE_FIELD_TO_VALUE = {
  fontSize: 24,
  fontWeight: 'bold',
};

export const STYLE_FIELDS = Object.keys(STYLE_FIELD_TO_VALUE);

// Debug character fill colors
export const CHAR_FILL = {
  [T_START]: '#ff000017',
  [R_START]: '#40ff001e',
  [C_START]: '#3300ff14',
  [T_END]: '#ffee0055',
  '\n': '#ffff007f',
  ' ': '#2c2c2c15',
  '\t': '#36733915',
};

export const DEBUG_CHARS = Object.keys(CHAR_FILL);

// Empty document template
export const EMPTY_DOC = {
  text: '',
  styles: [],
  selStart: 0,
  selEnd: 0,
};

// Example table strings for testing
const TWO_COLUMNS = `${T_START}${R_START}${C_START}Col 1 has\nmuch text has much text has much text has much text has much text${C_START}Col 2${R_START}${C_START}Col 3${C_START}Col 4${T_END}`;

const THREE_COLUMNS = `${T_START}${R_START}${C_START}Col 1 has much text${C_START}Col 2 ${C_START}Col 3${R_START}${C_START}Col 3${C_START}Col 4${C_START}Col 5${T_END}`;

export const TEXT_WITH_TABLE = `First \nThis is a whole line\nMore stuff line${TWO_COLUMNS}Another line${THREE_COLUMNS}`;
