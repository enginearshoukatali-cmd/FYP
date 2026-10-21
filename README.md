# BALOCHISTAN ACADMY

An education workspace for students, teachers, and education teams. It includes
classrooms, assignments, quizzes, curriculum browsing, BTBB textbook reading,
and book-grounded AI tools.

## Project structure

- `frontend/` — React, TypeScript, and Vite web application.
- `backend/` — FastAPI application, database schema, and BTBB curriculum tools.

Railway is the current deployment target. The Vercel sections below are optional
instructions for deployments intentionally hosted on Vercel.

## LUAWMS university course materials

In the University Curriculum portal, select a LUAWMS course and choose **AI se
material banwayein** to open the AI Teaching Assistant with course context and
a ready-to-edit request. AI can create a clearly labeled draft from general
subject knowledge. Teachers can attach their approved syllabus, notes, or
authorized book material in the AI chat; when files are attached, AI is
instructed to follow them as the primary source. Generated lessons are drafts
and should be checked against the department-approved syllabus.

## Run locally

### Backend

Use Python 3.11 or newer. From `backend/`, create and activate a virtual
environment, install requirements, configure environment variables, then start
the API:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

Create `backend/.env` locally; do not commit it. At minimum configure:

```dotenv
GEMINI_API_KEY=your-gemini-api-key
JWT_SECRET_KEY=use-a-private-random-secret-at-least-32-characters-long
```

Set up any email-provider variables needed by account recovery in the backend
environment as well.

### Frontend

In a separate terminal, from `frontend/`:

```powershell
npm install
npm run dev
```

The frontend defaults to the API at `http://127.0.0.1:8000` for local
development. In production, configure `API_BASE_URL` on the frontend service.

## Deploy the API to Vercel

Use a separate Vercel project for the API with the repository root directory
set to `backend`. Configure these Production environment variables:

- `GEMINI_API_KEY`
- `JWT_SECRET_KEY` (a private random value of at least 32 characters)
- `DATABASE_URL` (the pooled connection string from the connected Neon database)
- `BLOB_STORE_ID` and either `VERCEL_OIDC_TOKEN` or
  `BLOB_READ_WRITE_TOKEN` from a connected private Vercel Blob store
- `CORS_ORIGINS` and `FRONTEND_URL` set to the deployed frontend origin

On Vercel, `APP_DATA_DIR` defaults to `/tmp`; locally it defaults to the
project directory. The database uses Neon and user-uploaded files use private
Blob storage so they do not depend on the ephemeral function filesystem.
Vercel Functions have a request body size limit, so the API-proxied upload
endpoints cannot reliably accept files larger than 4.5 MB.

The API initializes its database tables on startup. Existing local or
ephemeral SQLite records are not copied into Neon.

## Deploy the frontend to Vercel

Create a separate Vercel project from this repository with the project root
directory set to `frontend` and the framework preset set to Vite. Set this
Production environment variable to the public origin of the deployed API
(without a trailing slash), then redeploy the frontend:

```dotenv
VITE_API_BASE=https://<your-api-project-domain>
```

On the API project, set `CORS_ORIGINS` and `FRONTEND_URL` to the exact public
frontend origin. The Docker-only `API_BASE_URL` setting does not configure a
Vite build deployed directly to Vercel.

## Deploy to Railway

The repository contains separate Dockerfiles for Railway's frontend and API
services. Create two Railway services from this repository and the `main`
branch:

### API service

- Leave the service root directory at the repository root. The root
  `Dockerfile` builds and starts the backend API, so Railway can detect it
  without a monorepo root-directory override.
- Attach a Railway Volume mounted at `/data`.
- Add these service variables:

  ```dotenv
  APP_DATA_DIR=/data
  BTBB_PDF_CACHE_DIR=/data/uploads/curriculum_pdfs
  GEMINI_API_KEY=<your Gemini API key>
  JWT_SECRET_KEY=<a private random value of at least 32 characters>
  CORS_ORIGINS=https://<your-frontend-domain>
  FRONTEND_URL=https://<your-frontend-domain>
  ```

- Set the service health-check path to `/health`.
- Keep one API replica while using SQLite. The database, uploaded files, BTBB
  catalogue cache, and downloaded textbook PDFs are stored under `/data` and
  survive restarts when the volume is attached.

### Frontend service

- Leave the service root directory at the repository root and set the
  Dockerfile path to `frontend/Dockerfile`.
- Set `API_BASE_URL` to the API's public Railway domain, including `https://`
  and without a trailing slash.
- Set the service health-check path to `/health`.
- Add the frontend's final public domain to the API's `CORS_ORIGINS` variable
  (comma-separated if there are multiple origins). Redeploy the API after
  changing the variable.

The frontend image injects `API_BASE_URL` at container startup. Once both
services have public domains, use those exact domains in the variables.
Configure `MAIL_USERNAME`, `MAIL_PASSWORD`, and optionally `SMTP_HOST` /
`SMTP_PORT` on the API service if account recovery is required.

Student submissions, classroom attachments, and teacher resource files are
served through authenticated API endpoints with ownership or classroom checks;
they are not exposed as public static files. Keep the Railway volume attached
to the API service and do not publish its `/data` directory.

## Online classes and meetings

Teachers can schedule meetings for an active classroom; the application only
returns join details to its teacher and enrolled students. Staff and teachers
can schedule private meetings with one another. Meeting records are stored in
the application database, and the video room is embedded in the application
using Jitsi Meet's IFrame API. The default public Jitsi service hosts the video
call; anyone given a room link may try to join it. To use JaaS, set
`JAAS_APP_ID`, `JAAS_API_KEY_ID`, and the matching `JAAS_PRIVATE_KEY` (or
`JAAS_PRIVATE_KEY_PATH`) on the backend only. The backend issues a short-lived,
room-limited JWT to each authenticated participant; never put the private key
or a sample JWT in frontend code. The App ID is public, but the API private key
must stay secret. Camera and microphone access require HTTPS in production
(localhost is permitted for local development).

To pre-cache BTBB textbooks, open the API service shell and run:

```sh
python warm_curriculum_cache.py
```

The script processes books one at a time, skips already-cached PDFs, and can
be rerun to retry BTBB network failures. Use `--include-other-levels` to also
cache Primer and General titles.

## Keep private/generated files out of Git

The root `.gitignore` and `.dockerignore` exclude environment files, local
databases, user uploads, cached PDFs, Python environments, frontend
dependencies, and build output. Never commit production API keys or JWT
secrets. Configure them only in Railway's service variables.
