# Security

## Authentication

CipherHost uses dual authentication. Every API request (except `/health`, `/`, login, and webhooks) must include one of:

1. **JWT token** -- `Authorization: Bearer <token>` header. Tokens are issued by `POST /api/auth/login` and contain `userId`, `username`, and `role`. Verified against the `JWT_SECRET` from `.env`.

2. **API key** -- `X-Api-Key` header. Compared against the `API_KEY` from `.env`. API key requests are treated as admin.

If neither is present, the request gets a 401.

### Default credentials

On first startup, if the users table is empty, CipherHost creates a default admin:

- Username: `admin`
- Password: `admin123`

Change this immediately after first login.

### Roles

Two roles exist: `admin` and `viewer`. Admins can deploy, delete, restart, and manage users. Viewers have read-only access.

## Localhost restriction

In production (`NODE_ENV=production`), the backend only accepts requests from `127.0.0.1` / `::1`. This means external clients cannot hit the API directly -- they must go through Caddy or access the server locally.

In development mode, this restriction is off.

## NPM supply chain

When deploying Node.js applications:

- `--ignore-scripts` is set by default (`DISABLE_NPM_SCRIPTS=true`), which prevents `postinstall` and similar lifecycle hooks from running
- `npm ci` is preferred over `npm install` when a `package-lock.json` is present (`REQUIRE_PACKAGE_LOCK=true`)

Both settings are configurable via `.env`.

## Network model

All deployed applications bind to `127.0.0.1` on their allocated port. External traffic reaches them only through Caddy's reverse proxy. Applications are not directly accessible from the network.

## Service account

The config references a `CipherHostService` Windows account. This is optional -- if you set it up, the idea is to run CipherHost under a restricted account that only has read/write permissions to the `apps/` directory and nothing else, limiting the blast radius if a deployed application is compromised.

Setting this up is manual:

```powershell
New-LocalUser -Name "CipherHostService" -NoPassword -UserMayNotChangePassword
Add-LocalGroupMember -Group "Users" -Member "CipherHostService"

$acl = Get-Acl "C:\CipherHost\apps"
$permission = "CipherHostService","FullControl","ContainerInherit,ObjectInherit","None","Allow"
$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
$acl.SetAccessRule($accessRule)
Set-Acl "C:\CipherHost\apps" $acl
```

## What is not covered

- CipherHost does not scan deployed code for vulnerabilities. It deploys whatever is in the git repo or local folder.
- If an attacker has Windows credentials to the server, they can access CipherHost.
- There is no built-in rate limiting on the login endpoint.
- Git credentials for private repos are not encrypted at rest in the database.

## Audit logging

All deployment actions (deploy, redeploy, rollback, delete, start, stop, restart) are logged to the `audit_logs` table with timestamp, action, project ID, and details. These logs are queryable through the API.

## Recommendations for production

1. Change `JWT_SECRET` and `API_KEY` from the defaults to long random strings.
2. Set `NODE_ENV=production` to enable the localhost restriction.
3. Set up the `CipherHostService` account if you want process isolation.
4. Put the backend behind Caddy so it is not exposed on port 3000 externally.
5. Block port 3000 from external access with a firewall rule.
