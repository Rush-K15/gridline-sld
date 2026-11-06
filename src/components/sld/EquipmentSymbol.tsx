import type {
  EquipmentKind,
  EquipmentStatus,
  SwitchPosition,
} from "../../types/network";

interface EquipmentSymbolProps {
  kind: EquipmentKind;
  status: EquipmentStatus;
  switchPosition?: SwitchPosition;
  orientation?: "vertical" | "horizontal";
}

export default function EquipmentSymbol({
  kind,
  status,
  switchPosition,
  orientation = "vertical",
}: EquipmentSymbolProps) {
  const color =
    status === "OUT OF SERVICE"
      ? "#718096"
      : kind === "transformer"
        ? "#63d7c0"
        : kind === "busbar"
          ? "#e5b876"
          : kind === "breaker"
            ? "#86b5e8"
            : kind === "disconnector"
              ? "#a9b9d1"
              : "#84a5ce";

  const isOpen = status === "OPEN" || switchPosition === "OPEN";

  const bladeColor = isOpen ? "#f1b76c" : color;

  if (kind === "busbar") {
    return (
      <svg
        viewBox="0 0 800 30"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        <path d="M0 15 H800" stroke={color} strokeWidth="5" fill="none" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 80 100"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{
        transform: orientation === "horizontal" ? "rotate(90deg)" : undefined,
      }}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "transformer" && (
        <g stroke={color} strokeWidth="2.4">
          <path d="M40 0 V30 M40 70 V100" />
          <circle cx="31" cy="50" r="15" />
          <circle cx="49" cy="50" r="15" />
        </g>
      )}

      {kind === "breaker" && (
        <g strokeWidth="2.3">
          <path d="M40 0 V38 M40 62 V100" stroke={color} />
          <circle cx="40" cy="38" r="3" fill={color} />
          <circle cx="40" cy="62" r="3" fill={color} />
          <path
            d={isOpen ? "M40 38 L55 51" : "M40 38 V62"}
            stroke={bladeColor}
          />
        </g>
      )}

      {kind === "disconnector" && (
        <g strokeWidth="2.3">
          <path d="M40 0 V38 M40 62 V100" stroke={color} />
          <circle cx="40" cy="38" r="3" fill={color} />
          <circle cx="40" cy="62" r="3" fill={color} />
          <path
            d={isOpen ? "M40 38 L58 17" : "M40 38 V62"}
            stroke={bladeColor}
          />
        </g>
      )}

      {kind === "feeder" && (
        <g stroke={color} strokeWidth="2.3">
          <path d="M40 0 V78" />
          <path d="M26 64 L40 80 L54 64" />
        </g>
      )}
    </svg>
  );
}
