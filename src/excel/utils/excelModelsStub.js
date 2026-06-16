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
