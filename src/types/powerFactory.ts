
export type PowerFactoryElementClass =
  | 'ElmSubstat'
  | 'ElmTerm'
  | 'ElmCoup'
  | 'ElmLne'
  | 'ElmTr2'
  | 'ElmTr3'
  | 'ElmLod'
  | 'ElmNec'
  | (string & {});

// A point in the original PowerFactory diagram.
// Coordinates are in millimeters.
export interface PowerFactoryPoint {
  x?: number;
  y?: number;
  pointNumber: number;
}

// Each GCO slot represents a separate graphical object.
export interface PowerFactoryGraphicObject {
  slot: string;
  points: PowerFactoryPoint[];
}

// One row from the Coordinates sheet.
export interface PowerFactoryElement {
  sourceRow: number;

  name: string;
  elementClass: PowerFactoryElementClass;

  siteOrSubstation?: string;
  netDataObjectPath?: string;

  graphicObject?: string;
  symbolName?: string;

  // Original element position.
  x?: number;
  y?: number;

  // Original graphical geometry.
  graphicalObjects: PowerFactoryGraphicObject[];

  notes?: string;
}

// Metadata from the Info sheet.
export interface PowerFactoryExportInfo {
  diagram?: string;
  elementSet?: string;
  project?: string;
  exportedAt?: string;
  powerFactoryVersion?: string;

  elementsInSet?: number;
  elementsExported?: number;
  elementsNotFoundOrWithoutCoordinates?: number;

  units?: string;
  sortOrder?: string;

  exportedClassCounts: Record<string, number>;
}

// Complete two-sheet PowerFactory export.
export interface PowerFactoryWorkbook {
  info: PowerFactoryExportInfo;
  elements: PowerFactoryElement[];
}
