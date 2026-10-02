# BALOCHISTAN ACADMY

An education workspace for students, teachers, and education teams. It includes
classrooms, assignments, quizzes, curriculum browsing, BTBB textbook reading,
and book-grounded AI tools.

## Project structure

- `frontend/` — React, TypeScript, and Vite web application.
- `backend/` — FastAPI application, database schema, and BTBB curriculum tools.

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

## Deploy to Railway

The repository contains separate Dockerfiles for Railway's frontend and API
services. Create two Railway services from this repository and the `main`
branch:

### API service

- Leave the service root directory at the repository root and set the
  Dockerfile path to `backend/Dockerfile`.
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
