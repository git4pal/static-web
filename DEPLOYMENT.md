# Deployment to Azure

This guide deploys:

1. **`function-app/`** – C# Azure Function App (Flex Consumption, .NET 10 isolated) that issues JWTs.
2. **`web-app/`** – Azure Static Web App (static pages + managed Node API) deployed with **`swa deploy`**.

```
Browser ─▶ Static Web App (login.html / index.html + /api/*) ─▶ Function App (/api/token)
```

---

## 0. Prerequisites

| Tool | Check |
|------|-------|
| Azure CLI | `az version` |
| .NET 10 SDK | `dotnet --list-sdks` |
| Azure Functions Core Tools v4 | `func --version` |
| Node.js 20 | `node -v` |
| SWA CLI | `swa --version` (install: `npm i -g @azure/static-web-apps-cli`) |
| openssl (to generate secrets) | `openssl version` |

Sign in and pick the subscription:

```bash
az login
az account set --subscription "<subscription-name-or-id>"
```

## 1. Set variables

Run all following steps in the same shell. Resource names for the storage account, function app and
static web app must be globally unique – adjust the suffix.

```bash
SUFFIX=$RANDOM
RG=rg-static-web-auth
LOCATION=eastus2                        # SWA supports: westus2, centralus, eastus2, westeurope, eastasia
STORAGE=stauthfunc$SUFFIX               # 3-24 lowercase letters/digits
FUNC_APP=func-auth-$SUFFIX
SWA_NAME=swa-web-$SUFFIX

AUTH_PASSWORD='<choose-a-strong-password>'
JWT_SECRET=$(openssl rand -base64 48)   # ≥ 32 bytes, shared by both apps
JWT_ISSUER=auth-function-app
JWT_AUDIENCE=static-web-app
```

## 2. Create the resource group

```bash
az group create --name $RG --location $LOCATION
```

## 3. Deploy the Function App

### 3.1 Create a storage account (required by Azure Functions)

```bash
az storage account create \
  --name $STORAGE --resource-group $RG --location $LOCATION \
  --sku Standard_LRS --allow-blob-public-access false --min-tls-version TLS1_2
```

### 3.2 Create the Function App (Flex Consumption, .NET 10 isolated)

```bash
az functionapp create \
  --name $FUNC_APP --resource-group $RG \
  --storage-account $STORAGE \
  --flex-consumption-location $LOCATION \
  --runtime dotnet-isolated --runtime-version 10 \
  --https-only true
```

> Check available runtimes with
> `az functionapp list-flexconsumption-runtimes -l $LOCATION --runtime dotnet-isolated -o table`.

### 3.3 Configure app settings

```bash
az functionapp config appsettings set \
  --name $FUNC_APP --resource-group $RG \
  --settings \
    AUTH_PASSWORD="$AUTH_PASSWORD" \
    JWT_SECRET="$JWT_SECRET" \
    JWT_ISSUER=$JWT_ISSUER \
    JWT_AUDIENCE=$JWT_AUDIENCE \
    JWT_EXPIRY_MINUTES=60 \
  --output none
```

> Production tip: store `AUTH_PASSWORD` and `JWT_SECRET` in Azure Key Vault and use
> [Key Vault references](https://learn.microsoft.com/azure/app-service/app-service-key-vault-references)
> (`@Microsoft.KeyVault(SecretUri=...)`) instead of plain values.

### 3.4 Publish the code

```bash
cd function-app
func azure functionapp publish $FUNC_APP
cd ..
```

The output lists the function URL, e.g. `https://<func-app>.azurewebsites.net/api/token`.

### 3.5 Get the function URL and key

```bash
FUNC_HOST=$(az functionapp show -n $FUNC_APP -g $RG --query defaultHostName -o tsv)
FUNCTION_APP_TOKEN_URL="https://$FUNC_HOST/api/token"
FUNCTION_APP_KEY=$(az functionapp function keys list \
  -n $FUNC_APP -g $RG --function-name Token --query default -o tsv)
echo $FUNCTION_APP_TOKEN_URL
```

### 3.6 Smoke test

```bash
curl -s -X POST "$FUNCTION_APP_TOKEN_URL" \
  -H "x-functions-key: $FUNCTION_APP_KEY" -H "Content-Type: application/json" \
  -d "{\"password\":\"$AUTH_PASSWORD\"}"
# → {"token":"eyJ...","expiresAt":"..."}
```

## 4. Deploy the Static Web App

### 4.1 Create the Static Web App resource

```bash
az staticwebapp create \
  --name $SWA_NAME --resource-group $RG --location $LOCATION \
  --sku Free
```

(No `--source` is given, so no GitHub workflow is created – we deploy with the SWA CLI.)

### 4.2 Configure the managed API app settings

```bash
az staticwebapp appsettings set \
  --name $SWA_NAME --resource-group $RG \
  --setting-names \
    FUNCTION_APP_TOKEN_URL="$FUNCTION_APP_TOKEN_URL" \
    FUNCTION_APP_KEY="$FUNCTION_APP_KEY" \
    JWT_SECRET="$JWT_SECRET" \
    JWT_ISSUER=$JWT_ISSUER \
    JWT_AUDIENCE=$JWT_AUDIENCE \
  --output none
```

`JWT_SECRET`, `JWT_ISSUER` and `JWT_AUDIENCE` **must match** the function app, otherwise every login
returns `502 Received an invalid token`.

### 4.3 Get the deployment token

```bash
SWA_TOKEN=$(az staticwebapp secrets list \
  --name $SWA_NAME --resource-group $RG --query properties.apiKey -o tsv)
```

### 4.4 Install API dependencies

The SWA CLI uploads the `api` folder as-is, so install production dependencies first:

```bash
cd web-app/api
npm ci --omit=dev || npm install --omit=dev
cd ..
```

### 4.5 Deploy with `swa deploy`

From the `web-app` folder (settings come from `swa-cli.config.json`: app location `src`,
API location `api`, Node 20):

```bash
swa deploy --deployment-token "$SWA_TOKEN" --env production
cd ..
```

Equivalent without the config file:

```bash
swa deploy ./src --api-location ./api --api-language node --api-version 20 \
  --deployment-token "$SWA_TOKEN" --env production
```

> Use `--env preview` (or omit `--env`) to deploy to a preview environment first.

### 4.6 Get the site URL

```bash
SWA_HOST=$(az staticwebapp show -n $SWA_NAME -g $RG --query defaultHostname -o tsv)
echo "https://$SWA_HOST"
```

## 5. Verify

1. Open `https://$SWA_HOST/index.html` → you are redirected to `/login.html`.
2. Enter a wrong password → "Invalid password."
3. Enter `$AUTH_PASSWORD` → you land on the index page. In DevTools › Application › Cookies, `auth_token`
   is `HttpOnly`, `Secure`, `SameSite=Strict`.
4. Click **Logout** (or delete the cookie / wait for expiry) and open `/index.html` again → back to login.

CLI check:

```bash
curl -s -i -X POST "https://$SWA_HOST/api/login" -H "Content-Type: application/json" \
  -d "{\"password\":\"$AUTH_PASSWORD\"}" | grep -i -E "^HTTP|set-cookie"
```

## 6. Redeploying

| Change | Command |
|--------|---------|
| Function app code | `cd function-app && func azure functionapp publish $FUNC_APP` |
| Web app / API code | `cd web-app && swa deploy --deployment-token "$SWA_TOKEN" --env production` |
| Rotate password | `az functionapp config appsettings set -n $FUNC_APP -g $RG --settings AUTH_PASSWORD='<new>'` |
| Rotate JWT secret | Update `JWT_SECRET` in **both** apps (steps 3.3 and 4.2). Existing sessions become invalid |

## 7. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Login returns **502** "Authentication service unavailable/error" | Wrong `FUNCTION_APP_TOKEN_URL` / `FUNCTION_APP_KEY`, or function app not running. Check the function app logs: `func azure functionapp logstream $FUNC_APP` |
| Login returns **502** "Received an invalid token" | `JWT_SECRET` / `JWT_ISSUER` / `JWT_AUDIENCE` differ between the apps |
| Function returns **500** | `AUTH_PASSWORD` or `JWT_SECRET` missing, or secret shorter than 32 bytes |
| `/api/*` returns **404** after deploy | API was not deployed – make sure `--api-location ./api` is used and `api/node_modules` exists |
| Redirect loop to login | Cookie blocked – site must be served over HTTPS (Azure always is) |

## 8. Clean up

```bash
az group delete --name $RG --yes --no-wait
```
