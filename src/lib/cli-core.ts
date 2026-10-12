import { createCliRunner } from "modality-cli-kit";
import { aiTool } from "../scripts";
import { cliConfig } from "../scripts/cliConfig";

/**
 * The use-aws-cli CLI. All the generic machinery (help, alias resolution, arg
 * validation, dispatch) lives in `modality-cli-kit`; this file only supplies
 * the app-specific config. Passing `aiTool` routes command dispatch through the
 * same counter-script entry point the MCP server uses, and makes an empty
 * invocation defer to it (no-command → help text) automatically.
 */
export const cli = createCliRunner({ ...cliConfig, aiTool });

export const runCli = cli.run;
