
import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./App.css";

import { Upload, Activity, Search } from "lucide-react";

import { importPowerFactoryWorkbook } from "./services/powerFactoryImport";

import PowerFactoryDiagram, {
  getPowerFactoryBounds,
} from "./components/sld/PowerFactoryDiagram";

import type {
  PowerFactoryElement,
  PowerFactoryWorkbook,
} from "./types/powerFactory";

// ==================================================
// REACT FLOW DIAGRAM NODE
// ==================================================

interface DiagramNodeData extends Record<string, unknown> {
  workbook: PowerFactoryWorkbook;
  selectedPath?: string;
  onSelect: (element: PowerFactoryElement) => void;
}

type DiagramNodeType = Node<DiagramNodeData, "powerFactory">;

function DiagramNode({ data }: NodeProps<DiagramNodeType>) {
  return (
    <PowerFactoryDiagram
      workbook={data.workbook}
      selectedPath={data.selectedPath}
      onSelect={data.onSelect}
    />
  );
}

const nodeTypes = {
  powerFactory: DiagramNode,
};

// ==================================================
// MAIN APP
// ==================================================

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [workbook, setWorkbook] = useState<PowerFactoryWorkbook | null>(null);

  const [selected, setSelected] = useState<PowerFactoryElement | null>(null);

  const [elementSearch, setElementSearch] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [revision, setRevision] = useState(0);

  // ------------------------------------------------
  // DIAGRAM BOUNDS
  // ------------------------------------------------

  const bounds = useMemo(
    () => (workbook ? getPowerFactoryBounds(workbook) : null),
    [workbook],
  );

  // ------------------------------------------------
  // ELEMENT SEARCH
  // ------------------------------------------------

  const filteredElements = useMemo(() => {
    if (!workbook) return [];

    const query = elementSearch.trim().toLowerCase();

    if (!query) return [];

    return workbook.elements
      .filter((element) =>
        [
          element.name,
          element.elementClass,
          element.siteOrSubstation,
          element.symbolName,
          element.netDataObjectPath,
          element.graphicObject,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 30);
  }, [workbook, elementSearch]);

  // ------------------------------------------------
  // REACT FLOW NODE
  // ------------------------------------------------

  const nodes = useMemo<DiagramNodeType[]>(() => {
    if (!workbook || !bounds) return [];

    return [
      {
        id: "powerfactory-diagram",
        type: "powerFactory",
        position: { x: 0, y: 0 },

        data: {
          workbook,
          selectedPath: selected?.netDataObjectPath,
          onSelect: setSelected,
        },

        style: {
          width: bounds.width,
          height: bounds.height,
          padding: 0,
          border: "none",
          background: "transparent",
          boxShadow: "none",
          overflow: "visible",
        },

        draggable: false,
        selectable: false,
      },
    ];
  }, [workbook, bounds, selected]);

  // ------------------------------------------------
  // WORKBOOK IMPORT
  // ------------------------------------------------

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const parsed = await importPowerFactoryWorkbook(file);

      setWorkbook(parsed);
      setSelected(null);
      setElementSearch("");

      setRevision((value) => value + 1);

      console.log("PowerFactory workbook loaded:", parsed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to import PowerFactory workbook.",
      );
    } finally {
      setLoading(false);
      input.value = "";
    }
  }

  // ------------------------------------------------
  // COUNTS
  // ------------------------------------------------

  const elementCount = workbook?.elements.length ?? 0;

  const lineCount =
    workbook?.elements.filter(
      (element) => element.elementClass === "ElmLne",
    ).length ?? 0;

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------

  return (
    <div className="pf-app">
      {/* HEADER */}

      <header className="pf-header">
        <div className="pf-brand">
          <Activity size={22} />

          <div>
            <strong>GRIDLINE</strong>
            <span>POWER NETWORK SLD</span>
          </div>
        </div>

        <div className="pf-file-info">
          {workbook
            ? `${elementCount} ELEMENTS · ${lineCount} LINES`
            : "NO DIAGRAM LOADED"}
        </div>

        <button
          className="pf-import-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          <Upload size={16} />
          {loading ? "Loading..." : "Import PowerFactory"}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={handleImport}
        />
      </header>

      {/* WORKSPACE */}

      <main className="pf-workspace">
        {/* DIAGRAM */}

        <section className="pf-canvas">
          {error && <div className="pf-error">{error}</div>}

          {!workbook ? (
            <div className="pf-empty">
              <Activity size={40} />

              <h2>PowerFactory Single-Line Diagram</h2>

              <p>
                Import your two-sheet PowerFactory Excel export to begin.
              </p>

              <button onClick={() => fileInputRef.current?.click()}>
                Import workbook
              </button>
            </div>
          ) : (
            <ReactFlow<DiagramNodeType>
              key={revision}
              nodes={nodes}
              edges={[]}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{
                padding: 0.08,
                maxZoom: 1,
              }}
              minZoom={0.03}
              maxZoom={5}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag
              zoomOnScroll
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1}
                color="#26374b"
              />

              <Controls />
            </ReactFlow>
          )}
        </section>

        {/* INSPECTOR */}

        <aside className="pf-inspector">
          <span className="pf-inspector-label">
            ELEMENT INSPECTOR
          </span>

          {/* SEARCH */}

          <div className="pf-element-browser">
            <div className="pf-search-wrapper">
              <Search size={15} />

              <input
                className="pf-element-search"
                value={elementSearch}
                onChange={(event) => setElementSearch(event.target.value)}
                placeholder="Search name, class or path..."
                aria-label="Search PowerFactory elements"
              />

              {elementSearch && (
                <button
                  className="pf-search-clear"
                  onClick={() => setElementSearch("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {elementSearch.trim() && (
              <div className="pf-element-results">
                {filteredElements.length > 0 ? (
                  filteredElements.map((element, index) => (
                    <button
                      key={
                        element.netDataObjectPath ??
                        `${element.name}-${index}`
                      }
                      className={`pf-element-result ${
                        selected === element ? "active" : ""
                      }`}
                      onClick={() => setSelected(element)}
                    >
                      <strong>{element.name}</strong>

                      <span>
                        {element.elementClass} · {element.symbolName || "No symbol"}
                      </span>

                      <small>
                        {element.siteOrSubstation || "Unknown location"}
                      </small>
                    </button>
                  ))
                ) : (
                  <p className="pf-no-results">
                    No matching elements found.
                  </p>
                )}

                {filteredElements.length === 30 && (
                  <p className="pf-search-limit">
                    Showing the first 30 matches. Refine your search.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* SELECTED ELEMENT DETAILS */}

          {selected ? (
            <>
              <div className="pf-selected-heading">
                <h2>{selected.name}</h2>
                <span>{selected.elementClass}</span>
              </div>

              <div className="pf-property">
                <span>Element class</span>
                <strong>{selected.elementClass}</strong>
              </div>

              <div className="pf-property">
                <span>Site / Substation</span>
                <strong>{selected.siteOrSubstation || "—"}</strong>
              </div>

              <div className="pf-property">
                <span>Symbol</span>
                <strong>{selected.symbolName || "—"}</strong>
              </div>

              <div className="pf-property">
                <span>X coordinate</span>
                <strong>{selected.x ?? "—"}</strong>
              </div>

              <div className="pf-property">
                <span>Y coordinate</span>
                <strong>{selected.y ?? "—"}</strong>
              </div>

              <div className="pf-property">
                <span>Graphic object</span>
                <strong>{selected.graphicObject || "—"}</strong>
              </div>

              <div className="pf-property">
                <span>Graphical objects</span>
                <strong>{selected.graphicalObjects.length}</strong>
              </div>

              <div className="pf-property">
                <span>Graphic coordinate points</span>
                <strong>
                  {selected.graphicalObjects.reduce(
                    (total, graphic) =>
                      total + graphic.points.length,
                    0,
                  )}
                </strong>
              </div>

              <div className="pf-path">
                <span>Net Data Object Path</span>
                <p>
                  {selected.netDataObjectPath || "Not available"}
                </p>
              </div>

              {selected.notes && (
                <div className="pf-path">
                  <span>Notes</span>
                  <p>{selected.notes}</p>
                </div>
              )}

              <button
                className="pf-clear-selection"
                onClick={() => setSelected(null)}
              >
                Clear selection
              </button>
            </>
          ) : (
            <p className="pf-no-selection">
              Select an electrical symbol or conductor, or search for an
              element by name, class, symbol or object path.
            </p>
          )}
        </aside>
      </main>

      {/* FOOTER */}

      <footer className="pf-footer">
        <span>GRIDLINE · ENGINEERING DEMONSTRATOR</span>

        <span>
          {workbook?.info.powerFactoryVersion
            ? `POWERFACTORY ${workbook.info.powerFactoryVersion}`
            : "POWERFACTORY DATA"}
        </span>
      </footer>
    </div>
  );
}

export default App;
