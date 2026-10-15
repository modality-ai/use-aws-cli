import { createInterface } from "node:readline/promises";

/** Parsed `aws ... --output json` result; aws failures never throw. */
export type AwsResult = { ok: true; data: any } | { ok: false; error: string };

/** One row of the instance list / picker. */
export type InstanceRow = {
  id: string;
  state: string;
  subnetId: string;
  name: string | null;
};

/**
 * Run `aws <args> --output json` via Bun.spawn (never a shell string) and
 * parse the result. A non-zero exit or bad JSON comes back as
 * `{ ok: false, error }` carrying the aws stderr text — never a throw.
 */
export async function awsJson(args: string[], region?: string): Promise<AwsResult> {
  const argv = ["aws", ...args, "--output", "json"];
  if (region) argv.push("--region", region);

  try {
    const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      return { ok: false, error: stderr.trim() || `aws exited with code ${exitCode}` };
    }
    try {
      return { ok: true, data: JSON.parse(stdout) };
    } catch {
      return { ok: false, error: "aws returned output that is not valid JSON" };
    }
  } catch (error) {
    return { ok: false, error: `failed to run the aws CLI: ${String(error)}` };
  }
}

/** Flatten describe-instances output into rows. */
export function toInstanceRows(data: any): InstanceRow[] {
  const reservations: any[] = data?.Reservations ?? [];
  return reservations
    .flatMap((reservation) => reservation.Instances ?? [])
    .map((instance) => ({
      id: String(instance.InstanceId ?? ""),
      state: String(instance.State?.Name ?? "unknown"),
      subnetId: String(instance.SubnetId ?? "-"),
      name: (instance.Tags ?? []).find((tag: any) => tag.Key === "Name")?.Value ?? null,
    }))
    .filter((row) => row.id !== "");
}

/** List every instance in the region as rows, or the aws error. */
export async function listInstances(
  region?: string,
): Promise<{ ok: true; rows: InstanceRow[] } | { ok: false; error: string }> {
  const listing = await awsJson(["ec2", "describe-instances"], region);
  if (!listing.ok) return { ok: false, error: listing.error };
  return { ok: true, rows: toInstanceRows(listing.data) };
}

/** Format one row as a printable line. */
export function formatInstanceRow(row: InstanceRow, index?: number): string {
  const prefix = index === undefined ? "  " : `  ${index + 1}. `;
  return `${prefix}${row.id.padEnd(21)} ${row.state.padEnd(10)} subnet=${row.subnetId.padEnd(15)} ${row.name ?? "-"}`;
}

/** Numbered prompt; returns the chosen instance id, or null on cancel. */
export async function promptSelection(rows: InstanceRow[]): Promise<string | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (
        await rl.question(`Select 1-${rows.length} (number or i-... id, empty to cancel): `)
      ).trim();
      if (!answer || answer.toLowerCase() === "q") return null;
      if (/^i-[0-9a-fA-F]+$/.test(answer)) return answer;
      const index = Number(answer);
      if (Number.isInteger(index) && index >= 1 && index <= rows.length) {
        return rows[index - 1]?.id ?? null;
      }
      console.log(`Invalid choice "${answer}" — enter 1-${rows.length}, an instance id, or empty to cancel.`);
    }
  } finally {
    rl.close();
  }
}
