# Local Folder Deployment

CipherHost can deploy applications from a local folder on the server, in addition to git repositories.

## When to use this

Use local deployment when the code is already on the server (copied manually, from a network share, or developed locally) and you do not need git-based version tracking.

For git-based deployments with version history and rollback, use the git repository option instead.

## How to deploy

1. Open the CipherHost dashboard
2. Go to Applications, click New Deployment
3. Select Local Folder
4. Fill in:
   - **Application Name** -- any descriptive name
   - **Local Folder Path** -- absolute path to the folder, e.g. `C:\Projects\my-app`
   - **Domain** -- the domain to route to this app, e.g. `myapp.local`
   - **Start Command** -- how to run the app, e.g. `npm start` or `python app.py`
   - **Build Command** (optional) -- e.g. `npm run build`
   - **Environment Variables** (optional) -- one per line, `KEY=value`
5. Click Deploy

## What happens during deployment

1. CipherHost copies the folder to `C:\CipherHost\apps\<project-id>` using `robocopy`. It excludes `node_modules`, `.git`, `venv`, `__pycache__`, `bin`, and `obj` since these are recreated during the build step.
2. Detects the project type by looking for `package.json` (Node.js), `requirements.txt` (Python), or `.csproj` (.NET).
3. Installs dependencies:
   - Node.js: `npm ci` or `npm install`
   - Python: creates a venv, runs `pip install -r requirements.txt`
   - .NET: `dotnet restore` + `dotnet build`
4. Allocates a port from the configured range.
5. Starts the process via PM2.
6. Configures Caddy to route the domain to the allocated port.

## Redeployment

To update a local deployment after changing the source files, use the Redeploy button on the application detail page. This copies the folder contents again and restarts the process.

## Path requirements

- Must be an absolute path: `C:\Projects\my-app`
- Relative paths are not supported
- Network paths (`\\server\share\...`) are not supported -- copy to a local disk first
- The path must exist before deploying

## Troubleshooting

**"Local path does not exist"** -- Double-check the path. Use an absolute path like `C:\Projects\my-app`.

**"Unable to detect project type"** -- Make sure the root of the folder contains `package.json`, `requirements.txt`, or a `.csproj` file.

**Build fails** -- Try running the build command manually in the folder first to check for errors. Check the logs in the application detail page for specifics.

### 3. Test Locally First

Before deploying:
```powershell
cd C:\Projects\my-app
npm install
npm run build
npm start
```

Verify it works, then deploy via CipherHost.

### 4. Document Dependencies

Create a `README.md` with:
- Required Node.js/Python version
- Build instructions
- Environment variables needed
- Start command

### 5. Clean Builds

If you're having issues:
1. Delete `node_modules` or `venv` from source folder
2. Redeploy via CipherHost
3. Fresh dependencies will be installed

## Comparison: Local vs Git Deployment

| Feature | Local Deployment | Git Deployment |
|---------|-----------------|----------------|
| **Speed** | Fast (local copy) | Slower (Git clone) |
| **Version Control** | Manual | Automatic |
| **Rollback** | Manual | Easy (change branch) |
| **Updates** | Redeploy required | Pull latest |
| **Source Location** | On server | Remote repository |
| **Best For** | Development, legacy apps | Production, team projects |

## Security Considerations

### File Permissions

- CipherHost copies files with the same permissions
- Ensure sensitive files (`.env`, keys) are not in source folder
- Use CipherHost environment variables for secrets

### Path Validation

- CipherHost validates the path exists before deployment
- Only local paths are allowed (no network shares)
- Path must be accessible by CipherHost service account

### Excluded Files

- `.git` folder is excluded (no Git history copied)
- `node_modules` excluded (prevents malicious packages)
- Virtual environments excluded (recreated fresh)

## API Usage

You can also deploy local folders via the API:

```bash
curl -X POST http://localhost:3000/api/deployments \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "name": "My App",
    "localPath": "C:\\Projects\\my-app",
    "domain": "myapp.local",
    "startCommand": "npm start",
    "buildCommand": "npm run build"
  }'
```

**Note:** Use double backslashes (`\\`) in JSON for Windows paths.

## Conclusion

Local folder deployment is perfect for:
- Quick deployments of local projects
- Legacy applications without Git
- Development and testing on the server
- Applications with manual deployment workflows

For production applications with teams, Git deployment is recommended for better version control and collaboration.
