// Stub for bz-office API calls — not used in bz-agent (data loaded via local file endpoint)
export const DATA_TYPES = ['General','Decimal','Number','Date','Percentage','Fraction','Scientific','Accounting','Time','Currency','Text','Custom'];
export const DATA_TYPE_TO_DATA_FORMAT_STR = {
  General: 'General', Decimal: '0.00', Number: '#,##0', Date: 'yyyy-mm-dd',
  Percentage: '0%', Fraction: '# ?/?', Scientific: '0.00E+00',
  Accounting: '"$"#,##0', Time: 'h:mm', Currency: '"$"#,##0.00',
  Text: '@', Custom: '',
};
export const patchExcelModelById = async () => {};
export const patchExcelModelSheetGrid = async () => {};
export const postExcelModelSheetAnnotations = async () => {};

// Major currencies for the toolbar currency picker
// format: Excel-style format string used by formatCellValue()
export const CURRENCIES = [
  { code: 'USD', symbol: '$',   name: 'US Dollar',         format: '"$"#,##0.00' },
  { code: 'EUR', symbol: '€',   name: 'Euro',              format: '"€"#,##0.00' },
  { code: 'GBP', symbol: '£',   name: 'British Pound',     format: '"£"#,##0.00' },
  { code: 'JPY', symbol: '¥',   name: 'Japanese Yen',      format: '"¥"#,##0' },
  { code: 'CNY', symbol: '¥',   name: 'Chinese Yuan',      format: '"¥"#,##0.00' },
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee',      format: '"₹"#,##0.00' },
  { code: 'KRW', symbol: '₩',   name: 'Korean Won',        format: '"₩"#,##0' },
  { code: 'CHF', symbol: 'Fr',  name: 'Swiss Franc',       format: '"Fr"#,##0.00' },
  { code: 'CAD', symbol: 'C$',  name: 'Canadian Dollar',   format: '"C$"#,##0.00' },
  { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar', format: '"A$"#,##0.00' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar',  format: '"HK$"#,##0.00' },
  { code: 'SGD', symbol: 'S$',  name: 'Singapore Dollar',  format: '"S$"#,##0.00' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso',      format: '"MX$"#,##0.00' },
  { code: 'BRL', symbol: 'R$',  name: 'Brazilian Real',    format: '"R$"#,##0.00' },
  { code: 'RUB', symbol: '₽',   name: 'Russian Ruble',     format: '"₽"#,##0.00' },
  { code: 'TRY', symbol: '₺',   name: 'Turkish Lira',      format: '"₺"#,##0.00' },
  { code: 'SAR', symbol: '﷼',   name: 'Saudi Riyal',       format: '"﷼"#,##0.00' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham',        format: '"د.إ"#,##0.00' },
  { code: 'SEK', symbol: 'kr',  name: 'Swedish Krona',     format: '"kr"#,##0.00' },
  { code: 'NOK', symbol: 'kr',  name: 'Norwegian Krone',   format: '"kr"#,##0.00' },
];

// Inverted mapping: format string → data type
export const DATA_FORMAT_STR_TO_DATA_TYPE = Object.fromEntries(
  Object.entries(DATA_TYPE_TO_DATA_FORMAT_STR).map(([k,v]) => [v, k])
);

// Excel functions list (subset for autocomplete)
export const SUPPORTED_FUNCTIONS = ['SUM','AVERAGE','MIN','MAX','COUNT','COUNTIF','IF','AND','OR','NOT','IFERROR',
  'VLOOKUP','HLOOKUP','INDEX','MATCH','OFFSET','INDIRECT','CONCATENATE','LEFT','RIGHT','MID','UPPER','LOWER',
  'TRIM','LEN','FIND','SEARCH','SUBSTITUTE','REPLACE','TEXT','VALUE','DATE','TODAY','NOW','YEAR','MONTH','DAY',
  'HOUR','MINUTE','SECOND','ABS','SQRT','POWER','ROUND','ROUNDUP','ROUNDDOWN','MOD','INT','CEILING','FLOOR',
  'LOG','LN','EXP','RAND','RANDBETWEEN','PMT','PV','FV','IRR','NPV','SUMIF','SUMIFS','AVERAGEIF','COUNTIFS'];

export const FUNCTION_TO_DESCRIPTION = Object.fromEntries(
  SUPPORTED_FUNCTIONS.map(f => [f, `${f}() — Excel function`])
);
