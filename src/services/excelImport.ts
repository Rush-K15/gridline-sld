
import ExcelJS from 'exceljs';

import {
  unzipSync,
  zipSync,
  strFromU8,
  strToU8,
} from 'fflate';

import type {
  EquipmentAsset,
  EquipmentKind,
  EquipmentStatus,
  NetworkModel,
  SwitchPosition,
  Terminal,
  TerminalSide,
} from '../types/network';

import { validateNetwork } from '../utils/networkValidation';



// --------------------------------------------------
// WORKBOOK NORMALIZATION
// --------------------------------------------------

function getRelationshipSourcePart(path: string): string {
  if (path === '_rels/.rels') return '';

  const marker = '/_rels/';
  const index = path.lastIndexOf(marker);

  if (index === -1) return '';

  const folder = path.slice(0, index + 1);

  const filename = path
    .slice(index + marker.length)
    .replace(/\.rels$/, '');

  return folder + filename;
}

function normalizeRelationshipTarget(
  source: string,
  target: string
): string {
  if (!target.startsWith('/')) return target;

  const sourceDirectory = source
    .split('/')
    .filter(Boolean)
    .slice(0, -1);

  const targetParts = target
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);

  let common = 0;

  while (
    common < sourceDirectory.length &&
    common < targetParts.length &&
    sourceDirectory[common] === targetParts[common]
  ) {
    common++;
  }

  return [
    ...Array(sourceDirectory.length - common).fill('..'),
    ...targetParts.slice(common),
  ].join('/');
}

function normalizeExcelXml(buffer: ArrayBuffer): Uint8Array {
  const files = unzipSync(new Uint8Array(buffer));

  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith('.xml') && !path.endsWith('.rels')) {
      continue;
    }

    let xml = strFromU8(content);

    xml = xml.replace(/(<\/?)x:/g, '$1');

    if (path.endsWith('.rels')) {
      const source = getRelationshipSourcePart(path);

      xml = xml.replace(
        /Target="([^"]+)"/g,
        (_match, target: string) =>
          `Target="${normalizeRelationshipTarget(source, target)}"`
      );
    }

    files[path] = strToU8(xml);
  }

  return zipSync(files);
}

// --------------------------------------------------
// WORKBOOK LOADING
// --------------------------------------------------

async function loadWorkbook(file: File): Promise<ExcelJS.Workbook> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Please upload an .xlsx file.');
  }

  const originalBuffer = await file.arrayBuffer();

  const normalizedZip = normalizeExcelXml(originalBuffer);

  const buffer = normalizedZip.buffer.slice(
    normalizedZip.byteOffset,
    normalizedZip.byteOffset + normalizedZip.byteLength
  ) as ArrayBuffer;

  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(buffer);

  return workbook;
}

// --------------------------------------------------
// READ SHEET ROWS
// --------------------------------------------------

type SheetRecord = Record<string, unknown>;

function readSheetRows(
  workbook: ExcelJS.Workbook,
  sheetName: string
): SheetRecord[] {
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

  const records: SheetRecord[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const record: SheetRecord = {};

    headers.forEach((header, column) => {
      if (header) {
        record[header] = row.getCell(column).value;
      }
    });

    if (Object.values(record).some(
      (value) => value !== null && value !== undefined && value !== ''
    )) {
      records.push(record);
    }
  });

  return records;
}

// --------------------------------------------------
// CELL VALUE HELPERS
// --------------------------------------------------

function textValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'object') {
    const item = value as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text?: string }>;
    };

    if (typeof item.text === 'string') return item.text;

    if (item.result !== undefined) {
      return textValue(item.result);
    }

    if (item.richText) {
      return item.richText
        .map((part) => part.text ?? '')
        .join('');
    }
  }

  return String(value).trim();
}

function requiredText(
  row: SheetRecord,
  column: string
): string {
  const value = textValue(row[column]);

  if (!value) {
    throw new Error(`Missing required value: ${column}`);
  }

  return value;
}

function numberValue(
  row: SheetRecord,
  column: string
): number {
  const value = Number(row[column]);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number in column: ${column}`);
  }

  return value;
}

function optionalNumber(
  row: SheetRecord,
  column: string
): number | undefined {
  const raw = row[column];

  if (raw === null || raw === undefined || raw === '') {
    return undefined;
  }

  const value = Number(raw);

  return Number.isFinite(value) ? value : undefined;
}

// --------------------------------------------------
// EQUIPMENT MAPPING
// --------------------------------------------------

const equipmentKindMap: Record<string, EquipmentKind> = {
  GridConnection: 'feeder',
  CircuitBreaker: 'breaker',
  Disconnector: 'disconnector',
  Busbar: 'busbar',
  SuperGridTransformer: 'transformer',
  Transformer: 'transformer',
};

function mapEquipmentKind(type: string): EquipmentKind {
  const kind = equipmentKindMap[type];

  if (!kind) {
    throw new Error(`Unsupported equipment type: ${type}`);
  }

  return kind;
}

function mapServiceStatus(value: string): EquipmentStatus {
  return value.toLowerCase() === 'inservice'
    ? 'IN SERVICE'
    : 'OUT OF SERVICE';
}

function mapSwitchPosition(value: string): SwitchPosition {
  switch (value.toLowerCase()) {
    case 'open':
      return 'OPEN';

    case 'closed':
      return 'CLOSED';

    case 'n/a':
      return 'N/A';

    default:
      return 'UNKNOWN';
  }
}

function mapTerminalSide(value: string): TerminalSide {
  const side = value.toLowerCase();

  if (
    side !== 'left' &&
    side !== 'right' &&
    side !== 'top' &&
    side !== 'bottom'
  ) {
    throw new Error(`Invalid terminal side: ${value}`);
  }

  return side;
}

function mapEquipment(
  row: SheetRecord,
  terminals: Terminal[]
): EquipmentAsset {
  const equipmentType = requiredText(row, 'EquipmentType');

  const serviceStatus = mapServiceStatus(
    requiredText(row, 'ServiceStatus')
  );

  const switchPosition = mapSwitchPosition(
    textValue(row['SwitchPosition'])
  );

  const status: EquipmentStatus =
    switchPosition === 'OPEN'
      ? 'OPEN'
      : serviceStatus;

  const notes = textValue(row['Notes']);

  const voltage = numberValue(row, 'Voltage_kV');

  const voltageMatch = notes.match(
    /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*kV/i
  );

  const ratingMatch = notes.match(
    /(\d+(?:\.\d+)?)\s*MVA/i
  );

  return {
    id: requiredText(row, 'EquipmentID'),
    name: requiredText(row, 'Name'),
    tag: textValue(row['Tag']),
    equipmentType,
    kind: mapEquipmentKind(equipmentType),

    voltageLevel: voltageMatch
      ? `${voltageMatch[1]}/${voltageMatch[2]} kV`
      : `${voltage} kV`,

    status,
    switchPosition,

    ratedCapacity: ratingMatch
      ? `${ratingMatch[1]} MVA`
      : undefined,

    description: notes || equipmentType,

    position: {
      x: numberValue(row, 'X'),
      y: numberValue(row, 'Y'),
    },

    width: optionalNumber(row, 'Width'),
    height: optionalNumber(row, 'Height'),

    terminals,
  };
}

// --------------------------------------------------
// IMPORT EXCEL -> NETWORK MODEL
// --------------------------------------------------

export async function importNetworkFromExcel(
  file: File
): Promise<NetworkModel> {
  const workbook = await loadWorkbook(file);

  const substationRows = readSheetRows(workbook, 'Substations');
  const equipmentRows = readSheetRows(workbook, 'Equipment');
  const terminalRows = readSheetRows(workbook, 'Terminals');
  const cableRows = readSheetRows(workbook, 'Cables');
  const connectionRows = readSheetRows(workbook, 'Connections');

  if (substationRows.length !== 1) {
    throw new Error(
      'The demo importer currently expects exactly one substation.'
    );
  }

  // Build terminal records and lookup index.
  const terminalsByEquipment = new Map<string, Terminal[]>();

  const terminalIndex = new Map<
    string,
    { equipmentId: string; terminal: Terminal }
  >();

  for (const row of terminalRows) {
    const terminalId = requiredText(row, 'TerminalID');
    const equipmentId = requiredText(row, 'EquipmentID');

    if (terminalIndex.has(terminalId)) {
      throw new Error(`Duplicate terminal ID: ${terminalId}`);
    }

    const ratio = numberValue(row, 'OffsetRatio');

    if (ratio < 0 || ratio > 1) {
      throw new Error(
        `Terminal ${terminalId} has an invalid OffsetRatio. Expected 0–1.`
      );
    }

    const handleType = requiredText(row, 'HandleType').toLowerCase();

    if (handleType !== 'source' && handleType !== 'target') {
      throw new Error(
        `Invalid HandleType for terminal ${terminalId}: ${handleType}`
      );
    }

    const terminal: Terminal = {
      id: terminalId,
      name: requiredText(row, 'TerminalName'),
      side: mapTerminalSide(requiredText(row, 'Side')),
      offset: ratio * 100,
      handleType,
    };

    const existing = terminalsByEquipment.get(equipmentId) ?? [];

    existing.push(terminal);

    terminalsByEquipment.set(equipmentId, existing);

    terminalIndex.set(terminalId, {
      equipmentId,
      terminal,
    });
  }

  // Build equipment.
  const equipment = equipmentRows.map((row) => {
    const equipmentId = requiredText(row, 'EquipmentID');

    return mapEquipment(
      row,
      terminalsByEquipment.get(equipmentId) ?? []
    );
  });

  const equipmentIds = new Set(equipment.map((asset) => asset.id));

  // Make sure every terminal references existing equipment.
  for (const terminal of terminalIndex.values()) {
    if (!equipmentIds.has(terminal.equipmentId)) {
      throw new Error(
        `Terminal references unknown equipment: ${terminal.equipmentId}`
      );
    }
  }

  // Build cables.
  const cables = cableRows.map((row) => ({
    id: requiredText(row, 'CableID'),
    name: requiredText(row, 'CircuitName'),
    voltageLevel: `${numberValue(row, 'Voltage_kV')} kV`,
    lengthKm: numberValue(row, 'Length_km'),
    status: mapServiceStatus(requiredText(row, 'Status')),
  }));

  const cableIndex = new Map(
    cables.map((cable) => [cable.id, cable])
  );

  // Build terminal-to-terminal connections.
  const connections = connectionRows.map((row) => {
    const fromTerminalId = requiredText(row, 'FromTerminalID');
    const toTerminalId = requiredText(row, 'ToTerminalID');
    const cableId = requiredText(row, 'CableID');

    const fromTerminal = terminalIndex.get(fromTerminalId);
    const toTerminal = terminalIndex.get(toTerminalId);
    const cable = cableIndex.get(cableId);

    if (!fromTerminal) {
      throw new Error(`Unknown source terminal: ${fromTerminalId}`);
    }

    if (!toTerminal) {
      throw new Error(`Unknown target terminal: ${toTerminalId}`);
    }

    if (!cable) {
      throw new Error(`Unknown cable: ${cableId}`);
    }

    if (fromTerminal.terminal.handleType !== 'source') {
      throw new Error(
        `${fromTerminalId} must have HandleType Source.`
      );
    }

    if (toTerminal.terminal.handleType !== 'target') {
      throw new Error(
        `${toTerminalId} must have HandleType Target.`
      );
    }

    const connectionStatus =
      requiredText(row, 'ConnectionStatus').toLowerCase();

    return {
      id: requiredText(row, 'ConnectionID'),

      from: {
        equipmentId: fromTerminal.equipmentId,
        terminalId: fromTerminalId,
      },

      to: {
        equipmentId: toTerminal.equipmentId,
        terminalId: toTerminalId,
      },

      cableId,
      voltageLevel: cable.voltageLevel,

      status: connectionStatus === 'connected'
        ? 'CONNECTED' as const
        : 'DISCONNECTED' as const,
    };
  });

  // Build substation.
  const substationRow = substationRows[0];

  const voltageLevels = requiredText(
    substationRow,
    'VoltageLevels_kV'
  )
    .split('/')
    .map((voltage) => `${voltage.trim()} kV`);

  const network: NetworkModel = {
    substation: {
      id: requiredText(substationRow, 'SubstationID'),
      name: requiredText(substationRow, 'SubstationName'),
      nominalVoltageLevels: voltageLevels,
    },

    equipment,
    cables,
    connections,
  };

  // Validate complete network before returning it.
  const errors = validateNetwork(network);

  if (errors.length > 0) {
    throw new Error(
      `Network validation failed:\n${errors
        .map((error) => `• ${error}`)
        .join('\n')}`
    );
  }

  return network;
}

// --------------------------------------------------
// WORKBOOK INSPECTION
// --------------------------------------------------

export async function inspectExcelFile(file: File) {
  const workbook = await loadWorkbook(file);

  const sheetNames: string[] = [];

  workbook.eachSheet((worksheet) => {
    if (worksheet?.name) {
      sheetNames.push(worksheet.name);
    }
  });

  return {
    fileName: file.name,
    sheetNames,
  };
}
