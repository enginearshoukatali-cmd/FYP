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

The frontend defaults to the API at `http://127.0.0.1:8000`. Set
`VITE_API_BASE` at build time when the backend uses a different URL.

## BTBB textbook cache

Textbook PDFs are cached by the backend. For Railway deployment, attach a
persistent Volume to the backend service at `/data` and set:

```dotenv
BTBB_PDF_CACHE_DIR=/data/curriculum_pdfs
```

After deployment, run `python warm_curriculum_cache.py` from the backend
service shell to pre-cache digital textbooks for Grades 1–12. It processes
books one at a time, can be rerun to retry failures, and skips PDFs already
cached on the persistent volume. Add `--include-other-levels` to also cache
Primer and General titles.

## Keep private/generated files out of Git

The root `.gitignore` excludes environment files, local databases, user uploads,
cached textbook PDFs, Python environments, frontend dependencies, and build
output. Configure production secrets in the hosting provider's environment
settings rather than committing them.
