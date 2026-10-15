import { z } from "zod";
import type { CLICommand } from "modality-cli-kit";
import { formatInstanceRow, listInstances } from "../../lib/aws-ec2";

/**
 * `use-aws-cli ec2 --list` — read-only list of every EC2 instance id in the
 * region, with state, subnet and Name tag.
 */

const Ec2ArgsSchema = z.object({
  list: z.boolean().optional().describe("List all EC2 instance IDs in the region (the command's default behavior)"),
  region: z
    .string()
    .optional()
    .describe("AWS region to query (defaults to the aws CLI's configured region)"),
});

type Ec2Args = z.infer<typeof Ec2ArgsSchema>;

async function ec2(args: Ec2Args) {
  const region = args.region?.trim() || undefined;
  const listing = await listInstances(region);
  if (!listing.ok) {
    return { success: false, instances: [], message: `Cannot list instances: ${listing.error}` };
  }
  const { rows } = listing;
  const message = rows.length
    ? [`${rows.length} instance(s):`, ...rows.map((row) => formatInstanceRow(row))].join("\n")
    : "No EC2 instances found in this region.";
  return { success: true, count: rows.length, instances: rows, message };
}

export const ec2Command: CLICommand = {
  name: "ec2",
  summary: "List EC2 instance IDs (read-only)",
  description: "List all EC2 instances in the region with their instance ID, state, subnet and Name tag.",
  inputSchema: Ec2ArgsSchema,
  execute: ec2,
  examples: ["use-aws-cli ec2 --list", "use-aws-cli ec2 --list --region us-east-1"],
};
