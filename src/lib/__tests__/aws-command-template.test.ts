import { describe, expect, it } from "bun:test";
import { awsFixes, awsQueries } from "../../config/aws-commands";
import { renderCmdText } from "../aws-command-template";

describe("renderCmdText", () => {
  it("substitutes a single placeholder", () => {
    expect(renderCmdText(awsQueries.describeVpc, { vpcId: "vpc-1" })).toBe(
      "aws ec2 describe-vpcs --vpc-ids vpc-1",
    );
  });

  it("space-joins array variables", () => {
    expect(renderCmdText(awsQueries.describeSecurityGroups, { groupIds: ["sg-1", "sg-2"] })).toBe(
      "aws ec2 describe-security-groups --group-ids sg-1 sg-2",
    );
  });

  it("substitutes a placeholder embedded inside a token", () => {
    expect(renderCmdText(awsQueries.describeRouteTables, { vpcId: "vpc-1" })).toBe(
      "aws ec2 describe-route-tables --filters Name=vpc-id,Values=vpc-1",
    );
  });

  it("returns a template without placeholders unchanged", () => {
    expect(renderCmdText(awsQueries.describeInstances)).toBe("aws ec2 describe-instances");
  });

  it("throws on a missing variable", () => {
    expect(() => renderCmdText(awsQueries.describeVpc, {})).toThrow("Missing template variable: vpcId");
  });

  it("keeps the quoted ip-permissions fix intact", () => {
    expect(renderCmdText(awsFixes.allowIpv6Ssh, { groupId: "sg-1" })).toBe(
      "aws ec2 authorize-security-group-ingress --group-id sg-1 --ip-permissions 'IpProtocol=tcp,FromPort=22,ToPort=22,Ipv6Ranges=[{CidrIpv6=::/0}]'",
    );
  });
});
