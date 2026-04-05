# Design Reference

This document describes the design goals and architecture decisions behind CipherHost.

## Problem

Deploying applications on Windows Server typically involves:

- RDP into the server
- Manually copying files and creating folders
- Configuring IIS bindings or other reverse proxy rules
- Managing background processes by hand
- Hunting through Event Viewer or scattered log files when something breaks

Running multiple applications on one server adds dependency conflicts (different Node.js or Python versions, port collisions, etc.). In data center environments, there are additional requirements: the tool must survive reboots, back up its own state, enforce resource limits, integrate with directory services, and support legacy PHP workloads alongside modern Node.js and Python stacks.

## Approach

CipherHost sits between the developer and the OS. Instead of performing each deployment step manually, the developer provides a git URL or folder path, a start command, and a domain. CipherHost handles the rest: cloning, building, process management, port allocation, and reverse proxy configuration.

For enterprise environments, CipherHost also provides Windows Service installation for unattended operation, automated backups with off-server replication, per-application resource monitoring and enforcement, Active Directory integration for centralized authentication, and Apache/PHP support for legacy web applications.

## Architecture decisions

**Four layers:**

1. Frontend (React) -- the web UI
2. Backend (Express/Node.js) -- the orchestration service
3. Caddy -- the reverse proxy at the network edge
4. Apache (optional) -- serves PHP applications with mod_php

The frontend and backend are separate processes. The frontend talks to the backend over REST and WebSocket. The backend manages Caddy through its JSON admin API (not Caddyfile), which allows route changes without restarting the proxy.

**Why PM2:** PM2 handles process lifecycle (start, stop, restart, crash recovery) and log management. It is a well-known process manager for Node.js but works for any executable. The resource monitor polls PM2's process list to collect CPU and memory metrics.

**Why Caddy:** Caddy provides automatic SSL certificate provisioning and a JSON API for dynamic configuration. Routing changes do not require a restart, which means deploying a new application does not interrupt existing ones.

**Why SQLite:** All state (deployments, ports, users, audit logs, resource limits) is stored in a single SQLite file. This avoids the complexity of running a separate database server for what is fundamentally a single-server tool. Backups use `VACUUM INTO` for consistent snapshots without stopping the service.

**Why Apache for PHP:** PM2 is not designed to manage PHP applications. Apache with mod_php is the standard way to serve PHP on Windows. CipherHost generates VirtualHost configuration files and reloads Apache when PHP apps are deployed or removed.

**Why node-windows:** Running CipherHost as a background process that survives reboots and user logoffs requires a Windows Service. `node-windows` provides a clean API to install a Node.js application as a service with automatic restart on failure, without requiring a separate service wrapper.

**Why ldapts:** Enterprise environments use Active Directory for centralized authentication. `ldapts` is a pure-JavaScript LDAP client with no native dependencies, which simplifies installation on Windows Server. It supports bind operations, search, and TLS.

## Deployment flow

When a deploy is triggered:

1. Clone the git repo (or copy the local folder) into `apps/<project-id>/`
2. Detect project type by looking for `package.json`, `requirements.txt`, `.csproj`, `composer.json`, or `index.php`
3. Install dependencies and run any build command
4. Allocate an available port from the configured range
5. For Node.js/Python/.NET: start the process via PM2 and configure Caddy to route the domain
6. For PHP: create an Apache VirtualHost and reload Apache
7. Begin health checks at the configured interval

## Port management

Ports are tracked in the `port_registry` SQLite table. When a deployment needs a port, the backend finds the lowest available port in the configured range (default 5000-6000) that is not already allocated.

## Health monitoring

The backend runs HTTP health checks against each running application at a configurable interval (default 30 seconds). If an application fails its health check, PM2 handles the restart. The maximum number of automatic restarts is configurable (default 5) to prevent infinite restart loops.

## Resource monitoring

The resource monitor polls PM2 every 15 seconds to collect CPU and memory usage per process. If an application exceeds its configured memory limit (stored in the `resource_limits` table), the process is stopped and the event is logged. System-level memory information (total, free) is available through the API for capacity planning.

## Backup strategy

CipherHost backs up its SQLite database on a configurable schedule (default every 24 hours). Backups are SQLite snapshots created with `VACUUM INTO`, which produces a consistent copy without locking the database. A retention policy deletes old backups beyond the configured count. If a network share path is configured, backups are replicated there via robocopy for off-server redundancy.

A separate config export/import mechanism allows migrating the full CipherHost configuration (deployments, env vars, webhooks, domains, users) between instances as a JSON file.

## Authentication

Three authentication methods are supported:

1. JWT tokens issued at login (24-hour expiry)
2. API key in the `X-Api-Key` header (treated as admin)
3. LDAP / Active Directory (optional, falls back from local auth)

LDAP authentication binds as a service account to search for the user, then binds as the user to verify their password. Group memberships are extracted from `memberOf` and mapped to CipherHost roles. User input in LDAP filters is escaped to prevent injection.

Admins can manage all user accounts from the Users page, including changing passwords for any user. Two roles exist: admin (full access) and viewer (read-only).

## Windows Service

CipherHost can be installed as a Windows Service via `node-windows`. The service is configured for automatic startup and restarts up to 3 times on failure with a 10-second delay. Installation and management are available through the System Settings page or via the REST API. The service runs the compiled backend (`dist/index.js`).

## PHP support

PHP applications are served through Apache rather than PM2. The deployment service detects PHP projects, runs `composer install` if applicable, creates an Apache VirtualHost configuration, and reloads Apache. Laravel applications are detected automatically (presence of `artisan`) and receive additional setup: `.env` file creation and `php artisan key:generate`.