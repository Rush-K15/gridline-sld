import ELK from "elkjs/lib/elk.bundled.js";

import type { ElkNode, ElkPort, ElkEdgeSection } from "elkjs";

import type { NetworkModel, TerminalSide } from "../types/network";

// --------------------------------------------------
// ELK INSTANCE
// --------------------------------------------------

const elk = new ELK();

// --------------------------------------------------
// TYPES
// --------------------------------------------------

export interface LayoutedTerminal {
  id: string;
  side: TerminalSide;
  offset: number;
}

export interface LayoutedNode {
  id: string;

  position: {
    x: number;
    y: number;
  };

  width: number;
  height: number;

  terminals: LayoutedTerminal[];
}

export interface LayoutedConnection {
  id: string;
  sections: ElkEdgeSection[];
}

export interface NetworkLayout {
  nodes: LayoutedNode[];
  connections: LayoutedConnection[];

  width: number;
  height: number;
}

// --------------------------------------------------
// TERMINAL HELPERS
// --------------------------------------------------

function getPortId(equipmentId: string, terminalId: string): string {
  return `${encodeURIComponent(equipmentId)}__${encodeURIComponent(terminalId)}`;
}

// This mapping matches the top-to-bottom orientation
// we introduced earlier in Gridline.

function toElkSide(side: TerminalSide): string {
  const mapping: Record<TerminalSide, string> = {
    left: "WEST",
    right: "EAST",
    top: "NORTH",
    bottom: "SOUTH",
  };

  return mapping[side];
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}

// --------------------------------------------------
// NODE DIMENSIONS
// --------------------------------------------------

function getNodeDimensions(asset: NetworkModel["equipment"][number]) {
  // Compact footprint for circuit breakers.
  if (
    asset.kind === "breaker" ||
    (asset.kind === "disconnector" &&
      asset.terminals.some((t) => t.side === "left") &&
      asset.terminals.some((t) => t.side === "right"))
  ) {
    return {
      width: 100,
      height: 100,
    };
  }

  const isBusbar = asset.kind === 'busbar';

const currentBusbarWidth = Math.max(
  asset.width ?? 720,
  300
);

return {
  width: isBusbar
    ? Math.round(currentBusbarWidth * 0.3)
    : Math.max(asset.width ?? 190, 180),

  height: Math.max(
    asset.height ?? (isBusbar ? 16 : 96),
    isBusbar ? 12 : 80
  ),
};
}

// --------------------------------------------------
// CREATE ELK PORTS
// --------------------------------------------------

function createPorts(asset: NetworkModel["equipment"][number]): ElkPort[] {
  return asset.terminals.map((terminal) => {
    const diagramSide = terminal.side;

    return {
      id: getPortId(asset.id, terminal.id),

      width: 8,
      height: 8,

      layoutOptions: {
        "elk.port.side": toElkSide(diagramSide),
      },
    };
  });
}

// --------------------------------------------------
// NETWORK -> ELK GRAPH
// --------------------------------------------------

function createElkGraph(network: NetworkModel): ElkNode {
  const children: ElkNode[] = network.equipment.map((asset) => {
    const dimensions = getNodeDimensions(asset);

    return {
      id: asset.id,

      width: dimensions.width,
      height: dimensions.height,

      ports: createPorts(asset),

      layoutOptions: {
        "elk.portConstraints": "FIXED_ORDER",
      },
    };
  });

  const edges = network.connections.map((connection) => ({
    id: connection.id,

    sources: [
      getPortId(connection.from.equipmentId, connection.from.terminalId),
    ],

    targets: [getPortId(connection.to.equipmentId, connection.to.terminalId)],
  }));

  return {
    id: "gridline-root",

    layoutOptions: {
      "elk.algorithm": "layered",

      // Top-to-bottom network arrangement.
      "elk.direction": "DOWN",

      // Orthogonal electrical conductors.
      "elk.edgeRouting": "ORTHOGONAL",

      // General spacing.
      "elk.spacing.nodeNode": "90",
      "elk.spacing.edgeNode": "45",

      // Vertical layer spacing.
      "elk.layered.spacing.nodeNodeBetweenLayers": "130",
      "elk.layered.spacing.edgeNodeBetweenLayers": "60",

      // Crossing minimization.
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",

      // Balanced node positioning.
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",

      // Maintain terminal ordering.
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.considerModelOrder.portModelOrder": "true",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",

      // Layout margins.
      "elk.padding": "[top=50,left=70,bottom=50,right=70]",
    },

    children,
    edges,
  };
}

// --------------------------------------------------
// EXTRACT ELK PORT POSITIONS
// --------------------------------------------------

function extractTerminalLayouts(
  asset: NetworkModel["equipment"][number],
  layoutNode: ElkNode,
): LayoutedTerminal[] {
  const dimensions = {
    width: layoutNode.width ?? getNodeDimensions(asset).width,
    height: layoutNode.height ?? getNodeDimensions(asset).height,
  };

  const portMap = new Map(
    (layoutNode.ports ?? []).map((port) => [port.id, port]),
  );

  return asset.terminals.map((terminal) => {
    const port = portMap.get(getPortId(asset.id, terminal.id));

    if (!port) {
      return {
        id: terminal.id,
        side: terminal.side,
        offset: clampPercentage(terminal.offset ?? 50),
      };
    }

    const side = terminal.side;

    const offset =
      side === "left" || side === "right"
        ? (((port.y ?? 0) + (port.height ?? 8) / 2) / dimensions.height) * 100
        : (((port.x ?? 0) + (port.width ?? 8) / 2) / dimensions.width) * 100;

    return {
      id: terminal.id,
      side,
      offset: clampPercentage(offset),
    };
  });
}

// --------------------------------------------------
// MAIN LAYOUT FUNCTION
// --------------------------------------------------

export async function layoutNetwork(
  network: NetworkModel,
): Promise<NetworkLayout> {
  if (network.equipment.length === 0) {
    throw new Error("Cannot layout an empty network.");
  }

  const graph = createElkGraph(network);

  try {
    const result = await elk.layout(graph);

    const layoutedNodes: LayoutedNode[] = (result.children ?? []).map(
      (node) => {
        const originalAsset = network.equipment.find(
          (asset) => asset.id === node.id,
        );

        if (!originalAsset) {
          throw new Error(`ELK returned an unknown node: ${node.id}`);
        }

        return {
          id: node.id,

          position: {
            x: node.x ?? 0,
            y: node.y ?? 0,
          },

          width: node.width ?? 0,
          height: node.height ?? 0,

          terminals: extractTerminalLayouts(originalAsset, node),
        };
      },
    );

    const layoutedConnections: LayoutedConnection[] = (result.edges ?? []).map(
      (edge) => ({
        id: edge.id,
        sections: edge.sections ?? [],
      }),
    );

    // Make sure ELK returned every expected element.
    if (layoutedNodes.length !== network.equipment.length) {
      throw new Error(
        "ELK layout returned an incomplete set of equipment nodes.",
      );
    }

    if (layoutedConnections.length !== network.connections.length) {
      throw new Error("ELK layout returned an incomplete set of connections.");
    }

    return {
      nodes: layoutedNodes,
      connections: layoutedConnections,

      width: result.width ?? 0,
      height: result.height ?? 0,
    };
  } catch (error) {
    console.error("Gridline ELK layout failed:", error);

    throw new Error(
      error instanceof Error
        ? `Unable to generate network layout: ${error.message}`
        : "Unable to generate network layout.",
    );
  }
}
