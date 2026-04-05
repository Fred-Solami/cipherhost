# Enterprise Features

This document covers the enterprise-grade features added to CipherHost for data center and production server deployments.

## Windows Service

CipherHost can be installed as a native Windows Service, so it starts automatically on boot and survives user logoffs.

### How it works

The `windows-service.ts` module uses `node-windows` to register an `.exe` wrapper that launches the CipherHost backend via `node dist/index.js`. The service is named `CipherHost` and configured for automatic startup with restart-on-failure (up to 3 retries with a 10-second delay).

### Management

From the System Settings page (admin only), the Service tab shows the current service state and provides buttons to install, uninstall, start, stop, and restart the service. The same actions are available via the API:

```
GET    /api/system/service           -- Current status
POST   /api/system/service/install   -- Install the service
POST   /api/system/service/uninstall -- Remove the service
POST   /api/system/service/start     -- Start the service
POST   /api/system/service/stop      -- Stop the service
POST   /api/system/service/restart   -- Stop then start
```

### Prerequisites

- The backend must be compiled first (`npm run build` in the backend directory)
- The install operation requires administrator privileges on the server
- `node-windows` is included as a dependency -- no separate install needed

### Notes

The service runs under the LocalSystem account by default. If you want to run it under a restricted service account, configure that through the Windows Services management console (`services.msc`) after installation.


## Backup and Disaster Recovery

CipherHost includes built-in backup capabilities for its SQLite database and configuration.

### Database backups

Backups are created using SQLite's `VACUUM INTO` command, which produces a consistent snapshot of the database even while it is in use. Backup files are stored in the configured backup directory (default `C:\CipherHost\backups`) with timestamped filenames.

### Scheduled backups

On startup, CipherHost begins a backup schedule based on the `BACKUP_INTERVAL_HOURS` setting (default 24). Each scheduled run creates a database backup and enforces the retention policy.

### Retention policy

The `BACKUP_RETENTION_COUNT` setting (default 10) controls how many backup files are kept. When a new backup is created, the oldest files beyond this count are deleted automatically.

### Network share copy

If `BACKUP_NETWORK_SHARE` is set to a UNC path (e.g., `\\fileserver\backups\cipherhost`), each backup is also copied to that location using robocopy. This provides off-server redundancy.

### Config export and import

The export endpoint produces a JSON file containing all deployments, environment variables, webhook configs, domain mappings, and user accounts (password hashes are excluded). This file can be imported on another CipherHost instance to recreate the configuration. Duplicate records (matched by ID) are skipped during import.

### API

```
GET    /api/system/backups          -- List all backups with size and timestamp
POST   /api/system/backups          -- Create a backup now
POST   /api/system/backups/restore  -- Restore from a backup file (body: { filename })
GET    /api/system/backups/config   -- Current backup configuration
GET    /api/system/config/export    -- Export full configuration as JSON
POST   /api/system/config/import    -- Import configuration from JSON (body: the export object)
```

### Restore process

Restoring a backup replaces the current database file. The backend must be restarted after a restore for the change to take effect.


## Resource Limits and Monitoring

CipherHost monitors CPU and memory usage for each deployed application and can enforce memory limits.

### How it works

The `resource-monitor.ts` service polls PM2 every 15 seconds to collect CPU percentage and memory usage for each managed process. If an application exceeds its configured `max_memory_mb` limit, the process is stopped automatically and the event is logged.

### Per-application limits

Resource limits are stored in the `resource_limits` table. Each application can have:

- `max_memory_mb` -- Memory ceiling in megabytes. When exceeded, the process is stopped.
- `max_restarts` -- Maximum number of automatic restarts allowed (reserved for future use).

### System overview

The system resources endpoint returns:

- Total and free system memory
- Per-application CPU and memory usage (from PM2)

### API

```
GET    /api/system/resources                    -- System resource overview
GET    /api/deployments/:projectId/resources    -- Limits for a specific app
PUT    /api/deployments/:projectId/resources    -- Set limits (body: { max_memory_mb, max_restarts })
```

### Frontend

The Resources tab on the System Settings page shows a system memory overview and per-application usage bars. Limits can be viewed but must be set via the API or directly in the database for now.


## Apache / PHP Integration

CipherHost can deploy PHP applications through Apache with mod_php, in addition to the standard PM2-based deployments for Node.js, Python, and .NET.

### Project detection

The project detector recognizes PHP projects by looking for `composer.json`, `index.php`, or `public/index.php` in the project root.

### Build process

When a PHP project is detected:

1. If `composer.json` is present, `composer install --no-interaction --optimize-autoloader` is run
2. If the project is a Laravel application (detected by the presence of `artisan`), `.env.example` is copied to `.env` and `php artisan key:generate` is run

### Deployment flow

PHP applications are deployed differently from Node.js/Python/.NET apps:

- Instead of starting a PM2 process, CipherHost creates an Apache VirtualHost configuration file
- The VHost is written to `{APACHE_DIR}/conf/extra/vhosts/cipherhost_{projectId}.conf`
- Apache is reloaded with `httpd -k restart` to pick up the new configuration
- No Caddy reverse proxy route is created (Apache handles HTTP directly)

### VirtualHost configuration

Each PHP app gets a VHost that:

- Listens on the allocated port
- Sets the `DocumentRoot` to the project directory (or `public/` for Laravel)
- Enables `mod_rewrite` with `AllowOverride All` for `.htaccess` support
- Adds `AddHandler application/x-httpd-php .php` and sets `DirectoryIndex index.php`

### Prerequisites

- Apache 2.4+ installed, with `mod_php` and `mod_rewrite` enabled
- PHP 8.0+ (or the version your apps require)
- Composer on PATH (for projects with `composer.json`)
- Set `APACHE_ENABLED=true` and `APACHE_DIR=C:/Apache24` (or your Apache install path) in `.env`

### API

```
GET    /api/system/apache    -- Apache status (installed, running, config directory)
```


## Active Directory / LDAP Authentication

CipherHost can authenticate users against Active Directory or any LDAP-compatible directory server.

### How it works

When `LDAP_ENABLED=true`, the login flow becomes:

1. Try local authentication first (username + bcrypt password hash)
2. If local auth fails (or the user has `LDAP_AUTH` as their password hash), try LDAP
3. LDAP authentication: bind as service account, search for user by `sAMAccountName`, bind as user to verify password
4. Extract group memberships from the `memberOf` attribute
5. Map groups to roles: if any group matches `LDAP_ADMIN_GROUPS`, assign admin; otherwise viewer
6. Create or update the local user record (password hash set to `LDAP_AUTH`)

### Configuration

```env
LDAP_ENABLED=true
LDAP_URL=ldap://dc.example.com:389
LDAP_BASE_DN=DC=example,DC=com
LDAP_BIND_DN=CN=svc-cipherhost,OU=ServiceAccounts,DC=example,DC=com
LDAP_BIND_PASSWORD=service-account-password
LDAP_USER_SEARCH_FILTER=(sAMAccountName={{username}})
LDAP_ADMIN_GROUPS=CipherHost-Admins
LDAP_TLS_REJECT_UNAUTHORIZED=true
```

- `LDAP_URL` -- The LDAP server URL. Use `ldaps://` for TLS.
- `LDAP_BASE_DN` -- The base DN to search under.
- `LDAP_BIND_DN` -- The service account DN used for searching.
- `LDAP_USER_SEARCH_FILTER` -- Filter template. `{{username}}` is replaced with the login username (escaped to prevent LDAP injection).
- `LDAP_ADMIN_GROUPS` -- Comma-separated list of AD group CNs that grant admin access.
- `LDAP_TLS_REJECT_UNAUTHORIZED` -- Set to `false` only in test environments with self-signed certificates.

### Security

- User input in LDAP filters is escaped to prevent injection attacks
- The service account password should be stored securely in `.env` (not committed to version control)
- LDAP users cannot log in with local passwords -- they always authenticate against the directory

### API

```
GET    /api/system/ldap       -- LDAP status (enabled, server URL, base DN)
POST   /api/system/ldap/test  -- Test the LDAP connection (binds with service account)
```

### Frontend

The Integrations tab on the System Settings page shows whether LDAP is enabled and the configured server URL. The test button verifies that the service account can connect to the directory server.


## User Password Management

Admins can change any user's password directly from the Users page. Each user row has a key icon button that opens a modal for entering a new password. The password must be at least 8 characters. This works for both locally-created users and the default admin account.

The backend endpoint is `PUT /api/users/:userId` with `{ "password": "new-password" }` in the request body. This is the same endpoint used for role changes, but with the password field included.

For LDAP-authenticated users, changing the password through CipherHost does not affect their Active Directory password. Their local password hash is set to `LDAP_AUTH` and they continue to authenticate through the directory server.
