---
name: Create an S3 Bucket and Access Keys With the CLI
description: AWS CLI commands to create an S3 bucket, create a dedicated IAM user with S3 permission limited to that bucket, and generate its access key (S3_KEY) and secret (S3_SECRET), using exported shell variables so every command can be pasted as is. Load this when the user wants to create an S3 bucket, give an app S3 access, or get an S3 key and secret.
---

# Create an S3 Bucket and Access Keys With the CLI

The order is: bucket, IAM user, bucket-scoped policy, access key. Each step exports a shell variable so later commands can be pasted without editing. Variables last only for the current terminal session. Always `echo` a variable before running a change.

Your own credentials need permission for `s3:CreateBucket`, `iam:CreateUser`, `iam:PutUserPolicy` and `iam:CreateAccessKey`. Check who you are:

```bash
aws sts get-caller-identity
```

## Step 1: Create the Bucket

Bucket names are globally unique, lowercase, 3-63 characters.

```bash
export AWS_REGION=<region>
export BUCKET=<globally-unique-bucket-name>
echo $BUCKET
```

Create the bucket with a location constraint (use a region other than `us-east-1`; `us-east-1` rejects this flag):

```bash
aws s3api create-bucket --bucket $BUCKET --region $AWS_REGION \
  --create-bucket-configuration LocationConstraint=$AWS_REGION
```

Keep the bucket private (recommended):

```bash
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Check it:

```bash
aws s3 ls | grep $BUCKET
```

## Step 2: Create an IAM User for the Bucket

Use a dedicated user, not your own admin key.

```bash
export S3_USER=<iam-user-name>
aws iam create-user --user-name $S3_USER
```

## Step 3: Grant S3 Permission Limited to the Bucket

Write the policy file (read, write, delete objects and list the bucket):

```bash
cat > s3-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::$BUCKET"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::$BUCKET/*"
    }
  ]
}
EOF
```

Attach it to the user:

```bash
aws iam put-user-policy --user-name $S3_USER --policy-name s3-$BUCKET --policy-document file://s3-policy.json
```

For read-only access, keep only `s3:ListBucket`, `s3:GetBucketLocation` and `s3:GetObject`.

## Step 4: Create the Key and Secret

The first value is the **s3-key** (Access Key ID, starts with `AKIA`). The second is the **s3-secret** (Secret Access Key). AWS shows the secret only once, so save it now. To export both:

```bash
read S3_KEY S3_SECRET < <(aws iam create-access-key --user-name $S3_USER \
  --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
export S3_KEY S3_SECRET
echo $S3_KEY
echo $S3_SECRET
```

Do not `echo` the secret, commit it, or paste it into chat. A user can have at most 2 keys; see reset-aws-cli-access-key.md to rotate.

## Step 5: Verify With the New Key

```bash
echo hello > test.txt
AWS_ACCESS_KEY_ID=$S3_KEY AWS_SECRET_ACCESS_KEY=$S3_SECRET \
  aws s3 cp test.txt s3://$BUCKET/test.txt
AWS_ACCESS_KEY_ID=$S3_KEY AWS_SECRET_ACCESS_KEY=$S3_SECRET \
  aws s3 ls s3://$BUCKET/
```

Optionally save it as a profile:

```bash
aws configure set aws_access_key_id $S3_KEY --profile s3-app
aws configure set aws_secret_access_key $S3_SECRET --profile s3-app
aws configure set region $AWS_REGION --profile s3-app
```

## Cleanup

```bash
aws s3 rm s3://$BUCKET --recursive
aws s3api delete-bucket --bucket $BUCKET
aws iam delete-access-key --user-name $S3_USER --access-key-id $S3_KEY
aws iam delete-user-policy --user-name $S3_USER --policy-name s3-$BUCKET
aws iam delete-user --user-name $S3_USER
```

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `BucketAlreadyExists` | The name is taken globally; pick another |
| `IllegalLocationConstraintException` | Missing `LocationConstraint` outside `us-east-1` |
| `AccessDenied` on upload | Policy bucket name differs from `$BUCKET`, or the policy is not attached |
| `LimitExceeded` creating the key | User already has 2 keys; delete one |
| `InvalidAccessKeyId` | Wrong key, or the key was deleted or deactivated |
