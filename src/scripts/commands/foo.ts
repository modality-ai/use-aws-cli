import { z } from "zod";
import type { CLICommand } from "modality-cli-kit";

const FooArgsSchema = z.object({
  target: z.string().describe("Name or selector of the thing to act on"),
});

type FooArgs = z.infer<typeof FooArgsSchema>;

async function foo(args: FooArgs) {
  return { success: true, message: `foo handled ${args.target}` };
}

export const fooCommand: CLICommand = {
  name: "foo",
  aliases: ["f"],
  description: "Run the foo action against a target",
  inputSchema: FooArgsSchema,
  positionalKeys: ["target"],
  execute: foo,
  examples: ["use-aws-cli foo my-target"],
};
