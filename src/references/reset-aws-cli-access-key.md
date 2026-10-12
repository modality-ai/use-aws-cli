---
name: Reset AWS CLI Access Key
description: Step-by-step commands for resetting (rotating) an IAM user's AWS CLI access key and updating the local credentials. Load this when the user wants to reset, rotate, replace, or recover an AWS CLI access key, or when the current key is leaked, expired, or rejected.
---

# Reset AWS CLI Access Key

AWS does not let you view an existing secret access key again. "Resetting" means creating a new key, switching the CLI to it, then disabling and deleting the old key.

## Quick Local Reset (Easiest)

If you only want the CLI to forget its current key, remove the local credentials file:

```bash
rm ~/.aws/credentials
```

Then set up a key again:

```bash
aws configure
```

This only clears the local copy. The old key stays valid in IAM until you deactivate or delete it (Step 5), so it does not help if the key was leaked. Check `~/.aws/config` and the `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_PROFILE` environment variables too, since they can override the file.

## Before You Start

- An IAM user can have at most **2 access keys**. If the user already has 2, delete one first (Step 5).
- You need working credentials (or console access) with permission for `iam:CreateAccessKey`, `iam:UpdateAccessKey`, `iam:DeleteAccessKey`, and `iam:ListAccessKeys`.
- Confirm which profile and identity are in use:

```bash
aws sts get-caller-identity --profile <profile>
```

## Step 1: List Current Keys

```bash
aws iam list-access-keys --user-name <iam-user>
```

Note the `AccessKeyId` of the key being replaced (the old key).

## Step 2: Create a New Key

```bash
aws iam create-access-key --user-name <iam-user>
```

The output contains `AccessKeyId` and `SecretAccessKey`. The secret is shown **only once**, so copy it now and never commit it to git.

## Step 3: Update the Local CLI Credentials

Interactive:

```bash
aws configure --profile <profile>
```

Non-interactive:

```bash
aws configure set aws_access_key_id <NEW_ACCESS_KEY_ID> --profile <profile>
aws configure set aws_secret_access_key <NEW_SECRET_ACCESS_KEY> --profile <profile>
```

Credentials are stored in `~/.aws/credentials`.

## Step 4: Verify the New Key Works

```bash
aws sts get-caller-identity --profile <profile>
```

The returned `Arn` should match the IAM user. Do not continue until this succeeds.

## Step 5: Deactivate, Then Delete the Old Key

Deactivate first so you can roll back if something still depends on it:

```bash
aws iam update-access-key --user-name <iam-user> --access-key-id <OLD_ACCESS_KEY_ID> --status Inactive
```

After confirming nothing breaks, delete it permanently:

```bash
aws iam delete-access-key --user-name <iam-user> --access-key-id <OLD_ACCESS_KEY_ID>
```

## If the Old Key Is Already Unusable (Locked Out)

The CLI cannot create a new key without valid credentials. Use one of these:

1. Sign in to the AWS Console, then go to IAM > Users > your user > Security credentials > Create access key.
2. Ask an administrator to run `aws iam create-access-key --user-name <iam-user>` for you.
3. Root account only: Console > account menu > Security credentials > Access keys.

## If the Key Was Leaked

1. Deactivate it immediately (`update-access-key --status Inactive`).
2. Review CloudTrail for activity by that key (`aws cloudtrail lookup-events --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=<KEY_ID>`).
3. Create a replacement key and delete the leaked one.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `LimitExceeded` on create | User already has 2 keys | Delete or deactivate one, then retry |
| `InvalidClientTokenId` | Wrong or deleted key in the profile | Re-run Step 3 with the new key |
| `SignatureDoesNotMatch` | Secret key mistyped or has extra whitespace | Re-enter the secret carefully |
| `AccessDenied` on IAM calls | Missing IAM permissions | Use an admin or the console |

## Tips

- Prefer short-lived credentials (`aws configure sso`) over long-lived access keys where possible.
- Rotate keys regularly (every 90 days is a common policy).
