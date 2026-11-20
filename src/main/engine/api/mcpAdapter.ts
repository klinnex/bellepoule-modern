/**
 * BellePoule Modern - Outils MCP générés depuis le contrat d'API (#1981)
 * Toute opération du contrat marquée `mcp` devient un outil : commande → écriture (proposée
 * seulement si « Autoriser l'écriture » est coché), requête → lecture. Schéma JSON tiré du
 * schéma zod ; mêmes validation et erreurs que l'IPC.
 * Licensed under GPL-3.0
 */
import { z } from 'zod';
import { contract, type OperationDef, type OperationName } from '../../../shared/api/contract';
import { McpToolError, type McpTool } from '../../mcp/mcpTools';
import type { McpWriteTool } from '../../mcp/mcpWriteTools';
import { readDomain, writeDomain } from '../../mcp/mcpDomain';
import { invoke, toApiError } from './engine';

type InputSchema = McpTool['inputSchema'];

/** Schéma JSON d'entrée d'une opération (forme attendue par MCP) */
export function mcpInputSchema(def: OperationDef): InputSchema {
  const json = z.toJSONSchema(def.input, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  return {
    ...json,
    type: 'object',
    properties: (json.properties as Record<string, unknown>) ?? {},
    ...(Array.isArray(json.required) && json.required.length
      ? { required: json.required as string[] }
      : {}),
  };
}

/** Erreur du moteur → résultat `isError` de l'outil, « message (code) » comme le domaine */
const asToolError = (e: unknown) => {
  const err = toApiError(e);
  return new McpToolError(`${err.message} (${err.code})`);
};

function buildTools() {
  const read: McpTool[] = [];
  const write: McpWriteTool[] = [];
  for (const name of Object.keys(contract) as OperationName[]) {
    const def = contract[name] as OperationDef;
    if (!def.mcp || def.kind === 'subscription') continue;
    const base = {
      name: def.mcp.name,
      title: def.mcp.title,
      description: def.description,
      inputSchema: mcpInputSchema(def),
    };
    if (def.kind === 'query') {
      read.push({
        ...base,
        annotations: { readOnlyHint: true },
        run: async (deps, args) => {
          try {
            return await invoke(readDomain(deps), name, args);
          } catch (e) {
            throw asToolError(e);
          }
        },
      });
    } else {
      write.push({
        ...base,
        annotations: {
          readOnlyHint: false,
          destructiveHint: !!def.mcp.destructive,
          idempotentHint: !!def.mcp.idempotent,
        },
        run: async (deps, args) => {
          try {
            return await invoke(writeDomain(deps), name, args);
          } catch (e) {
            throw asToolError(e);
          }
        },
      });
    }
  }
  return { read, write };
}

export const CONTRACT_MCP_TOOLS = buildTools();
