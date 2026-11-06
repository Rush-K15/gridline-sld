
export type EquipmentKind =
  | 'transformer'
  | 'busbar'
  | 'breaker'
  | 'disconnector'
  | 'feeder';

export type EquipmentStatus =
  | 'IN SERVICE'
  | 'OUT OF SERVICE'
  | 'OPEN';

export type SwitchPosition =
  | 'OPEN'
  | 'CLOSED'
  | 'N/A'
  | 'UNKNOWN';

export type TerminalSide =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom';

export type TerminalHandleType = 'source' | 'target';

export interface Terminal {
  id: string;
  name: string;
  side: TerminalSide;
  offset?: number;
  handleType?: TerminalHandleType;
}

export interface EquipmentAsset {
  id: string;
  name: string;
  tag?: string;
  equipmentType?: string;
  kind: EquipmentKind;

  voltageLevel: string;
  status: EquipmentStatus;
  switchPosition?: SwitchPosition;

  ratedCapacity?: string;
  description: string;

  position: {
    x: number;
    y: number;
  };

  width?: number;
  height?: number;

  terminals: Terminal[];
}

export interface CableAsset {
  id: string;
  name: string;
  voltageLevel: string;
  lengthKm: number;
  status: EquipmentStatus;
}

export interface TerminalReference {
  equipmentId: string;
  terminalId: string;
}

export interface NetworkConnection {
  id: string;
  from: TerminalReference;
  to: TerminalReference;
  cableId: string;
  voltageLevel: string;
  label?: string;
  status?: 'CONNECTED' | 'DISCONNECTED';
}

export interface NetworkModel {
  substation: {
    id: string;
    name: string;
    nominalVoltageLevels: string[];
  };

  equipment: EquipmentAsset[];
  cables: CableAsset[];
  connections: NetworkConnection[];
}

export interface EquipmentNodeData {
  [key: string]: unknown;

  label: string;
  assetId: string;
  tag?: string;
  equipmentType?: string;

  kind: EquipmentKind;
  voltage: string;
  status: EquipmentStatus;
  switchPosition?: SwitchPosition;

  rating?: string;
  description: string;
  terminals: Terminal[];
}
