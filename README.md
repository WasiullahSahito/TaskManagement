# Teamo — Team Task Manager

A full-stack team task manager built with React, Vite, Tailwind CSS, Express, Passport, and PostgreSQL. Users can create accounts, make teams, add existing users to teams, and create, assign, filter, update, and delete team tasks.

## Requirements

- Node.js 20 or later
- PostgreSQL 14 or later (local or a managed instance such as Google Cloud SQL)

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

The production session cookie is HTTP-only, secure, same-site lax, and expires after seven days. Production must run behind HTTPS. The server trusts one reverse proxy hop for secure cookies.

## Production build and run

The Express service serves the built React application and API from the same origin:

```sh
npm install
npm run build
npm start
```

For Google Cloud Run with Cloud SQL:

1. Create a PostgreSQL Cloud SQL instance and database; create a dedicated application database user.
2. Build and deploy this directory as a Cloud Run service, attach the Cloud SQL instance, and configure `DATABASE_URL`, `SESSION_SECRET`, and `NODE_ENV=production` as Cloud Run secrets/environment variables. Connect through the Cloud SQL connector or Auth Proxy; it provides the encrypted Cloud SQL transport, so do not expose the database publicly.
3. Allow Cloud Run to connect to Cloud SQL and ensure the service uses HTTPS. Cloud Run provides HTTPS and sets the port through `PORT`.
4. Verify the deployed service's sign-up, sign-in, team, member, and task flows.

Do not commit `.env` or production secrets. Use Secret Manager for production credentials. Database migrations in this starter are idempotent `CREATE TABLE IF NOT EXISTS` statements in `server/schema.sql`; use a versioned migration workflow before evolving the production schema.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET|POST /api/teams`, `PATCH|DELETE /api/teams/:id`
- `GET|POST /api/teams/:id/members` (owners can add users who already have accounts)
- `GET|POST /api/tasks`, `PATCH|DELETE /api/tasks/:id`

All team and task routes require a signed-in user and enforce team membership. Team editing, deleting, and adding members are restricted to owners. Assignees must be members of the task's team.

## Version control

This workspace does not contain an initialized Git repository. Create the GitHub repository and demonstrate the requested branch/PR history by creating a feature branch, pushing it, and opening a pull request before merging.
