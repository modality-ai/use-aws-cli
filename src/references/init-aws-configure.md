---
name: Initialize AWS CLI With aws configure
description: How to set up the AWS CLI for the first time with `aws configure`, including where to get the AWS Access Key ID and Secret Access Key, default region, and output format. Load this when the user is setting up the AWS CLI, has no credentials yet, or asks how to get an Access Key ID.
---

# Initialize AWS CLI With aws configure

`aws configure` prompts for four values and saves them to `~/.aws/credentials` and `~/.aws/config`.

```bash
aws configure
# AWS Access Key ID [None]: AKIA................
# AWS Secret Access Key [None]: ****************************************
# Default region name [None]: us-east-1
# Default output format [None]: json
```

For a named profile:

```bash
aws configure --profile <profile>
```

## How to Get an AWS Access Key ID

An Access Key ID and Secret Access Key are created together for an IAM user. The secret is shown only once.

### Option A: AWS Console (most common)

1. Go to https://console.aws.amazon.com/iam/home#/security_credentials (sign in if asked)
2. Click **Create access key**

Then copy the **Access key ID** and **Secret access key** (or download the `.csv`). The secret is shown only once.

### Option B: Another admin creates it via CLI

```bash
aws iam create-access-key --user-name <iam-user>
```

The output contains `AccessKeyId` and `SecretAccessKey`.

### Don't have an IAM user yet?

Ask your AWS administrator to create one, or create one in **IAM > Users > Create user** and attach only the permissions you need. Avoid creating access keys for the root account.

## The Other Two Prompts

- **Default region name**: for example `us-east-1`, `ap-southeast-1`, `eu-west-1`. Find your resources' region in the Console's top-right region selector.
- **Default output format**: `json` (default), `yaml`, `text`, or `table`.

## Verify the Setup

```bash
aws sts get-caller-identity
```

A successful response shows `UserId`, `Account`, and `Arn`. If it fails, see `reset-aws-cli-access-key.md` for common errors and rotation steps.

## Non-Interactive Setup

```bash
aws configure set aws_access_key_id <ACCESS_KEY_ID> --profile <profile>
aws configure set aws_secret_access_key <SECRET_ACCESS_KEY> --profile <profile>
aws configure set region <region> --profile <profile>
aws configure set output json --profile <profile>
```

## Security Tips

- Never commit `~/.aws/credentials` or keys to git.
- Prefer SSO (`aws configure sso`) over long-lived keys where your organization supports it.
- Rotate keys regularly (see `reset-aws-cli-access-key.md`).
