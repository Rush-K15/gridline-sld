
import ExcelJS from 'exceljs';

import {
  unzipSync,
  zipSync,
  strFromU8,
  strToU8,
} from 'fflate';

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
  target: string,
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
          `Target="${normalizeRelationshipTarget(source, target)}"`,
      );
    }

    files[path] = strToU8(xml);
  }

  return zipSync(files);
}

export async function loadWorkbook(
  file: File,
): Promise<ExcelJS.Workbook> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Please upload an .xlsx file.');
  }

  const originalBuffer = await file.arrayBuffer();

  const normalizedZip = normalizeExcelXml(originalBuffer);

  const buffer = normalizedZip.buffer.slice(
    normalizedZip.byteOffset,
    normalizedZip.byteOffset + normalizedZip.byteLength,
  ) as ArrayBuffer;

  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(buffer);

  return workbook;
}
