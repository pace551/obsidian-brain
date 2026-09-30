#!/usr/bin/env node
/**
 * obsidian-brain — stdio MCP server over the personal Obsidian vault.
 *
 * Launched by an MCP client (Claude Desktop, Claude Code), never run as a service.
 * stdout is the protocol channel: all diagnostics go to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { resolveVaultRoot } from "./config.js";
import { registerTools } from "./tools.js";

export const VERSION = "0.1.0";

export function createServer(vaultRoot: string): McpServer {
  const server = new McpServer(
    { name: "obsidian-brain", version: VERSION },
    {
      instructions:
        "Reads and writes the user's Obsidian vault. Use capture_note to save a session " +
        "as a structured note, search_notes / list_recent to find prior work, and " +
        "read_note to pull a note's Resume Prompt and Key Learnings back into context.",
    },
  );
  registerTools(server, vaultRoot);
  return server;
}

export async function main(): Promise<void> {
  const vaultRoot = resolveVaultRoot();
  const server = createServer(vaultRoot);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`obsidian-brain ${VERSION} ready (vault: ${vaultRoot})\n`);
}

// Only self-start when executed directly, so tests can import createServer.
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`obsidian-brain failed to start: ${String(error)}\n`);
    process.exit(1);
  });
}
