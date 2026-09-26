# Auth0 setup

Gym Lens uses Auth0 Universal Login for sign-in, account creation, and password reset. Passwords stay with Auth0. The React SDK obtains an access token for the Gym Lens API; FastAPI checks its RS256 signature, issuer, audience, and expiration. The API creates the local account record on the first authenticated request and isolates workouts by the token's subject.

## 1. Create the application

In the [Auth0 dashboard](https://manage.auth0.com/), choose your tenant, then **Applications → Applications → Create Application**:

- Name: `Gym Lens`
- Type: **Single Page Web Applications**
- Under Settings, copy **Domain** and **Client ID**. No client secret is needed.
- Set each of **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins** to:

  ```text
  http://127.0.0.1:5173,http://localhost:5173
  ```

Save changes. The callback is the site origin, with no `/callback` suffix. Use the same hostname throughout a login session. If you change the Vite port, update all three settings.

## 2. Enable login methods

Under **Authentication → Database**, enable an email/password connection (usually `Username-Password-Authentication`) for the Gym Lens application. Keep sign-ups enabled if you want the **Create account** button to register new users. Universal Login provides the **Forgot password?** flow for database users.

Optional: enable Google or another social connection for this application under **Authentication → Social**. Configure your own provider credentials for production. Available connections appear in the hosted login screen; no frontend change is required.

Configure a production email provider and review verification and password-reset email templates before launch. Email verification is not currently a separate access requirement enforced by Gym Lens.

## 3. Register the API

Under **Applications → APIs → Create API**, set:

| Setting | Value |
| --- | --- |
| Name | Gym Lens API |
| Identifier | `https://gymlens-api` |
| Signing algorithm | RS256 |

The identifier is the audience, not a server address; it does not need to resolve. Copy it exactly into both environment files. This app does not require custom permissions or a Management API token.

## 4. Configure this repository

Create the environment files only if they do not already exist:

```powershell
if (!(Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

In `frontend/.env`:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_AUTH0_DOMAIN=YOUR-TENANT.us.auth0.com
VITE_AUTH0_CLIENT_ID=YOUR_SPA_CLIENT_ID
VITE_AUTH0_AUDIENCE=https://gymlens-api
```

In `backend/.env`, retain any existing provider settings and set:

```dotenv
DATABASE_URL=sqlite:///./gymlens.db
AUTH0_DOMAIN=YOUR-TENANT.us.auth0.com
AUTH0_AUDIENCE=https://gymlens-api
CORS_ORIGINS=["http://127.0.0.1:5173","http://localhost:5173"]
```

Use your actual tenant domain without `https://` or a trailing slash. The SPA client ID, domain, and audience are public configuration. Never add an Auth0 client secret to the frontend. SQLite is enough to test accounts locally; an external database and Gemini are not required for login.

Restart both servers in separate terminals:

```powershell
npm run dev
```

```powershell
npm run api
```

If dependencies are missing, first run `npm run setup` and `uv sync --directory backend --locked`.

## 5. Verify the complete flow

1. Open `http://127.0.0.1:5173/history`, select **Create account**, and register on Auth0's hosted screen.
2. Confirm you return to History and the app shows your account name and Connected status.
3. Complete a workout and confirm it saves to your account. Reload History and confirm the session appears.
4. Select **Sign out**, then **Sign in** and confirm your history returns. Sign-out controls are hidden in the training studio; finish your workout and open Overview or History first.
5. Test **Forgot password?** on the hosted login screen with an email/password account.
6. Sign in with a second account and confirm it cannot see the first account's workouts.

Guest workouts remain in their separate browser workspace; signing in does not automatically import them. Tokens use the SDK's default in-memory cache. Reloads attempt to restore the Auth0 session; browsers that block silent session checks may require another interactive sign-in.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Sign in opens Settings | All three frontend Auth0 variables must be set; restart Vite. |
| Callback or logout URL mismatch | Register the exact origin, including scheme, hostname, and port, in the corresponding Auth0 allowlist. |
| Login succeeds but history returns 401 | Both audiences must match the custom API Identifier, both domains must match the token issuer, and the API must use RS256. Sign out and in after changing the audience. |
| Authentication is not configured | Set backend Auth0 variables and restart the API. |
| Failed to fetch / CORS error | Start the API, check `VITE_API_BASE_URL`, and include the frontend origin in backend `CORS_ORIGINS`. |
| Signup or password reset unavailable | Enable the database connection for this application; check its signup setting and email delivery configuration. |
| Session is not restored on reload | Check Allowed Web Origins and browser cookie restrictions; use Sign in again. |

## Production

Add the deployed HTTPS frontend origin to the three Auth0 URL allowlists and backend CORS origins. Set the deployed API origin in `VITE_API_BASE_URL`, then rebuild the frontend: Vite embeds configuration at build time. Configure the web host to serve `index.html` for application routes. Use a persistent production database. Separate development and production Auth0 applications/tenants keep their configuration independent.

References: [Auth0 React quickstart](https://auth0.com/docs/quickstart/spa/react), [React SDK examples](https://github.com/auth0/auth0-react/blob/main/EXAMPLES.md), [Auth0 redirect allowlists](https://auth0.com/docs/authenticate/login/redirect-users-after-login).
