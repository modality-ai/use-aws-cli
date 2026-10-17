/**
 * Every aws CLI command the tool runs or prints, as `{placeholder}` templates.
 *
 * - `awsQueries`: argv templates (full command incl. leading `aws`; `--output`/`--region` are added by the runner);
 *   rendered by `renderCmdText` (src/lib/aws-command-template) and run through
 *   Bun.spawn — never a shell string.
 * - `awsFixes`: display-only fix commands shown to the user; rendered by `renderCmdText`.
 */

export const awsQueries = {
  describeInstances: "aws ec2 describe-instances",
  describeInstance: "aws ec2 describe-instances --instance-ids {instanceId}",
  describeSubnets: "aws ec2 describe-subnets",
  describeSubnet: "aws ec2 describe-subnets --subnet-ids {subnetId}",
  describeVpc: "aws ec2 describe-vpcs --vpc-ids {vpcId}",
  describeRouteTables: "aws ec2 describe-route-tables --filters Name=vpc-id,Values={vpcId}",
  describeSecurityGroups: "aws ec2 describe-security-groups --group-ids {groupIds}",
} as const;

export const awsFixes = {
  startInstance: "aws ec2 start-instances --instance-ids {instanceId}",
  associateVpcIpv6: "aws ec2 associate-vpc-cidr-block --vpc-id {vpcId} --amazon-provided-ipv6-cidr-block",
  associateSubnetIpv6: "aws ec2 associate-subnet-cidr-block --subnet-id {subnetId} --ipv6-cidr-block {ipv6Cidr}",
  createIpv6Route:
    "aws ec2 create-route --route-table-id {routeTableId} --destination-ipv6-cidr-block ::/0 --gateway-id {gatewayId}",
  allowIpv6Ssh:
    "aws ec2 authorize-security-group-ingress --group-id {groupId} --ip-permissions 'IpProtocol=tcp,FromPort=22,ToPort=22,Ipv6Ranges=[{CidrIpv6=::/0}]'",
  assignIpv6Address: "aws ec2 assign-ipv6-addresses --network-interface-id {eniId} --ipv6-address-count 1",
} as const;
