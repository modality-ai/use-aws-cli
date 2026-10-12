import { z } from "zod";
import type { CLICommand } from "modality-cli-kit";

const BarArgsSchema = z.object({
  target: z.string().describe("Name or selector of the thing to act on"),
});

type BarArgs = z.infer<typeof BarArgsSchema>;

async function bar(args: BarArgs) {
  return { success: true, message: `bar handled ${args.target}` };
}

export const barCommand: CLICommand = {
  name: "bar",
  aliases: ["b", "baz"],
  description: "Run the bar action against a target",
  inputSchema: BarArgsSchema,
  positionalKeys: ["target"],
  execute: bar,
  examples: ["use-aws-cli bar my-target"],
};
