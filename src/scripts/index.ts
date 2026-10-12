import type { AITool } from "modality-mcp-kit";

import { createFlatCommandSchema, getHelp } from "modality-cli-kit";
import { z } from "zod";
import { registry } from "./registry";
import { cliConfig } from "./cliConfig";

/**
 * SkillSchema addresses the whole command bundle: a `command` field selecting
 * which registered command to run, plus every command's args flattened at the
 * top level (relaxed to optional). Built from the registry so it stays in sync
 * as commands are added. Invoke as `<skill> <command> --arg ...` or
 * `<skill> --command <command> --arg ...`.
 */
export const SkillSchema = createFlatCommandSchema(registry.all);

type SkillProps = z.infer<typeof SkillSchema>;

export const aiTool: AITool = {
  inputSchema: SkillSchema,

  async execute(props: SkillProps) {
    // Strip the bundle selector; the rest of the flattened props are the
    // chosen command's args. The registry resolves the name (or alias) and
    // dispatches to that command's own execute. `command` is typed `unknown`
    // (the schema is built dynamically, so key types are erased) but is always
    // a string value at runtime — validated by SkillSchema's `command` enum.
    const { command, ...args } = props;

    if (!command) {
      // No command selected (e.g. empty invocation) → return help text.
      return getHelp(cliConfig);
    }

    return registry.execute(String(command), args);
  },
};
