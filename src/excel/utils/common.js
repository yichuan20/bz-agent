import { format, formatDistance } from 'date-fns';
import { isEqual } from 'lodash';

export const formatLongNumber = (num, digits = 3) => {
  try {
    const lookup = [
      { value: 1, symbol: '' },
      { value: 1e3, symbol: 'k' },
      { value: 1e6, symbol: 'M' },
    ];
    const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    var item = lookup
      .slice()
      .reverse()
      .find(item => num >= item.value);
    return item ? (num / item.value).toFixed(digits).replace(rx, '$1') + item.symbol : '0';
  } catch {
    return num;
  }
};

export const uuidv4 = () => {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
  );
};

export const sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const getHtmlStringWithBoldOccurences = (content, query) => {
  let result = content?.replaceAll(query, `<span style="font-weight: bold;">${query}</span>`);

  const queryCapitalised = query?.[0]?.toUpperCase() + query?.slice(1);
  result = result?.replaceAll(
    queryCapitalised,
    `<span style="font-weight: bold;">${queryCapitalised}</span>`,
  );

  return result;
};

export const getColorFromString = s => {
  if (s === 'POSITIVE') {
    return '#00C853';
  }

  if (s === 'NEGATIVE') {
    return '#d9534f';
  }

  if (!s) {
    return '#00000055';
  }

  const cyrb53 = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed,
      h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  };

  return `#${cyrb53(s)?.toString(16)?.substring(0, 6)}`;
};

export const COLORS = [
  '#0191ff',
  '#9650ff',
  '#009933',
  '#d9534f',
  '#a4b9a8',
  '#ffcc00',
  '#ff6600',
  '#BB0000',
  '#cc0066',
  '#660066',
  '#4d4da5',
  '#ff00ff',
];
export const getColorFromIndex = index => {
  return COLORS?.[index] || getColorFromString(`color-${index}`);
};

export const includesObject = (arr, obj) => !!arr.find(item => isEqual(item, obj));

export const capitaliseFirst = name => {
  if (!name) {
    return '';
  }

  return String(name)?.[0].toUpperCase() + String(name).slice(1);
};

export const isFalsey = val => !val;

export const jsonParse = str => {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
};

export const parseJson = str => {
  let result = str;
  try {
    result = JSON.parse(str?.replaceAll('\n', ' '));
  } catch {
    result = str;
  }
  if (result === 0) {
    return 0;
  }
  return result || [];
};

export const getTableId = table =>
  `${table?.tableDocumentLocation?.fileId}-${table?.tableDocumentLocation?.pageNumber}-${table?.tableDocumentLocation?.annotationId}`;

export const makeElementFirstInArray = (inputArr, element) => {
  if (!inputArr || !element) {
    return inputArr;
  }
  const arr = [...inputArr];
  const index = arr.indexOf(element);
  if (index > -1) {
    arr.splice(index, 1);
  }
  arr.unshift(element);
  return arr;
};

export const getArrayWithUpsertedItem = ({ array, item, key }) => {
  return [...array.filter(i => i[key] !== item[key]), item];
};

export const getArrayWithUpsertedItems = ({ array, items, key }) => {
  return [...array.filter(i => !items.find(item => item[key] === i[key])), ...items];
};

export const by =
  (fieldName, order = 'asc') =>
  (a, b) => {
    if (order === 'asc') {
      return a?.[fieldName] > b?.[fieldName] ? 1 : -1;
    }
    return a?.[fieldName] < b?.[fieldName] ? 1 : -1;
  };

export const sortArrayByAnotherArray = (arrayToSort, arrayToSortBy) => {
  if (!arrayToSort || !arrayToSortBy) {
    return [];
  }
  return arrayToSort.sort((a, b) => {
    return arrayToSortBy.indexOf(a) - arrayToSortBy.indexOf(b);
  });
};

export const getBase64FromImageFile = async file => {
  const base64Str = await new Promise(resolve => {
    let baseURL = '';
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      baseURL = reader.result;
      resolve(baseURL);
    };
  });

  return base64Str;
};

export const isTruthy = val => !!val;

export const safeFormat = (date, formatString) => {
  try {
    return format(new Date(date), formatString);
  } catch {
    return '';
  }
};

export const safeFormatDistance = (date1, date2) => {
  try {
    return formatDistance(date1, date2);
  } catch {
    return '';
  }
};
