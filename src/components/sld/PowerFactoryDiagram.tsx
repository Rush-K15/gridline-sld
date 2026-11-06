
import { useState } from "react";
import { useViewport } from "@xyflow/react";

import type {
  PowerFactoryElement,
  PowerFactoryWorkbook,
} from "../../types/powerFactory";

// ==================================================
// TYPES AND CONFIGURATION
// ==================================================

interface Props {
  workbook: PowerFactoryWorkbook;
  selectedPath?: string;
  onSelect: (element: PowerFactoryElement) => void;
}

export interface DiagramBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

const diagramY = (y: number) => -y;

// Labels are deliberately hidden at the initial full-diagram view.
const LABEL_ZOOM_THRESHOLD = 2.8;
const SWITCH_LABEL_ZOOM_THRESHOLD = 3.5;

const majorLabelClasses = new Set([
  "ElmSubstat",
  "ElmTr2",
  "ElmTr3",
  "ElmLod",
  "ElmNec",
]);

// ==================================================
// VISUAL EXCLUSIONS
// These elements remain in the imported workbook.
// Only their visual representations are hidden.
// ==================================================

const hiddenElementPaths = new Set<string>([
  String.raw`Network Model\Network Data\Grid - UKPN & National Grid\DNO-UKPN\01 - Amersham 132kV GSP\Loud Water\Loud Water 33kV\B1`,

  String.raw`Network Model\Network Data\Grid - UKPN & National Grid\DNO-UKPN\01 - Amersham 132kV GSP\Loud Water\Loud Water 132kV\GT1`,

  String.raw`Network Model\Network Data\Grid - UKPN & National Grid\DNO-UKPN\01 - Amersham 132kV GSP\Loud Water\Loud Water 132kV\GT2`,

  String.raw`Network Model\Network Data\Grid - UKPN & National Grid\DNO-UKPN\01 - Amersham 132kV GSP\Loud Water\Loud Water 33kV`,

  String.raw`Network Model\Network Data\Grid - UKPN & National Grid\DNO-UKPN\01 - Amersham 132kV GSP\Loud Water\Loud Water 33kV\BS 1-2`,

  String.raw`Network Model\Network Data\Grid - UKPN & National Grid\DNO-UKPN\01 - Amersham 132kV GSP\Loud Water\Loud Water 33kV\B2`,
]);

// ==================================================
// DIAGRAM BOUNDS
// ==================================================

export function getPowerFactoryBounds(
  workbook: PowerFactoryWorkbook,
): DiagramBounds {
  const coordinates: { x: number; y: number }[] = [];

  for (const element of workbook.elements) {
    if (element.x !== undefined && element.y !== undefined) {
      coordinates.push({
        x: element.x,
        y: diagramY(element.y),
      });
    }

    for (const graphic of element.graphicalObjects) {
      for (const point of graphic.points) {
        if (point.x !== undefined && point.y !== undefined) {
          coordinates.push({
            x: point.x,
            y: diagramY(point.y),
          });
        }
      }
    }
  }

  if (coordinates.length === 0) {
    return {
      minX: 0,
      minY: 0,
      width: 100,
      height: 100,
    };
  }

  const xs = coordinates.map((point) => point.x);
  const ys = coordinates.map((point) => point.y);

  const padding = 12;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  };
}

// ==================================================
// ELECTRICAL SYMBOLS
// Existing simplified SVG representations.
// ==================================================

function ElementSymbol({
  element,
  selected,
}: {
  element: PowerFactoryElement;
  selected: boolean;
}) {
  const stroke = selected ? "#ffc66d" : "#d6e3ef";
  const fill = "#142337";
  const symbol = element.symbolName?.toLowerCase() ?? "";

  // Breakers and disconnectors
  if (element.elementClass === "ElmCoup") {
    if (symbol.includes("circ")) {
      return (
        <circle
          r="3.2"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
      );
    }

    return (
      <>
        <rect
          x="-3.5"
          y="-3.5"
          width="7"
          height="7"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <path
          d="M -2 -2 L 2 2"
          stroke={stroke}
          strokeWidth="0.9"
        />
      </>
    );
  }

  // Terminals and busbars
  if (element.elementClass === "ElmTerm") {
    if (symbol.includes("strip")) {
      return (
        <line
          x1={symbol.includes("short") ? "-13" : "-28"}
          y1="0"
          x2={symbol.includes("short") ? "13" : "28"}
          y2="0"
          stroke={stroke}
          strokeWidth={symbol.includes("short") ? "0.45" : "0.55"}
          strokeLinecap="square"
        />
      );
    }

    if (symbol.includes("poly")) {
      return (
        <polygon
          points="0,-3.5 3.5,0 0,3.5 -3.5,0"
          fill={fill}
          stroke={stroke}
          strokeWidth="1"
        />
      );
    }

    return <circle r="1.8" fill={stroke} />;
  }

  // Transformers
  if (
    element.elementClass === "ElmTr2" ||
    element.elementClass === "ElmTr3"
  ) {
    return (
      <>
        <circle
          cx="-3"
          cy="0"
          r="4"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.1"
        />

        <circle
          cx="3"
          cy="0"
          r="4"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.1"
        />

        {element.elementClass === "ElmTr3" && (
          <circle
            cx="0"
            cy="-6"
            r="3"
            fill={fill}
            stroke={stroke}
            strokeWidth="1"
          />
        )}
      </>
    );
  }

  // Substations
  if (element.elementClass === "ElmSubstat") {
    return (
      <rect
        x="-5"
        y="-4"
        width="10"
        height="8"
        rx="1"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.2"
      />
    );
  }

  // Loads
  if (element.elementClass === "ElmLod") {
    return (
      <polygon
        points="0,-4 4,3 -4,3"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.2"
      />
    );
  }

  // Network equivalents
  if (element.elementClass === "ElmNec") {
    return (
      <polygon
        points="-4,-3 0,-5 4,-3 4,3 0,5 -4,3"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.1"
      />
    );
  }

  return (
    <circle
      r="3"
      fill={fill}
      stroke={stroke}
      strokeWidth="1"
    />
  );
}

// ==================================================
// MAIN POWERFACTORY DIAGRAM
// ==================================================

export default function PowerFactoryDiagram({
  workbook,
  selectedPath,
  onSelect,
}: Props) {
  const [hoveredPath, setHoveredPath] = useState<string | undefined>();

  // React Flow zoom level
  const { zoom } = useViewport();

  const bounds = getPowerFactoryBounds(workbook);

  // Line elements contain the original GCO polylines.
  const lines = workbook.elements.filter(
    (element) => element.elementClass === "ElmLne",
  );

  // Only positioned, non-excluded elements are rendered.
  const equipment = workbook.elements.filter(
    (element) =>
      element.elementClass !== "ElmLne" &&
      element.x !== undefined &&
      element.y !== undefined &&
      !hiddenElementPaths.has(element.netDataObjectPath ?? ""),
  );

  return (
    <svg
      className="pf-diagram-svg"
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ========================================
          CONDUCTORS
      ======================================== */}

      {lines.map((line, lineIndex) =>
        line.graphicalObjects.map((graphic) => {
          const points = graphic.points.filter(
            (point): point is typeof point & {
              x: number;
              y: number;
            } =>
              point.x !== undefined &&
              point.y !== undefined,
          );

          if (points.length < 2) return null;

          const path = points
            .map(
              (point) =>
                `${point.x},${diagramY(point.y)}`,
            )
            .join(" ");

          const selected =
            !!line.netDataObjectPath &&
            line.netDataObjectPath === selectedPath;

          return (
            <g
              key={`${line.netDataObjectPath}-${graphic.slot}-${lineIndex}`}
            >
              {/* Invisible conductor selection target */}
              <polyline
                points={path}
                fill="none"
                stroke="transparent"
                strokeWidth="8"
                pointerEvents="stroke"
                style={{ cursor: "pointer" }}
                onPointerDown={(event) =>
                  event.stopPropagation()
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(line);
                }}
              />

              {/* Visible conductor */}
              <polyline
                points={path}
                fill="none"
                stroke={selected ? "#ffc66d" : "#80aeca"}
                strokeWidth={selected ? "2.5" : "1.25"}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />

              <title>
                {line.name} · {graphic.slot}
              </title>
            </g>
          );
        }),
      )}

      {/* ========================================
          EQUIPMENT
      ======================================== */}

      {equipment.map((element, index) => {
        const selected =
          !!element.netDataObjectPath &&
          element.netDataObjectPath === selectedPath;

        const isHovered =
          !!element.netDataObjectPath &&
          element.netDataObjectPath === hoveredPath;

        // Major equipment labels appear at 2.8x.
        // Switching equipment labels appear at 3.5x.
        const showLabel =
          selected ||
          isHovered ||
          (
            zoom >= LABEL_ZOOM_THRESHOLD &&
            majorLabelClasses.has(element.elementClass)
          ) ||
          (
            zoom >= SWITCH_LABEL_ZOOM_THRESHOLD &&
            element.elementClass === "ElmCoup"
          );

        const symbolName =
          element.symbolName?.toLowerCase() ?? "";

        const isBusbar =
          element.elementClass === "ElmTerm" &&
          symbolName.includes("strip");

        const symbolScale = isBusbar
          ? 1
          : element.elementClass === "ElmTerm"
            ? 0.35
            : element.elementClass === "ElmCoup"
              ? 0.4
              : 0.55;

        return (
          <g
            key={
              element.netDataObjectPath ??
              `${element.elementClass}-${index}`
            }
            data-pf-name={element.name}
            data-pf-class={element.elementClass}
            data-pf-path={element.netDataObjectPath ?? ""}
            transform={`translate(${element.x}, ${diagramY(element.y!)})`}
            style={{ cursor: "pointer" }}
            onPointerDown={(event) =>
              event.stopPropagation()
            }
            onClick={(event) => {
              event.stopPropagation();
              onSelect(element);
            }}
            onMouseEnter={() =>
              setHoveredPath(element.netDataObjectPath)
            }
            onMouseLeave={() =>
              setHoveredPath(undefined)
            }
          >
            {/* Invisible selection area */}
            <circle
              cx="0"
              cy="0"
              r="4"
              fill="transparent"
              pointerEvents="all"
            />

            {/* Electrical symbol */}
            <g transform={`scale(${symbolScale})`}>
              <ElementSymbol
                element={element}
                selected={selected}
              />
            </g>

            {/* Zoom-dependent labels */}
            {showLabel && (
              <text
                x="7"
                y="-5"
                fontSize="3.2"
                fontFamily="Arial, sans-serif"
                fill={selected ? "#ffc66d" : "#d6e3ef"}
                stroke="#0c1726"
                strokeWidth="1.5"
                strokeLinejoin="round"
                paintOrder="stroke"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {element.name}
              </text>
            )}

            <title>
              {element.name} · {element.elementClass}
            </title>
          </g>
        );
      })}
    </svg>
  );
}
