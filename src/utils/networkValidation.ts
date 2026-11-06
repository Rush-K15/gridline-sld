
import type { NetworkModel } from '../types/network';

export function validateNetwork(network: NetworkModel): string[] {
  const errors: string[] = [];

  const equipmentIds = new Set<string>();
  const cableIds = new Set<string>();
  const connectionIds = new Set<string>();

  const equipmentMap = new Map(
    network.equipment.map((equipment) => [equipment.id, equipment])
  );

  // Check duplicate equipment IDs and terminal IDs.
  for (const equipment of network.equipment) {
    if (equipmentIds.has(equipment.id)) {
      errors.push(`Duplicate equipment ID: ${equipment.id}`);
    }

    equipmentIds.add(equipment.id);

    const terminalIds = new Set<string>();

    for (const terminal of equipment.terminals) {
      if (terminalIds.has(terminal.id)) {
        errors.push(
          `Duplicate terminal ${terminal.id} in ${equipment.id}`
        );
      }

      terminalIds.add(terminal.id);
    }
  }

  // Check duplicate cable IDs.
  for (const cable of network.cables) {
    if (cableIds.has(cable.id)) {
      errors.push(`Duplicate cable ID: ${cable.id}`);
    }

    cableIds.add(cable.id);
  }

  // Validate every connection.
  for (const connection of network.connections) {
    if (connectionIds.has(connection.id)) {
      errors.push(`Duplicate connection ID: ${connection.id}`);
    }

    connectionIds.add(connection.id);

    const source = equipmentMap.get(
      connection.from.equipmentId
    );

    const target = equipmentMap.get(
      connection.to.equipmentId
    );

    if (!source) {
      errors.push(
        `Source equipment not found: ${connection.from.equipmentId}`
      );
    } else if (
      !source.terminals.some(
        (terminal) => terminal.id === connection.from.terminalId
      )
    ) {
      errors.push(
        `Source terminal not found: ${connection.from.terminalId} on ${source.id}`
      );
    }

    if (!target) {
      errors.push(
        `Target equipment not found: ${connection.to.equipmentId}`
      );
    } else if (
      !target.terminals.some(
        (terminal) => terminal.id === connection.to.terminalId
      )
    ) {
      errors.push(
        `Target terminal not found: ${connection.to.terminalId} on ${target.id}`
      );
    }

    if (!cableIds.has(connection.cableId)) {
      errors.push(`Cable not found: ${connection.cableId}`);
    }
  }

  return errors;
}
