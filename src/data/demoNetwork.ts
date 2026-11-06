
import type { NetworkModel } from '../types/network';

export const demoNetwork: NetworkModel = {
  substation: {
    id: 'SUB-001',
    name: 'Gridline Demo Substation',
    nominalVoltageLevels: ['132 kV', '33 kV'],
  },

  equipment: [
    {
      id: 'GRID-INC-01',
      name: 'Grid Incomer',
      kind: 'feeder',
      voltageLevel: '132 kV',
      status: 'IN SERVICE',
      description: '132 kV incoming grid circuit.',
      position: { x: 50, y: 180 },
      terminals: [
        { id: 'right', name: 'Outgoing', side: 'right' },
      ],
    },
    {
      id: 'BB-132-01',
      name: '132 kV Main Busbar',
      kind: 'busbar',
      voltageLevel: '132 kV',
      status: 'IN SERVICE',
      description: 'Main 132 kV busbar section.',
      position: { x: 300, y: 180 },
      terminals: [
        { id: 'left', name: 'Incomer', side: 'left' },
        { id: 'right', name: 'SGT Connection', side: 'right' },
      ],
    },
    {
      id: 'CB-101',
      name: 'SGT Incomer Circuit Breaker',
      kind: 'breaker',
      voltageLevel: '132 kV',
      status: 'IN SERVICE',
      description: '132 kV circuit breaker protecting the SGT incomer.',
      position: { x: 580, y: 180 },
      terminals: [
        { id: 'left', name: 'Incoming', side: 'left' },
        { id: 'right', name: 'Outgoing', side: 'right' },
      ],
    },
    {
      id: 'SGT-01',
      name: 'Supergrid Transformer 1',
      kind: 'transformer',
      voltageLevel: '132 / 33 kV',
      status: 'IN SERVICE',
      ratedCapacity: '90 MVA',
      description: '132/33 kV Supergrid Transformer.',
      position: { x: 840, y: 180 },
      terminals: [
        { id: 'left', name: 'HV Terminal', side: 'left' },
        { id: 'right', name: 'LV Terminal', side: 'right' },
      ],
    },
    {
      id: 'BB-33-01',
      name: '33 kV Main Busbar',
      kind: 'busbar',
      voltageLevel: '33 kV',
      status: 'IN SERVICE',
      description: 'Main 33 kV busbar section.',
      position: { x: 1140, y: 180 },
      terminals: [
        { id: 'left', name: 'SGT Connection', side: 'left' },
        { id: 'right', name: 'Feeder Connection', side: 'right' },
      ],
    },
    {
      id: 'CB-301',
      name: 'Outgoing Feeder Circuit Breaker',
      kind: 'breaker',
      voltageLevel: '33 kV',
      status: 'OPEN',
      description: '33 kV outgoing feeder circuit breaker.',
      position: { x: 1430, y: 180 },
      terminals: [
        { id: 'left', name: 'Incoming', side: 'left' },
        { id: 'right', name: 'Outgoing', side: 'right' },
      ],
    },
    {
      id: 'FD-33-01',
      name: 'Outgoing Feeder 1',
      kind: 'feeder',
      voltageLevel: '33 kV',
      status: 'IN SERVICE',
      description: '33 kV distribution outgoing circuit.',
      position: { x: 1700, y: 180 },
      terminals: [
        { id: 'left', name: 'Incoming', side: 'left' },
      ],
    },
  ],

  cables: [
    {
      id: 'CAB-132-01',
      name: '132 kV Grid Connection',
      voltageLevel: '132 kV',
      lengthKm: 0.15,
      status: 'IN SERVICE',
    },
    {
      id: 'CAB-132-02',
      name: '132 kV Busbar Link',
      voltageLevel: '132 kV',
      lengthKm: 0.05,
      status: 'IN SERVICE',
    },
    {
      id: 'CAB-132-03',
      name: '132 kV SGT Connection',
      voltageLevel: '132 kV',
      lengthKm: 0.08,
      status: 'IN SERVICE',
    },
    {
      id: 'CAB-33-01',
      name: '33 kV SGT Connection',
      voltageLevel: '33 kV',
      lengthKm: 0.06,
      status: 'IN SERVICE',
    },
    {
      id: 'CAB-33-02',
      name: '33 kV Busbar Link',
      voltageLevel: '33 kV',
      lengthKm: 0.04,
      status: 'IN SERVICE',
    },
    {
      id: 'CAB-33-03',
      name: '33 kV Outgoing Circuit',
      voltageLevel: '33 kV',
      lengthKm: 2.4,
      status: 'IN SERVICE',
    },
  ],

  connections: [
    {
      id: 'CON-001',
      from: {
        equipmentId: 'GRID-INC-01',
        terminalId: 'right',
      },
      to: {
        equipmentId: 'BB-132-01',
        terminalId: 'left',
      },
      cableId: 'CAB-132-01',
      voltageLevel: '132 kV',
      label: '132 kV',
    },
    {
      id: 'CON-002',
      from: {
        equipmentId: 'BB-132-01',
        terminalId: 'right',
      },
      to: {
        equipmentId: 'CB-101',
        terminalId: 'left',
      },
      cableId: 'CAB-132-02',
      voltageLevel: '132 kV',
    },
    {
      id: 'CON-003',
      from: {
        equipmentId: 'CB-101',
        terminalId: 'right',
      },
      to: {
        equipmentId: 'SGT-01',
        terminalId: 'left',
      },
      cableId: 'CAB-132-03',
      voltageLevel: '132 kV',
    },
    {
      id: 'CON-004',
      from: {
        equipmentId: 'SGT-01',
        terminalId: 'right',
      },
      to: {
        equipmentId: 'BB-33-01',
        terminalId: 'left',
      },
      cableId: 'CAB-33-01',
      voltageLevel: '33 kV',
      label: '33 kV',
    },
    {
      id: 'CON-005',
      from: {
        equipmentId: 'BB-33-01',
        terminalId: 'right',
      },
      to: {
        equipmentId: 'CB-301',
        terminalId: 'left',
      },
      cableId: 'CAB-33-02',
      voltageLevel: '33 kV',
    },
    {
      id: 'CON-006',
      from: {
        equipmentId: 'CB-301',
        terminalId: 'right',
      },
      to: {
        equipmentId: 'FD-33-01',
        terminalId: 'left',
      },
      cableId: 'CAB-33-03',
      voltageLevel: '33 kV',
    },
  ],
};
