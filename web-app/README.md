# Web App (Azure Static Web App)

Static site with a password login page and a protected index page, plus a small managed API
(Node.js Azure Functions hosted by Static Web Apps) that handles the secure cookie.

## How it works

```
Browser ──POST /api/login {password}──▶ SWA managed API ──POST /api/token──▶ C# Function App
                                          │  (validates JWT: signature,     │  (checks AUTH_PASSWORD,
                                          │   issuer, audience, expiry)     │   returns signed JWT)
Browser ◀── Set-Cookie: auth_token ───────┘
            (HttpOnly; Secure; SameSite=Strict; Max-Age = token lifetime)
```

1. **`/login.html`** – the user enters the password. `js/login.js` posts it to `/api/login`.
2. **`/api/login`** calls the function app, **validates the returned JWT** with the shared `JWT_SECRET`
   (HS256, issuer, audience, expiry) and stores it in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie.
   The browser is then redirected to `/index.html`.
3. **`/index.html`** loads `js/auth-guard.js` in `<head>`. The page stays hidden until `/api/verify`
   confirms the cookie holds a valid JWT; otherwise the user is redirected to `/login.html`.
   This happens on every visit, so going to `/` or `/index.html` directly without a valid token
   (missing, expired or tampered) always ends on the login page.
4. **Logout** calls `/api/logout`, which clears the cookie.

The landing page is the RFI Companion. The login page uses its dark palette,
orange accent and rounded controls. The original retail demo is preserved as
`src/index-temp.html`.

> Why a managed API? JavaScript in the browser cannot create `HttpOnly` cookies, and validating an
> HS256 token in the browser would expose the signing secret. The API keeps both on the server.
>
> Note: static files on SWA are publicly downloadable. The guard prevents the page from being shown
> to unauthenticated users, but don't put secrets in static HTML. Serve sensitive data from API
> endpoints that check the cookie (see `api/src/functions/verify.js` as a template).

## API endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/login` | Body `{ "password": "..." }`. 200 + cookie on success, 401 on wrong password, 502 if the function app fails or returns an invalid token |
| GET | `/api/verify` | 200 if the `auth_token` cookie holds a valid JWT, otherwise 401 (and clears the cookie) |
| POST | `/api/logout` | Clears the cookie |

## App settings (API)

| Setting | Required | Description |
|---------|----------|-------------|
| `FUNCTION_APP_TOKEN_URL` | yes | e.g. `https://<func-app>.azurewebsites.net/api/token` |
| `FUNCTION_APP_KEY` | yes in Azure | Function key for the `Token` function (sent as `x-functions-key`) |
| `JWT_SECRET` | yes | Same value as in the function app (≥ 32 bytes) |
| `JWT_ISSUER` | no | Default `auth-function-app` (must match the function app) |
| `JWT_AUDIENCE` | no | Default `static-web-app` (must match the function app) |

## Run locally

Prerequisites: Node.js 20, Azure Functions Core Tools v4, SWA CLI (`npm i -g @azure/static-web-apps-cli`).

1. Start the function app on port 7071 (see [`../function-app/README.md`](../function-app/README.md)).
2. Configure and start the web app:

   ```bash
   cd web-app/api
   npm install
   cp local.settings.sample.json local.settings.json   # set JWT_SECRET to the function app's value
   cd ..
   swa start                                           # uses swa-cli.config.json
   ```

3. Open <http://localhost:4280>. You'll be redirected to the login page.

## Project layout

```
web-app/
├── swa-cli.config.json         # used by `swa start` and `swa deploy`
├── src/                        # static content (app location)
│   ├── index.html              # protected page
│   ├── login.html
│   ├── js/auth-guard.js        # token check + logout for protected pages
│   ├── js/login.js
│   └── staticwebapp.config.json# runtime, routes, security headers (CSP, HSTS, …)
└── api/                        # SWA managed functions (Node 20, v4 model)
    ├── host.json
    ├── package.json
    ├── local.settings.sample.json
    └── src/
        ├── shared/auth.js      # JWT validation + cookie helpers
        └── functions/{login,verify,logout}.js
```

## Deploy

Deployed with `swa deploy`. See [DEPLOYMENT.md](../DEPLOYMENT.md).
