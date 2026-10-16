import { describe, expect, it } from "bun:test";
import { formatInstanceRow, toInstanceRows } from "../aws-ec2";

describe("toInstanceRows", () => {
  it("flattens reservations and reads the Name tag", () => {
    const data = {
      Reservations: [
        { Instances: [{ InstanceId: "i-1", State: { Name: "running" }, SubnetId: "s-1", Tags: [{ Key: "Name", Value: "web" }] }] },
        { Instances: [{ InstanceId: "i-2" }] },
      ],
    };
    const rows = toInstanceRows(data);
    expect(rows.map((r) => r.id)).toEqual(["i-1", "i-2"]);
    expect(rows[0]!.name).toBe("web");
    expect(rows[1]!.state).toBe("unknown");
  });
});

describe("formatInstanceRow", () => {
  it("includes the 1-based index when given", () => {
    const line = formatInstanceRow({ id: "i-1", state: "running", subnetId: "s-1", name: null }, 0);
    expect(line).toContain("1. i-1");
  });
});

import { toIpv6SubnetRows } from "../aws-ec2";

describe("toIpv6SubnetRows", () => {
  it("keeps only subnets with an associated IPv6 CIDR", () => {
    const data = {
      Subnets: [
        {
          SubnetId: "subnet-1",
          VpcId: "vpc-1",
          AvailabilityZone: "ap-northeast-1a",
          CidrBlock: "10.0.0.0/24",
          Ipv6CidrBlockAssociationSet: [{ Ipv6CidrBlock: "2600::/64", Ipv6CidrBlockState: { State: "associated" } }],
          Tags: [{ Key: "Name", Value: "pub" }],
        },
        { SubnetId: "subnet-2", Ipv6CidrBlockAssociationSet: [] },
        {
          SubnetId: "subnet-3",
          Ipv6CidrBlockAssociationSet: [{ Ipv6CidrBlock: "2601::/64", Ipv6CidrBlockState: { State: "disassociated" } }],
        },
      ],
    };
    const rows = toIpv6SubnetRows(data);
    expect(rows.map((r) => r.id)).toEqual(["subnet-1"]);
    expect(rows[0]!.name).toBe("pub");
  });
});
