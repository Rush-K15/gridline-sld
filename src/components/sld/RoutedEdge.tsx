
import {
  BaseEdge,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';

interface RoutePoint {
  x: number;
  y: number;
}

interface RouteSection {
  startPoint: RoutePoint;
  endPoint: RoutePoint;
  bendPoints?: RoutePoint[];
}

export interface RoutedEdgeData {
  [key: string]: unknown;

  sections: RouteSection[];
  cableId: string;
  cableName?: string;
  lengthKm?: number;
}

export type RoutedEdgeType = Edge<RoutedEdgeData, 'elk'>;

// Convert ELK's calculated bend points into an SVG path.
function createRoutePath(sections: RouteSection[]): string {
  return sections
    .map((section) => {
      const points = [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ];

      return points
        .map((point, index) =>
          `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
        )
        .join(' ');
    })
    .join(' ');
}

export default function RoutedEdge({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerStart,
  markerEnd,
  interactionWidth,
}: EdgeProps<RoutedEdgeType>) {
  const sections = data?.sections ?? [];

  // Fallback for an edge without a calculated ELK route.
  const path =
    sections.length > 0
      ? createRoutePath(sections)
      : `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      markerStart={markerStart}
      markerEnd={markerEnd}
      interactionWidth={interactionWidth ?? 20}
    />
  );
}
