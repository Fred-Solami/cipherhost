# Dependency Updates

Last updated: April 4, 2026.

## Backend

Updated from original versions to current:

| Package | Old | Current |
|---------|-----|---------|
| better-sqlite3 | 9.2.2 | 11.8.1 |
| pm2 | 5.3.0 | 5.4.3 |
| eslint | 8.56.0 | 9.18.0 |
| typescript | 5.3.3 | 5.7.2 |
| helmet | 7.1.0 | 8.0.0 |
| uuid | 9.0.1 | 11.0.3 |
| winston | 3.11.0 | 3.17.0 |

Added packages (not in original): `jsonwebtoken`, `bcrypt`, `axios`, `node-windows`, `ldapts`.

- `node-windows` -- Installs and manages CipherHost as a native Windows Service. Provides service install, uninstall, start, stop, and restart operations.
- `ldapts` -- LDAP client for Active Directory authentication. Pure JavaScript, no native dependencies. Used to bind and search against AD/LDAP servers.

### npm overrides

The backend `package.json` includes overrides to resolve known vulnerabilities in PM2's dependency tree:

- `tar` pinned to 7.5.11+ (path traversal fix)
- `glob` updated to 11.0.0
- `rimraf` updated to 6.0.1
- `inflight` replaced with `@zkochan/inflight` (memory leak fix)

## Frontend

| Package | Old | Current |
|---------|-----|---------|
| react-router-dom | 6.21.1 | 7.1.3 |
| @tanstack/react-query | 5.17.9 | 5.62.12 |
| zustand | 4.4.7 | 5.0.2 |
| vite | 5.0.11 | 6.0.5 |
| eslint | 8.56.0 | 9.18.0 |
| typescript | 5.3.3 | 5.7.2 |

## Known issues

PM2 has a low-severity ReDoS vulnerability with no upstream fix available. Since PM2 is only used internally by the backend (not exposed to user input directly), this is accepted as low risk for an on-premise tool.

## Verification

```powershell
cd backend
npm audit

cd ..\frontend
npm audit
```
