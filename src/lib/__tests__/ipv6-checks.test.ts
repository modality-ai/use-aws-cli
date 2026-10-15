import { describe, expect, it } from "bun:test";
import { buildResult, collectIpv6Addresses, findIpv6DefaultRoute } from "../ipv6-checks";

describe("collectIpv6Addresses", () => {
  it("finds an address on a secondary interface", () => {
    const enis = [{ Ipv6Addresses: [] }, { Ipv6Addresses: [{ Ipv6Address: "2600::1" }] }];
    expect(collectIpv6Addresses(enis)).toEqual(["2600::1"]);
  });

  it("returns empty when no interface has an address", () => {
    expect(collectIpv6Addresses([{ Ipv6Addresses: [] }, {}])).toEqual([]);
  });
});

describe("findIpv6DefaultRoute", () => {
  it("accepts an internet gateway route", () => {
    const route = { DestinationIpv6CidrBlock: "::/0", GatewayId: "igw-1" };
    expect(findIpv6DefaultRoute([route])).toBe(route);
  });

  it("accepts an egress-only gateway route", () => {
    const route = { DestinationIpv6CidrBlock: "::/0", EgressOnlyInternetGatewayId: "eigw-1" };
    expect(findIpv6DefaultRoute([route])).toBe(route);
  });

  it("rejects a non-default or local-only route", () => {
    expect(findIpv6DefaultRoute([{ DestinationIpv6CidrBlock: "::/0", GatewayId: "local" }])).toBeUndefined();
  });
});

describe("buildResult", () => {
  it("reports success when every check passes", () => {
    const result = buildResult("i-1", [{ id: "a", name: "A", ok: true, detail: "" }]);
    expect(result.success).toBe(true);
  });

  it("lists failed check ids in the message", () => {
    const result = buildResult("i-1", [{ id: "a", name: "A", ok: false, detail: "" }]);
    expect(result.message).toContain("failed: a");
  });
});
