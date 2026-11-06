import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";

import {
  Activity,
  Cable,
  Database,
  Layers,
  Search,
  Settings,
  Upload,
  Zap,
} from "lucide-react";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./App.css";

import EquipmentSymbol from "./components/sld/EquipmentSymbol";
import RoutedEdge, { type RoutedEdgeType } from "./components/sld/RoutedEdge";

import { demoNetwork } from "./data/demoNetwork";
import { importNetworkFromExcel } from "./services/excelImport";
import { layoutNetwork, type NetworkLayout } from "./services/layoutEngine";
import { validateNetwork } from "./utils/networkValidation";

import type {
  EquipmentNodeData,
  NetworkModel,
  TerminalSide,
  TerminalHandleType,
} from "./types/network";

// ==================================================
// TYPES
// ==================================================

type EquipmentNodeType = Node<EquipmentNodeData, "equipment">;

type NetworkSource = "DEMO" | "EXCEL";

type LayoutedTerminal = NetworkLayout["nodes"][number]["terminals"][number];

// ==================================================
// NETWORK DATA MAPPING
// ==================================================

function toEquipmentNodeData(
  asset: NetworkModel["equipment"][number],
  layoutedTerminals?: LayoutedTerminal[],
): EquipmentNodeData {
  const terminalMap = new Map(
    (layoutedTerminals ?? []).map((terminal) => [terminal.id, terminal]),
  );

  return {
    label: asset.name,
    assetId: asset.id,
    tag: asset.tag,
    equipmentType: asset.equipmentType,
    kind: asset.kind,
    voltage: asset.voltageLevel,
    status: asset.status,
    switchPosition: asset.switchPosition,
    rating: asset.ratedCapacity,
    description: asset.description,

    // Use terminal positions calculated by ELK.
    terminals: asset.terminals.map((terminal) => {
      const positionedTerminal = terminalMap.get(terminal.id);

      if (!positionedTerminal) {
        return terminal;
      }

      return {
        ...terminal,
        side: positionedTerminal.side,
        offset: positionedTerminal.offset,
      };
    }),
  };
}

// ==================================================
// TERMINAL HELPERS
// ==================================================

const terminalPositions: Record<TerminalSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

function getTerminalStyle(side: TerminalSide, offset: number): CSSProperties {
  return side === "left" || side === "right"
    ? { top: `${offset}%` }
    : { left: `${offset}%` };
}

// ==================================================
// CUSTOM ELECTRICAL EQUIPMENT NODE
// ==================================================

function EquipmentNode({ data }: NodeProps<EquipmentNodeType>) {
  const terminalHandles = data.terminals.flatMap((terminal) => {
    // ELK has already calculated the terminal orientation.
    // Do not rotate the side again here.
    const position = terminalPositions[terminal.side];

    const offset = Math.min(100, Math.max(0, terminal.offset ?? 50));

    const handleTypes: TerminalHandleType[] = terminal.handleType
      ? [terminal.handleType]
      : ["target", "source"];

    return handleTypes.map((handleType) => (
      <Handle
        key={`${terminal.id}-${handleType}`}
        type={handleType}
        position={position}
        id={`${terminal.id}-${handleType}`}
        style={getTerminalStyle(terminal.side, offset)}
        isConnectable={false}
      />
    ));
  });

  const isBusbar = data.kind === "busbar";

  const equipmentLabel = data.tag || data.assetId;

  const equipmentRating = data.rating
    ? `${data.rating} · ${data.voltage}`
    : data.voltage;

  const isHorizontalSwitch =
    (data.kind === "breaker" || data.kind === "disconnector") &&
    data.terminals.some((t) => t.side === "left") &&
    data.terminals.some((t) => t.side === "right");

  return (
    <div className={`sld-equipment-node sld-equipment-node--${data.kind}`}>
      {terminalHandles}

      <div className="sld-symbol-art">
        <EquipmentSymbol
          kind={data.kind}
          status={data.status}
          switchPosition={data.switchPosition}
          orientation={isHorizontalSwitch ? "horizontal" : "vertical"}
        />
      </div>

      <div
        className={`sld-equipment-label ${
          isBusbar ? "sld-equipment-label--busbar" : ""
        }`}
      >
        <strong>{equipmentLabel}</strong>
        <span>{equipmentRating}</span>
      </div>
    </div>
  );
}

// Keep component registries outside App.
const nodeTypes = {
  equipment: EquipmentNode,
};

const edgeTypes = {
  elk: RoutedEdge,
};

// ==================================================
// CABLE HELPERS
// ==================================================

function formatCableLength(lengthKm: number): string {
  return lengthKm < 1
    ? `${Math.round(lengthKm * 1000)} m`
    : `${lengthKm.toFixed(2)} km`;
}

function getAssetDisplayName(
  asset: NetworkModel["equipment"][number] | undefined,
  fallback: string,
): string {
  return asset ? `${asset.tag || asset.name} (${asset.id})` : fallback;
}

// ==================================================
// MAIN APPLICATION
// ==================================================

function App() {
  // ------------------------------------------------
  // NETWORK STATE
  // ------------------------------------------------

  const [network, setNetwork] = useState<NetworkModel>(demoNetwork);

  const [networkSource, setNetworkSource] = useState<NetworkSource>("DEMO");

  // ELK layout result.
  const [layout, setLayout] = useState<NetworkLayout | null>(null);

  const [isLayouting, setIsLayouting] = useState(true);

  const [layoutError, setLayoutError] = useState<string | null>(null);

  // Remount React Flow when a new layout is committed.
  const [layoutRevision, setLayoutRevision] = useState(0);

  // ------------------------------------------------
  // SELECTION STATE
  // ------------------------------------------------

  const [selected, setSelected] = useState<EquipmentNodeData | null>(() => {
    const initialAsset =
      demoNetwork.equipment.find((asset) => asset.id === "SGT-01") ??
      demoNetwork.equipment[0];

    return initialAsset ? toEquipmentNodeData(initialAsset) : null;
  });

  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);

  // ------------------------------------------------
  // EXCEL IMPORT STATE
  // ------------------------------------------------

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isImporting, setIsImporting] = useState(false);

  const [importMessage, setImportMessage] = useState("");

  const [importError, setImportError] = useState(false);

  // ------------------------------------------------
  // INITIAL DEMO NETWORK LAYOUT
  // ------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function calculateInitialLayout() {
      try {
        const result = await layoutNetwork(demoNetwork);

        if (!cancelled) {
          setLayout(result);
          setLayoutError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLayoutError(
            error instanceof Error
              ? error.message
              : "Unable to calculate initial network layout.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLayouting(false);
        }
      }
    }

    void calculateInitialLayout();

    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------
  // EXCEL IMPORT HANDLER
  // ------------------------------------------------

  async function handleExcelImport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    setIsImporting(true);

    setImportMessage("Reading and validating workbook...");

    setImportError(false);

    try {
      // STEP 1: Parse and validate Excel.
      const importedNetwork = await importNetworkFromExcel(file);

      setImportMessage("Workbook validated. Calculating electrical layout...");

      // STEP 2: Calculate layout using ELK.
      const importedLayout = await layoutNetwork(importedNetwork);

      // STEP 3: Commit network and layout together.
      // The previous diagram remains intact if either
      // parsing or layout generation fails.
      setNetwork(importedNetwork);

      setLayout(importedLayout);

      setNetworkSource("EXCEL");

      setLayoutError(null);

      // Clear the previous selection.
      setSelectedConnectionId(null);

      // Select the first transformer.
      const firstAsset =
        importedNetwork.equipment.find(
          (asset) => asset.kind === "transformer",
        ) ?? importedNetwork.equipment[0];

      setSelected(
        firstAsset
          ? toEquipmentNodeData(
              firstAsset,
              importedLayout.nodes.find((node) => node.id === firstAsset.id)
                ?.terminals,
            )
          : null,
      );

      // Refit the new diagram.
      setLayoutRevision((revision) => revision + 1);

      setImportMessage(
        `Successfully loaded ${importedNetwork.equipment.length} equipment assets, ` +
          `${importedNetwork.connections.length} connections and ` +
          `${importedNetwork.cables.length} cables.`,
      );

      console.log("Imported Network Model:", importedNetwork);

      console.log("ELK Layout:", importedLayout);

      console.table(
        importedLayout.nodes.map((node) => ({
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          width: node.width,
          height: node.height,
        })),
      );
    } catch (error) {
      setImportError(true);

      const message =
        error instanceof Error
          ? error.message
          : "Unable to import workbook or calculate layout.";

      setImportMessage(message);

      console.error("Gridline import/layout failed:", error);
    } finally {
      setIsImporting(false);
      input.value = "";
    }
  }

  // ------------------------------------------------
  // NETWORK VALIDATION
  // ------------------------------------------------

  const networkErrors = useMemo(() => validateNetwork(network), [network]);

  const isNetworkValid = networkErrors.length === 0;

  // ------------------------------------------------
  // NETWORK -> REACT FLOW NODES
  // ------------------------------------------------

  const networkNodes = useMemo<EquipmentNodeType[]>(() => {
    if (!layout) return [];

    const layoutNodeMap = new Map(layout.nodes.map((node) => [node.id, node]));

    return network.equipment.flatMap((asset) => {
      const layoutNode = layoutNodeMap.get(asset.id);

      if (!layoutNode) return [];

      return [
        {
          id: asset.id,

          type: "equipment" as const,

          // Use ELK's calculated coordinates.
          position: {
            x: layoutNode.position.x,
            y: layoutNode.position.y,
          },

          // Use the dimensions calculated by ELK.
          style: {
            width: layoutNode.width,
            height: layoutNode.height,
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
            overflow: "visible",
          },

          // Use ELK's calculated terminal positions.
          data: toEquipmentNodeData(asset, layoutNode.terminals),
        },
      ];
    });
  }, [network, layout]);

  // ------------------------------------------------
  // NETWORK -> REACT FLOW EDGES
  // ------------------------------------------------

  const networkEdges = useMemo<RoutedEdgeType[]>(() => {
    if (!layout) return [];

    const cableMap = new Map(network.cables.map((cable) => [cable.id, cable]));

    const routeMap = new Map(
      layout.connections.map((connection) => [connection.id, connection]),
    );

    return network.connections.map((connection) => {
      const cable = cableMap.get(connection.cableId);

      const route = routeMap.get(connection.id);

      const isSelected = selectedConnectionId === connection.id;

      const isDisconnected =
        connection.status === "DISCONNECTED" ||
        cable?.status === "OUT OF SERVICE";

      return {
        id: connection.id,

        type: "elk",

        source: connection.from.equipmentId,

        target: connection.to.equipmentId,

        sourceHandle: `${connection.from.terminalId}-source`,

        targetHandle: `${connection.to.terminalId}-target`,

        selectable: true,

        // Use the actual ELK-generated cable route.
        style: {
          stroke: isSelected
            ? "#ffffff"
            : connection.voltageLevel.includes("132")
              ? "#e3ad68"
              : "#5bc5d8",

          strokeWidth: isSelected ? 3.5 : 2,

          strokeDasharray: isDisconnected ? "6 4" : undefined,
        },

        // RoutedEdge uses these sections to generate
        // the SVG conductor path.
        data: {
          sections: route?.sections ?? [],

          cableId: connection.cableId,

          cableName: cable?.name,

          lengthKm: cable?.lengthKm,
        },
      };
    });
  }, [network, layout, selectedConnectionId]);

  // ------------------------------------------------
  // DASHBOARD COUNTS
  // ------------------------------------------------

  const equipmentCount = network.equipment.length;

  const transformerCount = network.equipment.filter(
    (asset) => asset.kind === "transformer",
  ).length;

  const switchingDeviceCount = network.equipment.filter(
    (asset) => asset.kind === "breaker" || asset.kind === "disconnector",
  ).length;

  const connectionCount = network.connections.length;

  const voltage132Count = network.equipment.filter((asset) =>
    asset.voltageLevel.includes("132"),
  ).length;

  const voltage33Count = network.equipment.filter((asset) =>
    asset.voltageLevel.includes("33"),
  ).length;

  // ------------------------------------------------
  // SELECTED EQUIPMENT CONNECTIONS
  // ------------------------------------------------

  const selectedConnections = selected
    ? network.connections.filter(
        (connection) =>
          connection.from.equipmentId === selected.assetId ||
          connection.to.equipmentId === selected.assetId,
      )
    : [];

  // ------------------------------------------------
  // SELECTED CABLE DETAILS
  // ------------------------------------------------

  const selectedConnection = network.connections.find(
    (connection) => connection.id === selectedConnectionId,
  );

  const selectedCable = selectedConnection
    ? network.cables.find((cable) => cable.id === selectedConnection.cableId)
    : undefined;

  const cableFrom = selectedConnection
    ? network.equipment.find(
        (asset) => asset.id === selectedConnection.from.equipmentId,
      )
    : undefined;

  const cableTo = selectedConnection
    ? network.equipment.find(
        (asset) => asset.id === selectedConnection.to.equipmentId,
      )
    : undefined;

  useEffect(() => {
    if (!layout) return;

    console.table(
      network.equipment
        .filter((asset) =>
          ["busbar", "breaker", "transformer", "disconnector"].includes(
            asset.kind,
          ),
        )
        .flatMap((asset) => {
          const layoutNode = layout.nodes.find((node) => node.id === asset.id);

          return asset.terminals.map((terminal) => {
            const positioned = layoutNode?.terminals.find(
              (item) => item.id === terminal.id,
            );

            return {
              equipment: asset.tag || asset.id,
              kind: asset.kind,
              terminal: terminal.id,
              originalSide: terminal.side,
              layoutSide: positioned?.side,
              offset: positioned?.offset,
            };
          });
        }),
    );
  }, [network, layout]);
  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------

  return (
    <div className="app-shell">
      {/* ==========================================
          TOP HEADER
      ========================================== */}

      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Activity size={21} />
          </div>

          <div>
            <h1>GRIDLINE</h1>
            <span>NETWORK VISUALISER</span>
          </div>
        </div>

        <div className="topbar-center">
          <span className="breadcrumb">POWER NETWORKS</span>

          <span className="breadcrumb-separator">/</span>

          <strong>SINGLE LINE DIAGRAM</strong>
        </div>

        <div className="topbar-actions">
          <span className="demo-badge">
            {networkSource === "EXCEL" ? "EXCEL DATA" : "SYNTHETIC DATA"}
          </span>

          <button
            className="import-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || isLayouting}
          >
            <Upload size={15} />

            {isImporting ? "Importing..." : "Import Excel"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={handleExcelImport}
          />

          <Settings size={18} className="settings-icon" />
        </div>
      </header>

      {/* ==========================================
          MAIN WORKSPACE
      ========================================== */}

      <div className="workspace">
        {/* ========================================
            LEFT SIDEBAR
        ======================================== */}

        <aside className="left-sidebar">
          <div className="sidebar-heading">
            <span>NETWORK EXPLORER</span>
            <Layers size={16} />
          </div>

          <div className="substation-card">
            <div className="substation-icon">
              <Zap size={20} />
            </div>

            <div>
              <strong>{network.substation.name}</strong>

              <span>{network.substation.nominalVoltageLevels.join(" / ")}</span>
            </div>
          </div>

          {/* Network overview */}

          <div className="sidebar-section">
            <span className="section-label">NETWORK OVERVIEW</span>

            <div className="network-item">
              <Database size={15} />
              <span>Equipment assets</span>
              <strong>{equipmentCount}</strong>
            </div>

            <div className="network-item">
              <Zap size={15} />
              <span>Transformers</span>
              <strong>{transformerCount}</strong>
            </div>

            <div className="network-item">
              <Activity size={15} />
              <span>Switching devices</span>
              <strong>{switchingDeviceCount}</strong>
            </div>

            <div className="network-item">
              <Cable size={15} />
              <span>Connections</span>
              <strong>{connectionCount}</strong>
            </div>
          </div>

          {/* Voltage levels */}

          <div className="sidebar-section">
            <span className="section-label">VOLTAGE LEVELS</span>

            <div className="voltage-item">
              <span className="voltage-dot voltage-132" />
              132 kV
              <span className="voltage-count">{voltage132Count}</span>
            </div>

            <div className="voltage-item">
              <span className="voltage-dot voltage-33" />
              33 kV
              <span className="voltage-count">{voltage33Count}</span>
            </div>
          </div>

          {/* Validation status */}

          <div className="sidebar-footer">
            <div
              className={`connection-indicator ${
                !isNetworkValid ? "validation-failed" : ""
              }`}
            />

            {isNetworkValid
              ? "Network model validated"
              : "Network validation failed"}

            <span>{isNetworkValid ? "VALID" : "ERROR"}</span>
          </div>
        </aside>

        {/* ========================================
            MAIN DIAGRAM AREA
        ======================================== */}

        <main className="diagram-area">
          <div className="diagram-toolbar">
            <div>
              <h2>Network single-line diagram</h2>

              <p>Electrical connections and equipment layout</p>
            </div>

            <div className="diagram-toolbar-right">
              <span className="readonly-badge">READ ONLY</span>

              <span className="asset-count">
                {equipmentCount} ASSETS · {connectionCount} LINKS
              </span>
            </div>
          </div>

          {/* Import status */}

          {importMessage && (
            <div
              className="import-message"
              style={{
                padding: "8px 16px",
                fontSize: "11px",
                color: importError ? "#ef7777" : "#63d7b4",
                background: "#101a29",
                borderBottom: "1px solid #263448",
              }}
            >
              {importError ? "Import failed: " : ""}
              {importMessage}
            </div>
          )}

          {/* SLD canvas */}

          <div className="canvas-container">
            <div className="canvas-label">SINGLE LINE DIAGRAM · CANVAS</div>

            {isLayouting ? (
              <div className="empty-inspector">
                <Activity size={30} />

                <strong>Calculating network layout...</strong>

                <p>Arranging equipment and routing electrical connections.</p>
              </div>
            ) : layoutError ? (
              <div className="empty-inspector">
                <Activity size={30} />

                <strong>Layout generation failed</strong>

                <p>{layoutError}</p>
              </div>
            ) : !isNetworkValid ? (
              <div className="empty-inspector">
                <Activity size={30} />

                <strong>Network validation failed</strong>

                {networkErrors.map((error, index) => (
                  <p key={`${error}-${index}`}>{error}</p>
                ))}
              </div>
            ) : !layout ? (
              <div className="empty-inspector">
                <strong>No network layout available</strong>
              </div>
            ) : (
              <ReactFlow<EquipmentNodeType, RoutedEdgeType>
                key={layoutRevision}
                nodes={networkNodes}
                edges={networkEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                fitViewOptions={{
                  padding: 0.2,
                  maxZoom: 1,
                }}
                minZoom={0.1}
                maxZoom={2}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={true}
                onNodeClick={(_, node) => {
                  setSelected(node.data);
                  setSelectedConnectionId(null);
                }}
                onEdgeClick={(_, edge) => {
                  setSelected(null);
                  setSelectedConnectionId(edge.id);
                }}
                onPaneClick={() => {
                  setSelected(null);
                  setSelectedConnectionId(null);
                }}
                proOptions={{
                  hideAttribution: true,
                }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={24}
                  size={1}
                  color="#28374b"
                />

                <Controls />

                <MiniMap
                  nodeColor="#526f8f"
                  maskColor="rgba(8, 15, 27, 0.75)"
                />
              </ReactFlow>
            )}
          </div>

          {/* Diagram footer */}

          <div className="diagram-footer">
            <span>GRIDLINE · NETWORK ENGINEERING DEMONSTRATOR</span>

            <span>{network.substation.nominalVoltageLevels.join(" / ")}</span>
          </div>
        </main>

        {/* ========================================
            RIGHT SIDEBAR - INSPECTOR
        ======================================== */}

        <aside className="right-sidebar">
          <div className="inspector-heading">
            <div>
              <span className="section-label">ASSET DETAILS</span>

              <h3>
                {selectedConnection ? "Cable inspector" : "Equipment inspector"}
              </h3>
            </div>

            <Search size={17} />
          </div>

          {/* CABLE INSPECTOR */}

          {selectedConnection ? (
            <div className="inspector-content">
              <div className="selected-asset-icon">
                <Cable size={28} />
              </div>

              <h2>{selectedCable?.id ?? selectedConnection.cableId}</h2>

              <span className="asset-id">
                {selectedCable?.name ?? "Cable connection"}
              </span>

              <div
                className={`inspector-status ${
                  selectedConnection.status === "DISCONNECTED"
                    ? "status-open"
                    : "status-live"
                }`}
              >
                <span />

                {selectedConnection.status ?? "CONNECTED"}
              </div>

              <div className="inspector-divider" />

              <span className="section-label">CABLE ROUTE</span>

              <div className="property-row">
                <span>From</span>

                <strong>
                  {getAssetDisplayName(
                    cableFrom,
                    selectedConnection.from.equipmentId,
                  )}
                </strong>
              </div>

              <div className="property-row">
                <span>From terminal</span>

                <strong>{selectedConnection.from.terminalId}</strong>
              </div>

              <div className="property-row">
                <span>To</span>

                <strong>
                  {getAssetDisplayName(
                    cableTo,
                    selectedConnection.to.equipmentId,
                  )}
                </strong>
              </div>

              <div className="property-row">
                <span>To terminal</span>

                <strong>{selectedConnection.to.terminalId}</strong>
              </div>

              <div className="inspector-divider" />

              <span className="section-label">CABLE INFORMATION</span>

              <div className="property-row">
                <span>Voltage</span>

                <strong>
                  {selectedCable?.voltageLevel ??
                    selectedConnection.voltageLevel}
                </strong>
              </div>

              <div className="property-row">
                <span>Length</span>

                <strong>
                  {selectedCable
                    ? formatCableLength(selectedCable.lengthKm)
                    : "Not available"}
                </strong>
              </div>

              <div className="property-row">
                <span>Status</span>

                <strong>{selectedCable?.status ?? "Unknown"}</strong>
              </div>
            </div>
          ) : selected ? (
            /* EQUIPMENT INSPECTOR */

            <div className="inspector-content">
              <div className="selected-asset-icon">
                {selected.kind === "transformer" ? (
                  <Activity size={28} />
                ) : selected.kind === "busbar" ? (
                  <Cable size={28} />
                ) : (
                  <Zap size={28} />
                )}
              </div>

              <h2>{selected.label}</h2>

              <span className="asset-id">{selected.assetId}</span>

              {selected.tag && (
                <div className="asset-id">Tag: {selected.tag}</div>
              )}

              <div
                className={`inspector-status ${
                  selected.switchPosition === "OPEN" ||
                  selected.status === "OPEN"
                    ? "status-open"
                    : "status-live"
                }`}
              >
                <span />

                {selected.status}
              </div>

              <div className="inspector-divider" />

              <span className="section-label">GENERAL INFORMATION</span>

              <div className="property-row">
                <span>Equipment type</span>

                <strong>
                  {selected.equipmentType ?? selected.kind.toUpperCase()}
                </strong>
              </div>

              <div className="property-row">
                <span>Voltage level</span>

                <strong>{selected.voltage}</strong>
              </div>

              {selected.rating && (
                <div className="property-row">
                  <span>Rated capacity</span>

                  <strong>{selected.rating}</strong>
                </div>
              )}

              <div className="property-row">
                <span>Asset reference</span>

                <strong>{selected.assetId}</strong>
              </div>

              {selected.switchPosition && (
                <div className="property-row">
                  <span>Switch position</span>

                  <strong>{selected.switchPosition}</strong>
                </div>
              )}

              <div className="inspector-divider" />

              <span className="section-label">TERMINALS</span>

              {selected.terminals.map((terminal) => (
                <div className="property-row" key={terminal.id}>
                  <span>{terminal.name}</span>

                  <strong>{terminal.side.toUpperCase()}</strong>
                </div>
              ))}

              <div className="inspector-divider" />

              <span className="section-label">
                CONNECTED ASSETS ({selectedConnections.length})
              </span>

              {selectedConnections.length > 0 ? (
                selectedConnections.map((connection) => {
                  const isSource =
                    connection.from.equipmentId === selected.assetId;

                  const connectedEquipmentId = isSource
                    ? connection.to.equipmentId
                    : connection.from.equipmentId;

                  const connectedAsset = network.equipment.find(
                    (asset) => asset.id === connectedEquipmentId,
                  );

                  const cable = network.cables.find(
                    (item) => item.id === connection.cableId,
                  );

                  return (
                    <div className="property-row" key={connection.id}>
                      <span>
                        {connectedAsset?.tag ||
                          connectedAsset?.name ||
                          connectedEquipmentId}
                      </span>

                      <strong>{cable?.id ?? connection.cableId}</strong>
                    </div>
                  );
                })
              ) : (
                <p className="asset-description">
                  No connections found for this asset.
                </p>
              )}

              <div className="inspector-divider" />

              <span className="section-label">DESCRIPTION</span>

              <p className="asset-description">{selected.description}</p>
            </div>
          ) : (
            <div className="empty-inspector">
              <Layers size={30} />

              <strong>No equipment selected</strong>

              <p>
                Select an electrical symbol or cable to inspect its details.
              </p>
            </div>
          )}

          {/* INSPECTOR FOOTER */}

          <div className="inspector-bottom">
            <span>GRIDLINE SLD</span>

            <span>DEMO VERSION 0.5</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
