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
