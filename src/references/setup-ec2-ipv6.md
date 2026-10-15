---
name: Set Up IPv6 on AWS EC2 With the CLI
description: AWS CLI commands to prepare a VPC, subnet, route table and security group for IPv6, then look up an existing EC2 instance ID and verify its IPv6 address, using exported shell variables (VPC_ID, SUBNET_ID, RTB_ID, IGW_ID, SG_ID, INSTANCE_ID) so every command can be pasted as is. Never creates or modifies instances. Load this when the user wants to enable IPv6 on EC2, a VPC, or a subnet.
---

# Set Up IPv6 on AWS EC2 With the CLI

AWS CLI commands for preparing the network for IPv6 on an EC2 instance. This guide never creates or modifies instances. The order is: VPC, subnet, route table, security group, get the instance ID, then verify.

Each step exports a shell variable, so later commands can be pasted without editing. Variables last only for the current terminal session. Always `echo` a variable before running a change; a failed lookup returns the text `None`.

Set the region first (resources are regional):

```bash
export AWS_REGION=<region>
```

VPC itself is free, so enabling IPv6 on it adds no VPC charge.

## Step 1: Export the VPC ID and Add an IPv6 CIDR

List the VPCs in the region:

```bash
aws ec2 describe-vpcs \
  --query 'Vpcs[].[VpcId,CidrBlock,IsDefault,Tags[?Key==`Name`].Value|[0]]' --output table
```

Export the one you want. Either paste the ID:

```bash
export VPC_ID=<vpc-id>
```

Or pick the default VPC automatically:

```bash
export VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)
```

Or pick by Name tag:

```bash
export VPC_ID=$(aws ec2 describe-vpcs --filters Name=tag:Name,Values=<vpc-name> \
  --query 'Vpcs[0].VpcId' --output text)
```

```bash
echo $VPC_ID
```

Add an Amazon-provided IPv6 CIDR to the VPC:

```bash
aws ec2 associate-vpc-cidr-block --vpc-id $VPC_ID --amazon-provided-ipv6-cidr-block
```

Export the assigned block (a /56):

```bash
export VPC_IPV6_CIDR=$(aws ec2 describe-vpcs --vpc-ids $VPC_ID \
  --query 'Vpcs[0].Ipv6CidrBlockAssociationSet[0].Ipv6CidrBlock' --output text)
echo $VPC_IPV6_CIDR
```

To use your own IPv6 block instead, use `--ipv6-cidr-block <cidr> --ipv6-pool <pool-id>`.

## Step 2: Export a Subnet and Assign a /64 CIDR

List the subnets in the VPC (each availability zone has its own subnet):

```bash
aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC_ID \
  --query 'Subnets[].[SubnetId,AvailabilityZone,CidrBlock]' --output table
```

```bash
export SUBNET_ID=<subnet-id>
```

Derive a /64 from the VPC's /56. For example, `2600:1f18:1234:5600::/56` gives `2600:1f18:1234:5600::/64`. Each subnet needs its own different /64 (change the last hex digits: `5600`, `5601`, ...).

```bash
export SUBNET_IPV6_CIDR=$(echo $VPC_IPV6_CIDR | sed 's#00::/56#00::/64#')
echo $SUBNET_IPV6_CIDR
```

```bash
aws ec2 associate-subnet-cidr-block --subnet-id $SUBNET_ID --ipv6-cidr-block $SUBNET_IPV6_CIDR
```

## Step 3: Add the IPv6 Default Route

Find the route table and internet gateway used by the IPv4 default route (`0.0.0.0/0`):

```bash
aws ec2 describe-route-tables --filters Name=vpc-id,Values=$VPC_ID \
  --query 'RouteTables[].[RouteTableId,Routes[?DestinationCidrBlock==`0.0.0.0/0`].GatewayId|[0]]' --output table
```

```bash
export RTB_ID=<rtb-id>
export IGW_ID=<igw-id>
```

Add the IPv6 route with the same gateway:

```bash
aws ec2 create-route --route-table-id $RTB_ID --destination-ipv6-cidr-block ::/0 --gateway-id $IGW_ID
```

## Step 4: Allow IPv6 in the Security Group

IPv4 rules do not cover IPv6. List the security groups in the VPC:

```bash
aws ec2 describe-security-groups --filters Name=vpc-id,Values=$VPC_ID \
  --query 'SecurityGroups[].[GroupId,GroupName]' --output table
```

```bash
export SG_ID=<sg-id>
```

Example rule for SSH over IPv6:

```bash
aws ec2 authorize-security-group-ingress --group-id $SG_ID \
  --ip-permissions 'IpProtocol=tcp,FromPort=22,ToPort=22,Ipv6Ranges=[{CidrIpv6=::/0}]'
```

Narrow `::/0` to your own range where possible.

## Step 5: Export the Instance ID

This guide does not create instances. Use an instance you already have in the VPC. Run `use-aws-cli ipv6 --verify` with no instance ID to list instances and pick one, or list the instances in the VPC manually:

```bash
aws ec2 describe-instances --filters Name=vpc-id,Values=$VPC_ID \
  --query 'Reservations[].Instances[].[InstanceId,State.Name,SubnetId,Tags[?Key==`Name`].Value|[0]]' --output table
```

```bash
export INSTANCE_ID=<instance-id>
echo $INSTANCE_ID
```

If the instance is not in the subnet you prepared in Step 2, IPv6 will not work for it. Check:

```bash
aws ec2 describe-instances --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].[SubnetId,VpcId]' --output text
```

## Step 6: Verify

Run the read-only checks (instance state, VPC and subnet IPv6 CIDR, `::/0` route, security group IPv6 rule, assigned IPv6 address). Each failure prints the exact `aws` fix command:

```bash
use-aws-cli ipv6 $INSTANCE_ID --verify
```

Or check the addresses manually, across all network interfaces:

```bash
aws ec2 describe-instances --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].NetworkInterfaces[].Ipv6Addresses[].Ipv6Address' --output text
```

If the instance has no IPv6 address, assign one to its primary network interface:

```bash
aws ec2 assign-ipv6-addresses --network-interface-id <eni-id> --ipv6-address-count 1
```

On the instance:

```bash
ip -6 addr show
curl -6 https://ifconfig.co
```

If the OS did not pick up the address, enable DHCPv6 on the interface or reboot. Amazon Linux and recent Ubuntu usually do this automatically.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| A command fails with `None` or an empty ID | The variable lookup matched nothing; `echo` it and re-export |
| Instance has no IPv6 address | Subnet has no IPv6 CIDR (Step 2), or the instance's network interface has no IPv6 address assigned yet |
| Has an address but no outbound IPv6 | Missing `::/0` route (Step 3) |
| Cannot connect in from outside | Security group or network ACL lacks IPv6 rules (Step 4) |
| `InvalidParameterValue` on subnet CIDR | The /64 is not inside the VPC's /56, or is already used by another subnet |
