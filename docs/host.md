# Design Reference

This document describes the original design goals and architecture decisions behind CipherHost.

## Problem

Deploying applications on Windows Server typically involves:

- RDP into the server
- Manually copying files and creating folders
- Configuring IIS bindings or other reverse proxy rules
- Managing background processes by hand
- Hunting through Event Viewer or scattered log files when something breaks

Running multiple applications on one server adds dependency conflicts (different Node.js or Python versions, port collisions, etc.).

## Approach

CipherHost sits between the developer and the OS. Instead of performing each deployment step manually, the developer provides a git URL or folder path, a start command, and a domain. CipherHost handles the rest: cloning, building, process management, port allocation, and reverse proxy configuration.

## Architecture decisions

**Three layers:**

1. Frontend (React) -- the web UI
2. Backend (Express/Node.js) -- the orchestration service
3. Caddy -- the reverse proxy at the network edge

The frontend and backend are separate processes. The frontend talks to the backend over REST and WebSocket. The backend manages Caddy through its JSON admin API (not Caddyfile), which allows route changes without restarting the proxy.

**Why PM2:** PM2 handles process lifecycle (start, stop, restart, crash recovery) and log management. It is a well-known process manager for Node.js but works for any executable.

**Why Caddy:** Caddy provides automatic SSL certificate provisioning and a JSON API for dynamic configuration. Routing changes do not require a restart, which means deploying a new application does not interrupt existing ones.

**Why SQLite:** All state (deployments, ports, users, audit logs) is stored in a single SQLite file. This avoids the complexity of running a separate database server for what is fundamentally a single-server tool.

## Deployment flow

When a deploy is triggered:

1. Clone the git repo (or copy the local folder) into `apps/<project-id>/`
2. Detect project type by looking for `package.json`, `requirements.txt`, or `.csproj`
3. Install dependencies and run any build command
4. Allocate an available port from the configured range
5. Start the process via PM2
6. Configure Caddy to route the domain to the allocated port
7. Begin health checks at the configured interval

## Port management

Ports are tracked in the `port_registry` SQLite table. When a deployment needs a port, the backend finds the lowest available port in the configured range (default 5000-6000) that is not already allocated.

## Health monitoring

The backend runs HTTP health checks against each running application at a configurable interval (default 30 seconds). If an application fails its health check, PM2 handles the restart. The maximum number of automatic restarts is configurable (default 5) to prevent infinite restart loops.