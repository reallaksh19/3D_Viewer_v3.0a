 /**
 * Functionality: parses selected-geometry enrichment master files supplied from
 * the RVM UI. Parameters: browser File/text input plus master kind. Outputs:
 * frozen row arrays with source metadata. Fallback: empty files return no rows;
 * malformed JSON/CSV/XLSX raises an explicit parse error with the file name.
 */

import { freezeDeep, text } from './selected-geometry-shared.js';

const WORKBOOK_FILE_RE = /\.(xlsx|xlsm|xlsb|xls|ods)$/i;

const MASTER_ALIAS_GROUPS = Object.freeze({
  lineList: Object.freeze({
    lineNo: ['lineNo', 'Line No', 'Line Number', 'LineNo', 'LINENO', 'LINE_NO', 'LINE NUMBER', 'PipelineReference', 'Pipeline Reference', 'LINE KEY', 'Line Key'],
    lineNoKey: ['lineNoKey', 'lineNo', 'Line No', 'Line Number', 'LineNo', 'LINENO', 'LINE_NO', 'PipelineReference', 'Pipeline Reference', 'LINE KEY', 'Line Key'],
    lineKey: ['lineKey', 'Line Key', 'LINEKEY', 'LINE_KEY', 'Key', 'KEY'],
    lineKey1: ['lineKey1', 'Key 1', 'ColumnX1', 'Service', 'SERVICE', 'Fluid', 'FLUID'],
    lineKey2: ['lineKey2', 'Key 2', 'ColumnX2', 'Line Number', 'Line No', 'LINENO', 'PipelineReference', 'Pipeline Reference'],
    pipingClass: ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Pipe Class', 'PIPE_CLASS', 'Class', 'CLASS', 'Spec', 'SPEC'],
    rating: ['rating', 'Rating', 'RATING', 'Class Rating', 'Pressure Class', 'CLASS_RATING'],
    material: ['material', 'Material', 'MATERIAL', 'Material Name', 'MATERIAL_NAME', 'Description'],
    materialCode: ['materialCode', 'Material Code', 'MATERIAL_CODE', 'MAT_CODE', 'Mat Code', 'CII Code'],
    p1: ['p1', 'P1', 'Pressure', 'PRESSURE', 'Pressure1', 'PRESSURE1', 'Design Pressure', 'DESIGN_PRESSURE'],
    t1: ['t1', 'T1', 'Temperature', 'TEMP', 'Temp1', 'TEMP1', 'TEMP_EXP_C1', 'Design Temperature', 'DESIGN_TEMP'],
    t2: ['t2', 'T2', 'Temp2', 'TEMP2', 'TEMP_EXP_C2', 'Operating Temperature', 'OPERATING_TEMP'],
    t3: ['t3', 'T3', 'Temp3', 'TEMP3', 'TEMP_EXP_C3', 'Minimum Temperature', 'MIN_TEMP'],
    density: ['density', 'Density', 'DENSITY', 'Fluid Density', 'FLUID_DENSITY', 'Density kg/m3', 'DENSITY_KG_M3'],
  }),
  pipingClass: Object.freeze({
    pipingClass: ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Pipe Class', 'PIPE_CLASS', 'Class', 'CLASS', 'Spec', 'SPEC'],
    convertedBore: ['convertedBore', 'Bore', 'BORE', 'DN', 'NB', 'NPS', 'Size', 'SIZE'],
    componentType: ['componentType', 'Component Type', 'COMPONENT_TYPE', 'Type', 'TYPE', 'DTXR'],
    rating: ['rating', 'Rating', 'RATING', 'Class Rating', 'Pressure Class', 'CLASS_RATING'],
    material: ['material', 'Material', 'MATERIAL', 'Material Name', 'MATERIAL_NAME', 'Description'],
    materialName: ['materialName', 'Material Name', 'MATERIAL_NAME', 'Material_Name', 'Material', 'MATERIAL', 'Description'],
    materialCode: ['materialCode', 'Material Code', 'MATERIAL_CODE', 'MAT_CODE', 'Mat Code', 'MATL', 'CII Code'],
    wallThickness: ['wallThickness', 'Wall Thickness', 'Wall thickness', 'WALL_THICKNESS', 'WALL_THICK', 'Wall Thk', 'WALL THK', 'WT', 'THK', 'Thickness'],
    corrosion: ['corrosion', 'Corrosion', 'CORROSION', 'corrosionAllowance', 'Corrosion Allowance', 'CORR_ALLOW', 'CA', 'Corr'],
  }),
  materialMap: Object.freeze({
    code: ['code', 'Code', 'CA3', 'PCF Code', 'Material Code', 'MATERIAL_CODE', 'MAT_CODE', 'CII Code'],
    material: ['material', 'Material', 'MATERIAL', 'materialName', 'Material Name', 'MATERIAL_NAME', 'Material_Name', 'Description', 'Name'],
    materialCode: ['materialCode', 'Material Code', 'MATERIAL_CODE', 'MAT_CODE', 'CII Code', 'Code', 'CA3'],
    materialName: ['materialName', 'Material Name', 'MATERIAL_NAME', 'Material_Name', 'Material', 'Description', 'Name'],
  }),
  weightMaster: Object.freeze({
    boreMm: ['boreMm', 'Bore', 'BORE', 'DN', 'NB', 'NPS', 'Size', 'SIZE'],
    rating: ['rating', 'Rating', 'RATING', 'Class', 'CLASS', 'Pressure Class', 'CLASS_RATING'],
    lengthMm: ['lengthMm', 'Length', 'LENGTH', 'Length mm', 'LENGTH_MM', 'LENGTH MM', 'Face To Face', 'F2F'],
    weight: ['weight', 'Weight', 'WEIGHT', 'Weight kg', 'WEIGHT_KG', 'WEIGHT KG', 'Wt', 'WT', 'Mass', 'MASS'],
    typeDesc: ['typeDesc', 'Type Desc', 'TYPE_DESC', 'Description', 'Type', 'TYPE', 'Component Type', 'COMPONENT_TYPE'],
    componentType: ['componentType', 'Component Type', 'COMPONENT_TYPE', 'Type', 'TYPE'],
  }),
});

export async function parseSelectedGeometryMasterFile(file, masterKind) {
  if (!file || (typeof file.text !== 'function' && typeof file.arrayBuffer !== 'function')) {
    throw new TypeError(`Master file is not readable for ${text(masterKind) || 'unknown master'}.`);
  }
  if (isWorkbookFileName(file.name)) {
    if (typeof file.arrayBuffer !== 'function') {
      throw new TypeError(`Workbook master file "${text(file.name)}" is not readable as binary data.`);
    }
    const rawBuffer = await file.arrayBuffer();
    const xlsxModule = await getXlsxModule();
    return parseSelectedGeometryMasterWorkbook(rawBuffer, file.name, masterKind, xlsxModule);
  }
  const rawText = await file.text();
  return parseSelectedGeometryMasterText(rawText, file.name, masterKind);
}

export function parseSelectedGeometryMasterWorkbook(rawBuffer, fileName, masterKind, xlsxModule) {
  const name = text(fileName);
  const kind = text(masterKind);
  const XLSX = xlsxModule;
  if (!XLSX?.read || !XLSX?.utils?.sheet_to_json) {
    throw new TypeError(`XLSX parser is not valid for workbook master file "${name}".`);
  }
  let workbook = null;
  try {
    workbook = XLSX.read(rawBuffer, { type: 'array', cellDates: false, raw: false });
  } catch (error) {
    throw new SyntaxError(`Cannot parse workbook master file "${name}": ${error?.message || error}`);
  }
  const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  if (!sheetNames.length) {
    throw new SyntaxError(`Workbook master file "${name}" contains no readable sheets.`);
  }
  const firstSheetName = sheetNames[0];
  const worksheet = workbook.Sheets?.[firstSheetName];
  const rows = normalizeMasterRows(
    XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false }).map((row, index) => normalizeWorkbookRow(row, index)),
    kind,
  );
  return freezeDeep({
    kind,
    fileName: name,
    format: 'workbook',
    version: `${name}#${firstSheetName}`,
    sheetName: firstSheetName,
    sheetNames,
    rows,
  });
}

export function parseSelectedGeometryMasterText(rawText, fileName, masterKind) {
  const name = text(fileName);
  const kind = text(masterKind);
  const body = String(rawText ?? '');
  if (!body.trim()) {
    return freezeDeep({ kind, fileName: name, format: 'empty', version: name, rows: [] });
  }
  if (isJsonFile(name, body)) {
    return parseJsonMaster(body, name, kind);
  }
  if (kind === 'materialMap') {
    const materialRows = normalizeMasterRows(parseMaterialMapTextRows(body), kind);
    if (materialRows.length) {
      return freezeDeep({
        kind,
        fileName: name,
        format: 'material-map-text',
        version: name,
        rows: materialRows,
      });
    }
  }
  const delimiter = detectDelimiter(name, body);
  const rows = normalizeMasterRows(parseDelimitedRows(body, delimiter), kind);
  return freezeDeep({
    kind,
    fileName: name,
    format: delimiter === '\t' ? 'tsv' : 'csv',
    version: name,
    rows,
  });
}

function isWorkbookFileName(fileName) {
  return WORKBOOK_FILE_RE.test(text(fileName));
}

async function getXlsxModule() {
  const host = typeof window === 'undefined' ? globalThis : window;
  if (host?.XLSX) return host.XLSX;
  try {
    return await import('xlsx');
  } catch {}
  try {
    return await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  } catch (error) {
    throw new Error(`XLSX parser is not available for selected-geometry master import: ${error?.message || error}`);
  }
}

function normalizeWorkbookRow(row, index) {
  const source = row && typeof row === 'object' && !Array.isArray(row) ? row : {};
  return { _rowIndex: index + 1, ...source };
}

export function parseDelimitedRows(rawText, delimiter) {
  const records = parseDelimitedRecords(rawText, delimiter);
  const header = records[0] || [];
  const columns = header.map((value, index) => text(value) || `column_${index + 1}`);
  if (!columns.length) return freezeDeep([]);
  const rows = records.slice(1)
    .filter((record) => record.some((value) => text(value)))
    .map((record) => rowFromRecord(columns, record));
  return freezeDeep(rows);
}

function isJsonFile(fileName, rawText) {
  const lowerName = text(fileName).toLowerCase();
  const trimmed = String(rawText ?? '').trim();
  return lowerName.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[');
}

function parseJsonMaster(rawText, fileName, masterKind) {
  let documentValue = null;
  try {
    documentValue = JSON.parse(rawText);
  } catch (error) {
    throw new SyntaxError(`Cannot parse JSON master file "${fileName}": ${error?.message || error}`);
  }
  const rows = normalizeMasterRows(rowsFromJsonDocument(documentValue), masterKind);
  return freezeDeep({
    kind: text(masterKind),
    fileName: text(fileName),
    format: 'json',
    version: text(documentValue?.version || documentValue?.metadata?.version || fileName),
    rows,
  });
}

function parseMaterialMapTextRows(rawText) {
  const rows = [];
  for (const line of String(rawText ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s+(.+?)\s*$/);
    if (!match) continue;
    if (/^code$/i.test(match[1]) || /^material$/i.test(match[1])) continue;
    rows.push({ code: match[1], material: match[2] });
  }
  return rows;
}

function rowsFromJsonDocument(documentValue) {
  if (Array.isArray(documentValue)) return documentValue.map(normalizeJsonRow);
  if (!documentValue || typeof documentValue !== 'object') return [];
  for (const key of ['rows', 'masterRows', 'mapRows', 'data', 'items', 'records']) {
    const value = documentValue[key];
    if (Array.isArray(value)) return value.map(normalizeJsonRow);
  }
  return [normalizeJsonRow(documentValue)];
}

function normalizeJsonRow(row) {
  if (row && typeof row === 'object' && !Array.isArray(row)) return { ...row };
  return { value: row };
}

function normalizeMasterRows(rows, masterKind) {
  return (Array.isArray(rows) ? rows : []).map((row) => normalizeMasterRow(row, masterKind));
}

function normalizeMasterRow(row, masterKind) {
  const source = row && typeof row === 'object' && !Array.isArray(row) ? row : { value: row };
  const normalized = { ...source };
  const raw = source._raw && typeof source._raw === 'object' && !Array.isArray(source._raw) ? source._raw : { ...source };
  delete raw._raw;
  delete raw._bindings;
  normalized._raw = raw;
  normalized._bindings = {};
  const aliases = MASTER_ALIAS_GROUPS[text(masterKind)] || {};
  for (const [target, keys] of Object.entries(aliases)) {
    const match = readAliasValue(source, keys);
    if (!text(match.value)) continue;
    if (!text(normalized[target])) normalized[target] = match.value;
    normalized._bindings[target] = match.key;
  }
  return normalized;
}

function readAliasValue(row, keys) {
  const entries = Object.entries(row || {});
  for (const key of keys || []) {
    if (text(row?.[key])) return { key, value: row[key] };
  }
  const rawEntries = Object.entries(row?._raw || {});
  const searchable = [...entries, ...rawEntries];
  for (const key of keys || []) {
    const normalized = normalizeHeaderKey(key);
    const match = searchable.find(([name, value]) => normalizeHeaderKey(name) === normalized && text(value));
    if (match) return { key: match[0], value: match[1] };
  }
  return { key: '', value: '' };
}

function normalizeHeaderKey(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function detectDelimiter(fileName, rawText) {
  const lowerName = text(fileName).toLowerCase();
  if (lowerName.endsWith('.tsv') || lowerName.endsWith('.tab')) return '\t';
  const firstLine = String(rawText ?? '').split(/\r?\n/, 1)[0] || '';
  const tabs = countChars(firstLine, '\t');
  const commas = countChars(firstLine, ',');
  return tabs > commas ? '\t' : ',';
}

function countChars(value, needle) {
  let count = 0;
  for (const char of String(value ?? '')) {
    if (char === needle) count += 1;
  }
  return count;
}

function parseDelimitedRecords(rawText, delimiter) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  const source = String(rawText ?? '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      record.push(field);
      field = '';
      continue;
    }
    if (!quoted && (char === '\n' || char === '\r')) {
      record.push(field);
      records.push(record);
      field = '';
      record = [];
      if (char === '\r' && next === '\n') index += 1;
      continue;
    }
    field += char;
  }
  if (quoted) throw new SyntaxError('Delimited master file has an unterminated quoted field.');
  record.push(field);
  if (record.some((value) => text(value))) records.push(record);
  return records;
}

function rowFromRecord(columns, record) {
  const row = {};
  for (let index = 0; index < columns.length; index += 1) {
    row[columns[index]] = record[index] === undefined ? '' : record[index];
  }
  return row;
}
