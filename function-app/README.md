# Auth Function App (C#)

Azure Functions app (.NET 10, isolated worker) that validates a password and issues a signed JWT.
It is called server-to-server by the Static Web App API in [`../web-app`](../web-app/README.md).

## Endpoint

`POST /api/token` &nbsp;·&nbsp; auth level: **Function** (requires `x-functions-key` header or `?code=` in Azure)

Request:

```json
{ "password": "..." }
```

Responses:

| Status | Body | When |
|--------|------|------|
| 200 | `{ "token": "<jwt>", "expiresAt": "<utc>" }` | Password matches `AUTH_PASSWORD` |
| 400 | `{ "error": "..." }` | Missing/invalid body |
| 401 | `{ "error": "Invalid password." }` | Wrong password |
| 500 | – | Settings missing or `JWT_SECRET` < 32 bytes |

The JWT is signed with **HS256** using `JWT_SECRET` and contains `iss`, `aud`, `sub`, `iat`, `nbf`, `exp`.
The password comparison is constant-time.

## App settings

| Setting | Required | Description |
|---------|----------|-------------|
| `AUTH_PASSWORD` | yes | The password users must enter |
| `JWT_SECRET` | yes | HMAC signing key, **at least 32 bytes**. Must match the web-app API setting |
| `JWT_ISSUER` | no | Default `auth-function-app` |
| `JWT_AUDIENCE` | no | Default `static-web-app` |
| `JWT_EXPIRY_MINUTES` | no | Default `60` |

## Run locally

Prerequisites: .NET 10 SDK, Azure Functions Core Tools v4.

```bash
cd function-app
cp local.settings.sample.json local.settings.json   # then edit the values
func start --port 7071
```

Test:

```bash
curl -X POST http://localhost:7071/api/token \
  -H "Content-Type: application/json" \
  -d '{"password":"<your-password>"}'
```

(Function keys are not enforced when running locally.)

## Project layout

```
function-app/
├── AuthFunctionApp.csproj
├── Program.cs                 # host setup + Application Insights
├── TokenFunction.cs           # POST /api/token
├── host.json
└── local.settings.sample.json # copy to local.settings.json (git-ignored)
```

## Deploy

See [DEPLOYMENT.md](../DEPLOYMENT.md).
