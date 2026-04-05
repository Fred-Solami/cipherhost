# Express Demo App

A simple Express.js application for testing CipherHost deployment.

## Features

- Basic REST API endpoints
- Health check endpoint
- JSON responses
- Environment variable support
- Graceful shutdown handling

## Endpoints

- `GET /` - Welcome message with app info
- `GET /health` - Health check with uptime and memory usage
- `GET /api/users` - Returns a list of sample users
- `POST /api/echo` - Echoes back the request body

## Local Testing

```bash
# Install dependencies
npm install

# Start the server
npm start

# Test endpoints
curl http://localhost:3000
curl http://localhost:3000/health
curl http://localhost:3000/api/users
```

## Deploy with CipherHost

### Option 1: Local Folder Deployment

1. Open CipherHost dashboard
2. Go to Applications > New Deployment
3. Select "Local Folder"
4. Fill in:
   - **Name**: Express Demo
   - **Local Path**: `C:\CipherHost\test-apps\express-demo`
   - **Domain**: `express-demo.local`
   - **Start Command**: `npm start`
5. Click Deploy

### Option 2: Git Deployment

If you push this to a Git repository:

1. Open CipherHost dashboard
2. Go to Applications > New Deployment
3. Select "Git Repository"
4. Fill in:
   - **Name**: Express Demo
   - **Repository URL**: `https://github.com/user/express-demo.git`
   - **Branch**: `main`
   - **Domain**: `express-demo.local`
   - **Start Command**: `npm start`
5. Click Deploy

## Environment Variables

The app uses these environment variables (automatically set by CipherHost):

- `PORT` - Port to listen on (assigned by CipherHost)
- `HOST` - Host to bind to (127.0.0.1 for security)
- `NODE_ENV` - Environment (development/production)

## Testing After Deployment

Once deployed via CipherHost, access it at:

```
http://express-demo.local
http://express-demo.local/health
http://express-demo.local/api/users
```

Or via the assigned port:

```
http://localhost:5000  (or whatever port CipherHost assigned)
```

## Notes

- The app binds to `127.0.0.1` (localhost) for security
- Caddy reverse proxy handles external routing
- PM2 manages the process lifecycle
- Logs are available in CipherHost dashboard
