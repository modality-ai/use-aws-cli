import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { ipv6Command } from "../ipv6";

type Canned = Record<string, unknown | { fail: string }>;

/** Replace Bun.spawn so each `aws ec2 <subcommand>` returns canned JSON. */
function mockAws(canned: Canned) {
  return spyOn(Bun, "spawn").mockImplementation(((argv: string[]) => {
    const sub = argv[2] ?? "";
    const entry = canned[sub] as any;
    const fail = entry && typeof entry === "object" && "fail" in entry;
    const body = fail ? "" : JSON.stringify(entry ?? {});
    return {
      stdout: new Response(body).body,
      stderr: new Response(fail ? entry.fail : "").body,
      exited: Promise.resolve(fail ? 1 : 0),
    };
  }) as any);
}

const run = (args: Record<string, unknown>) => (ipv6Command.execute as any)(args);

const readyInstance = {
  Reservations: [
    {
      Instances: [
        {
          InstanceId: "i-1",
          State: { Name: "running" },
          VpcId: "vpc-1",
          SubnetId: "subnet-1",
          SecurityGroups: [{ GroupId: "sg-1" }],
          NetworkInterfaces: [
            { NetworkInterfaceId: "eni-1", Attachment: { DeviceIndex: 0 }, Ipv6Addresses: [{ Ipv6Address: "2600::1" }] },
          ],
        },
      ],
    },
  ],
};

const readyEnv: Canned = {
  "describe-instances": readyInstance,
  "describe-vpcs": {
    Vpcs: [{ Ipv6CidrBlockAssociationSet: [{ Ipv6CidrBlock: "2600:1f18:1234:5600::/56", Ipv6CidrBlockState: { State: "associated" } }] }],
  },
  "describe-subnets": {
    Subnets: [{ Ipv6CidrBlockAssociationSet: [{ Ipv6CidrBlock: "2600:1f18:1234:5600::/64", Ipv6CidrBlockState: { State: "associated" } }] }],
  },
  "describe-route-tables": {
    RouteTables: [
      {
        RouteTableId: "rtb-1",
        Associations: [{ SubnetId: "subnet-1" }],
        Routes: [{ DestinationIpv6CidrBlock: "::/0", GatewayId: "igw-1" }],
      },
    ],
  },
  "describe-security-groups": {
    SecurityGroups: [{ GroupId: "sg-1", IpPermissions: [{ Ipv6Ranges: [{ CidrIpv6: "::/0" }] }] }],
  },
};

describe("ipv6Command", () => {
  let spy: ReturnType<typeof mockAws>;
  afterEach(() => spy?.mockRestore());

  it("has the expected name and positional key", () => {
    expect(ipv6Command.name).toBe("ipv6");
    expect(ipv6Command.positionalKeys).toEqual(["instanceId"]);
  });

  it("passes all six checks for a ready instance", async () => {
    spy = mockAws(readyEnv);
    const result = await run({ instanceId: "i-1", verify: true });
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ passed: 6, failed: 0 });
    expect(result.ipv6Addresses).toEqual(["2600::1"]);
    expect(result.message).toContain("IPv6: 2600::1");
  });

  it("fails with a fix when the interface has no IPv6 address", async () => {
    const noIpv6 = structuredClone(readyInstance);
    noIpv6.Reservations[0]!.Instances[0]!.NetworkInterfaces[0]!.Ipv6Addresses = [];
    spy = mockAws({ ...readyEnv, "describe-instances": noIpv6 });
    const result = await run({ instanceId: "i-1" });
    const check = result.checks.find((c: any) => c.id === "eni-ipv6-address");
    expect(check.ok).toBe(false);
    expect(check.fix).toContain("assign-ipv6-addresses --network-interface-id eni-1");
  });

  it("fails the route check when ::/0 is missing", async () => {
    spy = mockAws({
      ...readyEnv,
      "describe-route-tables": { RouteTables: [{ RouteTableId: "rtb-1", Associations: [{ SubnetId: "subnet-1" }], Routes: [] }] },
    });
    const result = await run({ instanceId: "i-1" });
    expect(result.checks.find((c: any) => c.id === "ipv6-default-route").ok).toBe(false);
  });

  it("fails the security group check without an IPv6 rule", async () => {
    spy = mockAws({
      ...readyEnv,
      "describe-security-groups": { SecurityGroups: [{ GroupId: "sg-1", IpPermissions: [{ Ipv6Ranges: [] }] }] },
    });
    const result = await run({ instanceId: "i-1" });
    expect(result.checks.find((c: any) => c.id === "security-group-ipv6").ok).toBe(false);
  });

  it("stops after the first check when the instance lookup fails", async () => {
    spy = mockAws({ "describe-instances": { fail: "InvalidInstanceID.NotFound" } });
    const result = await run({ instanceId: "i-missing" });
    expect(result.success).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].detail).toContain("InvalidInstanceID.NotFound");
  });

  it("lists instances when no id is given in a non-TTY", async () => {
    spy = mockAws(readyEnv);
    const original = process.stdin.isTTY;
    (process.stdin as any).isTTY = false;
    try {
      const result = await run({});
      expect(result.success).toBe(false);
      expect(result.instances[0].id).toBe("i-1");
    } finally {
      (process.stdin as any).isTTY = original;
    }
  });
});
