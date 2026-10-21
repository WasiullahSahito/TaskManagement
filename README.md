# Teamo — Team Task Manager

A full-stack team task manager built with React, Vite, Tailwind CSS, Express, Passport, and PostgreSQL. Users can create accounts, make teams, add existing users to teams, and create, assign, filter, update, and delete team tasks.

## Requirements

- Node.js 20 or later
- PostgreSQL 14 or later (local or a managed instance such as Neon)

## Run locally

1. Create a PostgreSQL database, for example `team_tasks`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and a unique `SESSION_SECRET`.
3. Install dependencies and start the API and Vite development server:

   ```sh
   npm install
   npm run dev
   ```

4. Visit [http://localhost:5173](http://localhost:5173). The API is available at [http://localhost:3000/api](http://localhost:3000/api); Vite proxies `/api` requests to it.

The API creates the application tables automatically on startup. During development, Express's in-memory session store is used; development sessions are lost when the server restarts. Production uses PostgreSQL-backed sessions.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Production | Long, random secret used to sign session cookies |
| `NODE_ENV` | No | Set to `production` for deployment |
| `PORT` | No | API port; defaults to `3000` |
| `CLIENT_ORIGIN` | No | Allowed browser origin; defaults to `http://localhost:5173` |
| `PG_POOL_MAX` | No | Maximum PostgreSQL connections per API instance; defaults to `3` |

The production session cookie is HTTP-only, secure, same-site lax, and expires after seven days. Production must run behind HTTPS. The server trusts one reverse proxy hop for secure cookies.

## Deploy to Vercel with Neon PostgreSQL (free tiers)

The Vite frontend and Express API are deployed as **two Vercel projects** from the same GitHub repository. PostgreSQL is hosted separately on Neon. The frontend's Vercel rewrite proxies `/api/*` to the API so session cookies remain on the frontend's origin. The database URL is only used by the API and must never be added to the frontend or exposed through a `VITE_` variable.

Vercel's [Hobby plan](https://vercel.com/docs/plans/hobby) is free for personal, non-commercial projects. Neon currently lists a permanent [Free plan](https://neon.com/pricing) with no credit card required. Neon suspends idle compute and resumes it on demand. Provider terms, signup checks, and quotas can change, so check both plan pages before deploying. Vercel does not state a no-card guarantee on its Hobby page, so if the signup flow requests a card, stop rather than adding billing details. This assessment may not qualify as personal use under Vercel's terms if submitted or operated commercially.

### 1. Create a Neon PostgreSQL database

1. Create a free project in the [Neon Console](https://console.neon.tech/). Neon currently states that a payment card is not required for the Free plan.
2. From the project's **Connect** dialog, select the default branch, database, and role, and copy the **pooled** connection string. It resembles `postgresql://USER:PASSWORD@ep-example-pooler.REGION.aws.neon.tech/DB?sslmode=require&channel_binding=require`. Keep it private.
3. The API creates its tables from `server/schema.sql` on startup, so use a database role allowed to create tables. Neon suspends idle free compute and wakes it on a later connection; the first request may take longer.

### 2. Deploy the Express API to Vercel

1. Push the repository to GitHub and import it into Vercel as a project named, for example, `team-task-manager-api`.
2. Set the **Root Directory** to `server` and use Node.js 20 or newer. Vercel runs the default-exported Express app in `server/src/index.js` as a Function; do not configure a build output directory or override the function entry with the local `npm start` command.
3. Add these environment variables to the API project's **Production** environment:

   | Variable | Example/value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `SESSION_SECRET` | A unique, random secret |
   | `CLIENT_ORIGIN` | The frontend's production URL, such as `https://team-task-manager.vercel.app` |
   | `DATABASE_URL` | The pooled Neon connection string |
   | `PG_POOL_MAX` | `3` |

   Generate a session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Configure secrets through Vercel's dashboard or `vercel env`; do not commit them.
4. Deploy the API. Copy its public production deployment URL, for example `https://team-task-manager-api.vercel.app`. Test `https://YOUR-API-URL/api/auth/me` (an unauthenticated JSON `401` is expected). If this opens a Vercel login page instead, disable Deployment Protection for the API's production deployment or use a public production alias; browser-facing API requests cannot pass a Vercel login challenge.

### 3. Deploy the Vite frontend to Vercel

1. Create a second Vercel project from the same repository. Set **Root Directory** to `client`, use the **Vite** framework preset, build command `npm run build`, and output directory `dist`.
2. In [`client/vercel.json`](./client/vercel.json), set the API rewrite destination to the API project's stable production domain, not a one-off deployment URL. This rewrite proxies `/api/*` to the API and the second rewrite provides SPA routing. Keep `/api` requests on the frontend origin so the HTTP-only session cookie works as a first-party cookie.
3. Deploy the frontend, then update the API project's `CLIENT_ORIGIN` to the exact production frontend URL and redeploy the API.
4. Whenever changing API or frontend code, redeploy both projects. Verify registration/login, create a team and task, refresh the page, sign out, and sign back in. A successful login must set the `teamtasks.sid` cookie; if `/api/auth/me` still returns 401 immediately after login, verify the API rewrite points to the current production API domain and that both projects use the latest deployment.

### 4. Preview deployments and connection limits

- Vercel preview deployments use the same rewrite unless you change it. By default, preview frontend builds therefore call the configured API and database. Use a separate preview API/database or avoid testing destructive changes against production data.
- Each warm API Function instance maintains a small PostgreSQL pool (`PG_POOL_MAX`, default `3`). The Neon pooled connection string is important because serverless functions can open multiple short-lived instances. Reduce the pool size if you reach Neon connection limits.
- Set the API's `CLIENT_ORIGIN` to the actual frontend origin. If you later call the API directly from a different browser origin rather than through the Vercel rewrite, configure CORS and cookie settings for that exact origin; do not use a wildcard origin with credentialed requests.

### Free-tier limitations

“Free” does not mean unlimited or guaranteed uptime. Neon Free has usage quotas and scales idle databases to zero; Vercel Hobby is for personal, non-commercial use and has usage limits. Check the linked providers' current plan pages before deploying and monitor usage. If this assessment is considered commercial use, Vercel Hobby may not be permitted.

## Production build and run

The Express service serves the built React application and API from the same origin:

```sh
npm install
npm run build
npm start
```

For a self-hosted or container deployment:

1. Set `DATABASE_URL`, `SESSION_SECRET`, and `NODE_ENV=production` in the host environment.
2. Build the client and start the server with `npm run build` and `npm start`. Ensure the host uses HTTPS.
3. Verify the sign-up, sign-in, team, member, and task flows.

Do not commit `.env` or production secrets. Database migrations in this starter are idempotent `CREATE TABLE IF NOT EXISTS` statements in `server/schema.sql`; use a versioned migration workflow before evolving the production schema.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET|POST /api/teams`, `PATCH|DELETE /api/teams/:id`
- `GET|POST /api/teams/:id/members` (owners can add users who already have accounts)
- `GET|POST /api/tasks`, `PATCH|DELETE /api/tasks/:id`

All team and task routes require a signed-in user and enforce team membership. Team editing, deleting, and adding members are restricted to owners. Assignees must be members of the task's team.

## Version control

This workspace does not contain an initialized Git repository. Create the GitHub repository and demonstrate the requested branch/PR history by creating a feature branch, pushing it, and opening a pull request before merging.
