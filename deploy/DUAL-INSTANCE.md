# Shared Tradeify and vest entry

The two workspaces run as separate containers and use separate persistent data
directories. The shared entry page does not copy or exchange OAuth refresh tokens.

With the current AWS address, the links are:

- Shared choice page: `https://control.3.95.194.104.sslip.io`
- Tradeify (Folder 1): `https://3.95.194.104.sslip.io`
- vest (Folder 2): `https://vest.3.95.194.104.sslip.io`

There is no Account Control username or password. Google OAuth remains separate for
each workspace because `Tradeify` and `vest` use different Google Cloud OAuth clients.

## Data safety

The AWS update moves the existing legacy directory
`/opt/account-control-center/data` to `data-tradeify` exactly once. This preserves the
existing Tradeify encrypted tokens and account data. vest uses `data-vest`; no token is
copied from Tradeify to vest.

Before replacing code, the remote script creates a timestamped `data*` backup under
`/opt/account-control-backups`.

## Deploy

On the Mac, build the private deployment archive. It includes source code and only the
OAuth client configuration needed by the server; refresh tokens and the vault key are
never added to Git.

```bash
./deploy/build-aws-dual-bundle.sh ~/Downloads/account-control-dual-update.tar.gz
```

Upload that archive to CloudShell as:

```text
~/account-control-dual-update.tar.gz
```

Then in CloudShell run:

```bash
tar -xOf ~/account-control-dual-update.tar.gz ./tradeify/deploy/cloudshell-apply-dual.sh > ~/cloudshell-apply-dual.sh
bash ~/cloudshell-apply-dual.sh
```

For a direct SSH deploy from a machine that has the EC2 key:

```bash
./deploy/aws-ec2-dual-deploy.sh ec2-3-95-194-104.compute-1.amazonaws.com ./account-control-center-key.pem 3.95.194.104.sslip.io
```

## Google OAuth callback URLs

Tradeify keeps its existing callback:

```text
https://3.95.194.104.sslip.io/oauth/callback
```

Before connecting a vest account on AWS, add this exact authorized redirect URI to the
**vest Account Control Center** Web OAuth client in the `vest-514611` Google Cloud
project:

```text
https://vest.3.95.194.104.sslip.io/oauth/callback
```
