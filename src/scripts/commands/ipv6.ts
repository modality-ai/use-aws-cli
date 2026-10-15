import { z } from "zod";
import { createInterface } from "node:readline/promises";
import type { CLICommand } from "modality-cli-kit";
import {
  buildResult,
  collectIpv6Addresses,
  findIpv6DefaultRoute,
  type CheckResult,
} from "../../lib/ipv6-checks";

/**
 * `use-aws-cli ipv6` — verify-only IPv6 readiness check for an existing EC2
 * instance, built from the flow in src/references/setup-ec2-ipv6.md.
 *
 * Every check is read-only: nothing is ever created or modified. Each failed
 * check carries the exact `aws` command that would fix it. With no instance
 * id the command lists the region's instances and asks which one to verify
 * (TTY), or returns the list so a non-interactive caller can re-run with an
 * id.
 */

const Ipv6ArgsSchema = z.object({
  instanceId: z
    .string()
    .optional()
    .describe(
      "EC2 instance ID to verify (e.g. i-0123456789abcdef0); when omitted, instances are listed for selection",
    ),
  verify: z
    .boolean()
    .optional()
    .describe("Run the read-only IPv6 verification checks (accepted for explicitness; verification is the command's only behavior)"),
  region: z
    .string()
    .optional()
    .describe("AWS region to query (defaults to the aws CLI's configured region)"),
});

type Ipv6Args = z.infer<typeof Ipv6ArgsSchema>;

/** Parsed `aws ... --output json` result; aws failures never throw. */
type AwsResult = { ok: true; data: any } | { ok: false; error: string };

/** One row of the instance picker. */
type InstanceRow = {
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
async function awsJson(args: string[], region?: string): Promise<AwsResult> {
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

/** Flatten describe-instances output into picker rows. */
function toInstanceRows(data: any): InstanceRow[] {
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

/** Numbered prompt; returns the chosen instance id, or null on cancel. */
async function promptSelection(rows: InstanceRow[]): Promise<string | null> {
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

/**
 * Run the six read-only checks for one instance, everything derived from the
 * instance id: state, VPC /56, subnet /64, ::/0 route, SG IPv6 ingress, ENI
 * IPv6 address. Read-only — `fix` fields only print the command to run.
 */
async function verifyInstance(instanceId: string, region?: string) {
  const checks: CheckResult[] = [];

  // C1 — the instance must exist and be running.
  const lookup = await awsJson(["ec2", "describe-instances", "--instance-ids", instanceId], region);
  if (!lookup.ok) {
    checks.push({ id: "instance-state", name: "Instance exists and is running", ok: false, detail: lookup.error });
    return buildResult(instanceId, checks);
  }
  const instance = lookup.data?.Reservations?.[0]?.Instances?.[0];
  if (!instance) {
    checks.push({
      id: "instance-state",
      name: "Instance exists and is running",
      ok: false,
      detail: `No instance found with id ${instanceId}`,
    });
    return buildResult(instanceId, checks);
  }

  const state = instance.State?.Name ?? "unknown";
  checks.push({
    id: "instance-state",
    name: "Instance exists and is running",
    ok: state === "running",
    detail: `State is '${state}'`,
    fix: state === "running" ? undefined : `aws ec2 start-instances --instance-ids ${instanceId}`,
  });

  const vpcId: string | undefined = instance.VpcId;
  const subnetId: string | undefined = instance.SubnetId;
  if (!vpcId || !subnetId) {
    checks.push({
      id: "instance-network",
      name: "Instance is attached to a VPC subnet",
      ok: false,
      detail: "Instance has no VPC/subnet association — cannot verify IPv6",
    });
    return buildResult(instanceId, checks);
  }
  const enis: any[] = instance.NetworkInterfaces ?? [];

  // C2 — the VPC needs an associated IPv6 CIDR block (the /56).
  const vpc = await awsJson(["ec2", "describe-vpcs", "--vpc-ids", vpcId], region);
  const vpcIpv6 = vpc.ok
    ? (vpc.data?.Vpcs?.[0]?.Ipv6CidrBlockAssociationSet ?? [])
        .find((association: any) => association.Ipv6CidrBlockState?.State === "associated")
        ?.Ipv6CidrBlock
    : undefined;
  let vpcDetail: string;
  if (!vpc.ok) vpcDetail = vpc.error;
  else if (vpcIpv6) vpcDetail = `VPC ${vpcId} has ${vpcIpv6}`;
  else vpcDetail = `VPC ${vpcId} has no associated IPv6 CIDR block`;
  checks.push({
    id: "vpc-ipv6-cidr",
    name: "VPC has an IPv6 CIDR block",
    ok: Boolean(vpcIpv6),
    detail: vpcDetail,
    fix: vpcIpv6 ? undefined : `aws ec2 associate-vpc-cidr-block --vpc-id ${vpcId} --amazon-provided-ipv6-cidr-block`,
  });

  // C3 — the subnet needs its own /64, derived from the VPC's /56.
  const subnet = await awsJson(["ec2", "describe-subnets", "--subnet-ids", subnetId], region);
  const subnetIpv6 = subnet.ok
    ? (subnet.data?.Subnets?.[0]?.Ipv6CidrBlockAssociationSet ?? [])
        .find((association: any) => association.Ipv6CidrBlockState?.State === "associated")
        ?.Ipv6CidrBlock
    : undefined;
  let subnetDetail: string;
  let subnetFix: string | undefined;
  if (!subnet.ok) subnetDetail = subnet.error;
  else if (subnetIpv6) subnetDetail = `Subnet ${subnetId} has ${subnetIpv6}`;
  else subnetDetail = `Subnet ${subnetId} has no associated IPv6 CIDR block`;
  if (!subnetIpv6 && vpcIpv6) {
    const derived = vpcIpv6.replace(/\/56$/, "/64");
    if (derived !== vpcIpv6) {
      subnetFix = `aws ec2 associate-subnet-cidr-block --subnet-id ${subnetId} --ipv6-cidr-block ${derived}`;
    }
  }
  checks.push({
    id: "subnet-ipv6-cidr",
    name: "Subnet has an IPv6 CIDR block",
    ok: Boolean(subnetIpv6),
    detail: subnetDetail,
    fix: subnetFix,
  });

  // C4 — the subnet's route table needs an ::/0 route to an internet gateway
  // (the explicit association wins over the VPC main table).
  const rtbs = await awsJson(["ec2", "describe-route-tables", "--filters", `Name=vpc-id,Values=${vpcId}`], region);
  const routeTables: any[] = rtbs.ok ? (rtbs.data?.RouteTables ?? []) : [];
  const explicitTable = routeTables.find((table) =>
    (table.Associations ?? []).some((association: any) => association.SubnetId === subnetId),
  );
  const mainTable = routeTables.find((table) =>
    (table.Associations ?? []).some((association: any) => association.Main === true),
  );
  const routeTable = explicitTable ?? mainTable ?? routeTables[0];
  const ipv6DefaultRoute = findIpv6DefaultRoute(routeTable?.Routes ?? []);
  let routeDetail: string;
  let routeFix: string | undefined;
  if (!rtbs.ok) routeDetail = rtbs.error;
  else if (!routeTable?.RouteTableId) routeDetail = `No route table found for subnet ${subnetId}`;
  else if (ipv6DefaultRoute) routeDetail = `Route table ${routeTable.RouteTableId} has ::/0 via ${ipv6DefaultRoute.GatewayId ?? ipv6DefaultRoute.EgressOnlyInternetGatewayId}`;
  else {
    routeDetail = `Route table ${routeTable.RouteTableId} has no ::/0 IPv6 default route`;
    const ipv4Gateway =
      (routeTable.Routes ?? []).find((route: any) => route.DestinationCidrBlock === "0.0.0.0/0")?.GatewayId ??
      "<igw-id>";
    routeFix = `aws ec2 create-route --route-table-id ${routeTable.RouteTableId} --destination-ipv6-cidr-block ::/0 --gateway-id ${ipv4Gateway}`;
  }
  checks.push({
    id: "ipv6-default-route",
    name: "Route table has an ::/0 IPv6 route",
    ok: Boolean(rtbs.ok && ipv6DefaultRoute),
    detail: routeDetail,
    fix: routeFix,
  });

  // C5 — IPv4 security group rules do not cover IPv6: at least one of the
  // instance's security groups needs an IPv6 ingress rule.
  const sgIds: string[] = (instance.SecurityGroups ?? [])
    .map((group: any): string => String(group.GroupId ?? ""))
    .filter((id: string) => id !== "");
  let sgDetail: string;
  let sgOk = false;
  let sgFix: string | undefined;
  if (sgIds.length === 0) {
    sgDetail = "Instance has no security groups";
  } else {
    const sgs = await awsJson(["ec2", "describe-security-groups", "--group-ids", ...sgIds], region);
    if (!sgs.ok) sgDetail = sgs.error;
    else {
      const group = (sgs.data?.SecurityGroups ?? []).find((sg: any) =>
        (sg.IpPermissions ?? []).some((permission: any) => (permission.Ipv6Ranges ?? []).length > 0),
      );
      if (group) {
        sgOk = true;
        sgDetail = `Group ${group.GroupId} has an IPv6 ingress rule`;
      } else {
        sgDetail = `No IPv6 ingress rule in ${sgIds.length} security group(s) — IPv4 rules do not cover IPv6`;
        sgFix = `aws ec2 authorize-security-group-ingress --group-id ${sgIds[0]} --ip-permissions 'IpProtocol=tcp,FromPort=22,ToPort=22,Ipv6Ranges=[{CidrIpv6=::/0}]'`;
      }
    }
  }
  checks.push({
    id: "security-group-ipv6",
    name: "Security group allows IPv6 ingress",
    ok: sgOk,
    detail: sgDetail,
    fix: sgFix,
  });

  // C6 — the primary ENI must carry an assigned IPv6 address (the step the
  // reference guide is missing: existing instances never get one implicitly).
  const primaryEni = enis.find((eni: any) => eni.Attachment?.DeviceIndex === 0) ?? enis[0];
  const ipv6Addresses = collectIpv6Addresses(enis);
  let eniDetail: string;
  let eniFix: string | undefined;
  if (ipv6Addresses.length > 0) {
    eniDetail = `Assigned: ${ipv6Addresses.join(", ")}`;
  } else {
    eniDetail = "No IPv6 address assigned to the primary network interface";
    const primaryEniId = String(primaryEni?.NetworkInterfaceId ?? "");
    eniFix = `aws ec2 assign-ipv6-addresses --network-interface-id ${primaryEniId || "<eni-id>"} --ipv6-address-count 1`;
  }
  checks.push({
    id: "eni-ipv6-address",
    name: "Instance has an IPv6 address",
    ok: ipv6Addresses.length > 0,
    detail: eniDetail,
    fix: eniFix,
  });

  return buildResult(instanceId, checks, ipv6Addresses);
}

async function ipv6(args: Ipv6Args) {
  const instanceId = args.instanceId?.trim() || undefined;
  const region = args.region?.trim() || undefined;

  if (instanceId) {
    return verifyInstance(instanceId, region);
  }

  // No instance id → list candidates. A TTY asks which to verify; anything
  // else (piped, MCP tool call) returns the list and never blocks on input.
  const listing = await awsJson(["ec2", "describe-instances"], region);
  if (!listing.ok) {
    return {
      success: false,
      checks: [],
      summary: { passed: 0, failed: 0 },
      message: `Cannot list instances: ${listing.error}`,
    };
  }
  const rows = toInstanceRows(listing.data);
  if (!rows.length) {
    return {
      success: false,
      checks: [],
      summary: { passed: 0, failed: 0 },
      message: "No EC2 instances found in this region.",
    };
  }

  if (!process.stdin.isTTY) {
    return {
      success: false,
      instances: rows,
      checks: [],
      summary: { passed: 0, failed: 0 },
      message: "No instance id given. Choose one from the list and re-run: use-aws-cli ipv6 <instance-id> --verify",
    };
  }

  console.log("Select an instance to verify:");
  rows.forEach((row, index) => {
    console.log(
      `  ${index + 1}. ${row.id.padEnd(21)} ${row.state.padEnd(10)} subnet=${row.subnetId.padEnd(15)} ${row.name ?? "-"}`,
    );
  });

  const selected = await promptSelection(rows);
  if (!selected) {
    return {
      success: false,
      checks: [],
      summary: { passed: 0, failed: 0 },
      message: "No instance selected.",
    };
  }
  return verifyInstance(selected, region);
}

export const ipv6Command: CLICommand = {
  name: "ipv6",
  summary: "Verify IPv6 readiness of an EC2 instance (read-only)",
  description:
    "Verify that an existing EC2 instance's VPC, subnet, route table, security group and network interface are IPv6-ready — read-only checks, each failure showing the exact aws fix command. With no instance id, lists instances for selection.",
  inputSchema: Ipv6ArgsSchema,
  positionalKeys: ["instanceId"],
  keyMap: { instanceId: { arg: "<instance-id>" } },
  execute: ipv6,
  examples: [
    "use-aws-cli ipv6 --verify",
    "use-aws-cli ipv6 i-0123456789abcdef0 --verify",
    "use-aws-cli ipv6 --verify --region us-east-1",
  ],
};
