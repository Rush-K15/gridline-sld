
import type ExcelJS from 'exceljs';

import { loadWorkbook } from './excelWorkbook';

import type {
  PowerFactoryElement,
  PowerFactoryExportInfo,
  PowerFactoryGraphicObject,
  PowerFactoryPoint,
  PowerFactoryWorkbook,
} from '../types/powerFactory';

// --------------------------------------------------
// SHEET READING
// --------------------------------------------------

type SheetRecord = Record<string, unknown>;

interface ParsedRow {
  rowNumber: number;
  values: SheetRecord;
}

function readSheetRows(
  workbook: ExcelJS.Workbook,
  sheetName: string,
): ParsedRow[] {
  const sheet = workbook.getWorksheet(sheetName);

  if (!sheet) {
    throw new Error(`Missing worksheet: ${sheetName}`);
  }

  const headers = new Map<number, string>();

  sheet.getRow(1).eachCell((cell, column) => {
    headers.set(column, cell.text.trim());
  });

  if (headers.size === 0) {
    throw new Error(`Worksheet ${sheetName} has no headers.`);
  }

  const records: ParsedRow[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const values: SheetRecord = {};

    headers.forEach((header, column) => {
      if (header) {
        values[header] = row.getCell(column).value;
      }
    });

    const hasData = Object.values(values).some(
      value => value !== null && value !== undefined && value !== '',
    );

    if (hasData) {
      records.push({ rowNumber, values });
    }
  });

  return records;
}

// --------------------------------------------------
// CELL VALUE HELPERS
// --------------------------------------------------

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const item = value as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text?: string }>;
    };

    if (typeof item.text === 'string') {
      return item.text.trim();
    }

    if (item.result !== undefined) {
      return cellText(item.result);
    }

    if (item.richText) {
      return item.richText
        .map(part => part.text ?? '')
        .join('')
        .trim();
    }
  }

  return String(value).trim();
}

function requiredText(
  row: SheetRecord,
  column: string,
  rowNumber: number,
): string {
  const value = cellText(row[column]);

  if (!value) {
    throw new Error(
      `Missing "${column}" in Coordinates row ${rowNumber}.`,
    );
  }

  return value;
}

function optionalText(
  row: SheetRecord,
  column: string,
): string | undefined {
  const value = cellText(row[column]);

  return value || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const text = cellText(value);

  if (!text) return undefined;

  const number = Number(text);

  return Number.isFinite(number) ? number : undefined;
}

// --------------------------------------------------
// GRAPHICAL COORDINATE EXTRACTION
// --------------------------------------------------

function extractGraphicalObjects(
  row: SheetRecord,
): PowerFactoryGraphicObject[] {
  const groups = new Map<
    string,
    Map<number, { x?: number; y?: number }>
  >();

  for (const [header, rawValue] of Object.entries(row)) {
    // Matches headers such as:
    // GCO_1 P1 X
    // GCO_1(1) P2 Y
    // GCO_2 P4 X

    const match = header.match(
      /^(GCO_.+?)\s+P(\d+)\s+([XY])$/i,
    );

    if (!match) continue;

    const [, slot, pointNumberText, axis] = match;

    const pointNumber = Number(pointNumberText);
    const coordinate = optionalNumber(rawValue);

    // Preserve missing coordinates as missing.
    if (coordinate === undefined) continue;

    if (!groups.has(slot)) {
      groups.set(slot, new Map());
    }

    const points = groups.get(slot)!;

    if (!points.has(pointNumber)) {
      points.set(pointNumber, { });
    }

    const point = points.get(pointNumber)!;

    if (axis.toUpperCase() === 'X') {
      point.x = coordinate;
    } else {
      point.y = coordinate;
    }
  }

  const graphicalObjects: PowerFactoryGraphicObject[] = [];

  for (const [slot, points] of groups) {
    const extractedPoints: PowerFactoryPoint[] = [];

    for (const [pointNumber, coordinates] of points) {
      extractedPoints.push({
        pointNumber,
        x: coordinates.x,
        y: coordinates.y,
      });
    }

    extractedPoints.sort(
      (a, b) => a.pointNumber - b.pointNumber,
    );

    if (extractedPoints.length > 0) {
      graphicalObjects.push({
        slot,
        points: extractedPoints,
      });
    }
  }

  return graphicalObjects;
}

// --------------------------------------------------
// COORDINATES SHEET MAPPING
// --------------------------------------------------

function parseElements(
  workbook: ExcelJS.Workbook,
): PowerFactoryElement[] {
  const rows = readSheetRows(workbook, 'Coordinates');

  return rows.map(({ rowNumber, values }) => ({
    sourceRow: rowNumber,

    name: requiredText(values, 'Element name', rowNumber),

    elementClass: requiredText(
      values,
      'Element class',
      rowNumber,
    ) as PowerFactoryElement['elementClass'],

    siteOrSubstation: optionalText(
      values,
      'Site / Substation',
    ),

    netDataObjectPath: optionalText(
      values,
      'Net Data Object path',
    ),

    graphicObject: optionalText(
      values,
      'Graphic object',
    ),

    symbolName: optionalText(
      values,
      'Symbol name',
    ),

    x: optionalNumber(values['X [mm]']),
    y: optionalNumber(values['Y [mm]']),

    graphicalObjects: extractGraphicalObjects(values),

    notes: optionalText(values, 'Notes'),
  }));
}

// --------------------------------------------------
// INFO SHEET MAPPING
// --------------------------------------------------

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseInteger(value: unknown): number | undefined {
  const text = cellText(value);

  if (!text) return undefined;

  const number = Number(text);

  return Number.isInteger(number) && number >= 0
    ? number
    : undefined;
}

function parseInfo(
  workbook: ExcelJS.Workbook,
): PowerFactoryExportInfo {
  const rows = readSheetRows(workbook, 'Info');

  const metadata = new Map<string, unknown>();

  for (const { values } of rows) {
    const key = optionalText(values, 'Item');
    const value = values['Value'];

    if (!key) continue;

    metadata.set(normalizeKey(key), value);
  }

  const getText = (key: string) => {
    const value = metadata.get(normalizeKey(key));

    return value === undefined
      ? undefined
      : optionalText({ value }, 'value');
  };

  const getNumber = (key: string) =>
    parseInteger(metadata.get(normalizeKey(key)));

  const exportedClassCounts: Record<string, number> = {};

  for (const [key, value] of metadata) {
    const match = key.match(/^exported (elm[a-z0-9]+)$/);

    if (!match) continue;

    const count = parseInteger(value);

    if (count !== undefined) {
      exportedClassCounts[match[1]] = count;
    }
  }

  return {
    diagram: getText('Diagram'),
    elementSet: getText('Element set'),
    project: getText('Project'),
    exportedAt: getText('Exported'),

    powerFactoryVersion: getText(
      'PowerFactory version',
    ),

    elementsInSet: getNumber('Elements in set'),

    elementsExported: getNumber(
      'Elements exported',
    ),

    elementsNotFoundOrWithoutCoordinates: getNumber(
      'Elements not found / without coordinates',
    ),

    units: getText('Units'),
    sortOrder: getText('Sort order'),

    exportedClassCounts,
  };
}

// --------------------------------------------------
// MAIN POWERFACTORY IMPORT
// --------------------------------------------------

export async function importPowerFactoryWorkbook(
  file: File,
): Promise<PowerFactoryWorkbook> {
  const workbook = await loadWorkbook(file);

  const expectedSheets = ['Coordinates', 'Info'];

  for (const sheetName of expectedSheets) {
    if (!workbook.getWorksheet(sheetName)) {
      throw new Error(
        `Invalid PowerFactory workbook. Missing sheet: ${sheetName}`,
      );
    }
  }

  const info = parseInfo(workbook);
  const elements = parseElements(workbook);

  if (elements.length === 0) {
    throw new Error(
      'The Coordinates sheet contains no element records.',
    );
  }

  // Compare the actual records with the export metadata.
  if (
    info.elementsExported !== undefined &&
    info.elementsExported !== elements.length
  ) {
    throw new Error(
      `Export count mismatch: Info reports ${info.elementsExported} elements, but Coordinates contains ${elements.length}.`,
    );
  }

  return {
    info,
    elements,
  };
}
