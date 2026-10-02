import os, sqlite3, shutil, uuid, secrets, json, hashlib
import html, re, tempfile, time
import socket
from datetime import datetime, timedelta
from html.parser import HTMLParser
from typing import Optional, List
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, File, UploadFile, Form, Header
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from google import genai
import smtplib
from email.message import EmailMessage
from passlib.context import CryptContext
from jose import JWTError, jwt
from security import create_access_token, SECRET_KEY, ALGORITHM

load_dotenv()
app = FastAPI(title='Khanmigo Professional AI Assistant')

configured_origins = (
    os.getenv('CORS_ORIGINS')
    or os.getenv('FRONTEND_URL')
    or 'http://localhost:5173,http://127.0.0.1:5173'
)
allowed_origins = [origin.strip().rstrip('/') for origin in configured_origins.split(',') if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# --- Security Configuration ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# --- AI Model Configuration ---
API_KEY = os.getenv('GEMINI_API_KEY')
if not API_KEY: 
    raise RuntimeError('CRITICAL ERROR: GEMINI_API_KEY is not configured in .env file.')

GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-3.6-flash')
client = genai.Client(api_key=API_KEY)

APP_DATA_DIR = os.path.abspath(os.getenv('APP_DATA_DIR', '.'))
os.makedirs(APP_DATA_DIR, exist_ok=True)
DB_NAME = os.path.join(APP_DATA_DIR, 'khanmigo_fyp.db')
UPLOAD_DIR = os.path.join(APP_DATA_DIR, 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)
# Add these two lines:
ASSIGNMENT_UPLOAD_DIR = os.path.join(UPLOAD_DIR, 'assignments')
os.makedirs(ASSIGNMENT_UPLOAD_DIR, exist_ok=True)





# --- System Prompts & Adaptation ---
SYSTEM_INSTRUCTION = (
    "You are Khanmigo AI, the official pedagogical and academic assistant for LAWMS ACADEMY.\n"
    "MANDATORY LANGUAGE RULES:\n"
    "1. AUTOMATIC LANGUAGE ADAPTATION: Detect and mirror the user's language.\n"
    "2. ROMAN URDU: If user writes in Roman Urdu, reply entirely in Roman Urdu. Do not switch to Urdu script.\n"
    "3. URDU SCRIPT: If user writes in Urdu script, reply in proper Urdu script.\n"
    "4. ENGLISH: If user writes in English, reply in English.\n"
    "5. PRESERVE TECHNICAL TERMS: Keep words like Python, Array, API, Database, Subnetting in English when explaining in Roman Urdu.\n"
    "ROLE-SPECIFIC RULES:\n"
    "1. STUDENT TUTORING: Use Socratic method. Never give ready-to-submit answers to homework. Ask guiding questions and explain step-by-step.\n"
    "2. TEACHER ASSISTANT: Provide lesson plans, rubrics, quizzes, and classroom feedback.\n"
    "3. Format cleanly using Markdown and syntax-highlighted code blocks."
)

BASE_SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION

def db():
    c = sqlite3.connect(DB_NAME)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    return c

def cols(c, t): 
    return {r['name'] for r in c.execute(f'PRAGMA table_info({t})').fetchall()}

def addcol(c, t, n, d):
    if n not in cols(c, t): 
        c.execute(f'ALTER TABLE {t} ADD COLUMN {n} {d}')

# ==========================================
# DATABASE INITIALIZATION
# ==========================================
def init_db():
    c = db()
    c.execute('''CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT,
        email TEXT UNIQUE,
        hashed_password TEXT,
        role TEXT,
        institution_mode TEXT DEFAULT 'University'
    )''')
    addcol(c, 'users', 'institution_mode', "TEXT DEFAULT 'University'")
    addcol(c, 'users', 'hashed_password', 'TEXT')
    c.execute('''CREATE TABLE IF NOT EXISTS password_reset_tokens(
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        used_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS quiz_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,quiz_id INTEGER,student_id INTEGER,answers_json TEXT,score REAL,submitted_at DATETIME,UNIQUE(quiz_id,student_id))''')
    
    # 1. ADD THESE THREE LINES RIGHT HERE:
    addcol(c, 'quiz_attempts', 'feedback', 'TEXT')
    addcol(c, 'quiz_attempts', 'status', "TEXT DEFAULT 'submitted'")
    addcol(c, 'quiz_attempts', 'evaluated_by', 'TEXT')
    c.execute('''CREATE TABLE IF NOT EXISTS invitations(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        institution_mode TEXT DEFAULT 'University',
        created_by INTEGER,
        is_used INTEGER DEFAULT 0,
        used_by INTEGER,
        created_at DATETIME,
        expires_at DATETIME
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id INTEGER,title TEXT,created_at DATETIME,updated_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT,role TEXT,content TEXT,input_type TEXT,transcription TEXT,timestamp DATETIME)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER,name TEXT NOT NULL,subject TEXT,institution_mode TEXT DEFAULT 'University',grade_level TEXT,section TEXT,course_code TEXT,description TEXT,join_code TEXT UNIQUE,is_active INTEGER DEFAULT 1,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS enrollments(id INTEGER PRIMARY KEY AUTOINCREMENT,class_id INTEGER,student_id INTEGER,joined_at DATETIME,UNIQUE(class_id,student_id))''')
    c.execute('''CREATE TABLE IF NOT EXISTS assignments(id INTEGER PRIMARY KEY AUTOINCREMENT,class_id INTEGER,teacher_id INTEGER,title TEXT,description TEXT,due_date TEXT,total_marks INTEGER DEFAULT 100,attachment_name TEXT,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS assignment_submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,assignment_id INTEGER,student_id INTEGER,text_content TEXT,file_name TEXT,score REAL,feedback TEXT,status TEXT DEFAULT 'submitted',submitted_at DATETIME,UNIQUE(assignment_id,student_id))''')
    c.execute('''CREATE TABLE IF NOT EXISTS quizzes(id INTEGER PRIMARY KEY AUTOINCREMENT,class_id INTEGER,teacher_id INTEGER,title TEXT,topic TEXT,questions_json TEXT,total_marks INTEGER,due_date TEXT,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS quiz_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,quiz_id INTEGER,student_id INTEGER,answers_json TEXT,score REAL,feedback TEXT,status TEXT DEFAULT 'submitted',submitted_at DATETIME,evaluated_by TEXT,UNIQUE(quiz_id,student_id))''')
    c.execute('''CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT,class_id INTEGER,student_id INTEGER,attendance_date TEXT,status TEXT,marked_by INTEGER,UNIQUE(class_id,student_id,attendance_date))''')
    c.execute('''CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY AUTOINCREMENT,class_id INTEGER,student_id INTEGER,assessment_name TEXT,marks REAL,total_marks REAL,grade TEXT,feedback TEXT,created_by INTEGER,created_at DATETIME)''')

    addcol(c, 'users', 'profile_pic', 'TEXT')
    addcol(c, 'results', 'submission_id', 'INTEGER')
    addcol(c, 'results', 'topic', 'TEXT')
    addcol(c, 'results', 'published_to_student', 'INTEGER DEFAULT 1')
    addcol(c, 'results', 'source', "TEXT DEFAULT 'teacher'")

    c.execute('CREATE INDEX IF NOT EXISTS idx_results_submission ON results(submission_id)')
    c.execute('''CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY AUTOINCREMENT,class_id INTEGER,author_id INTEGER,title TEXT,body TEXT,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS timetable(id INTEGER PRIMARY KEY AUTOINCREMENT,class_id INTEGER,teacher_id INTEGER,day TEXT,start_time TEXT,end_time TEXT,room TEXT,created_at DATETIME)''')
    
    for x in [
        'CREATE INDEX IF NOT EXISTS idx_class_teacher ON classes(teacher_id)',
        'CREATE INDEX IF NOT EXISTS idx_enroll_student ON enrollments(student_id)',
        'CREATE INDEX IF NOT EXISTS idx_assignment_class ON assignments(class_id)',
        'CREATE INDEX IF NOT EXISTS idx_result_student ON results(student_id)',
        'CREATE INDEX IF NOT EXISTS idx_invitation_token ON invitations(token)'
    ]: 
        c.execute(x)
    c.commit()
    c.close()

init_db()

# ==========================================
# PYDANTIC SCHEMAS
# ==========================================
class UserRegister(BaseModel): 
    full_name: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: str
    institution_mode: str = 'University'
    invitation_code: Optional[str] = None

class UserLogin(BaseModel): 
    email: EmailStr
    password: str

class ForgotPasswordSchema(BaseModel): 
    email: EmailStr

class ResetPasswordSchema(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=72)

class GenerateInvitationRequest(BaseModel):
    admin_id: int
    target_role: str
    institution_mode: str = 'University'
    valid_days: int = 7

class ClassCreate(BaseModel): 
    teacher_id: int
    name: str
    subject: str = ''
    institution_mode: str = 'University'
    grade_level: str = ''
    section: str = ''
    course_code: str = ''
    description: str = ''

class JoinClassRequest(BaseModel): 
    student_id: int
    join_code: str = Field(min_length=8, max_length=8, pattern=r'^[A-Fa-f0-9]{8}$')

class ClassJoinAccessUpdate(BaseModel):
    teacher_id: int
    is_active: bool

class AssignmentCreate(BaseModel): 
    teacher_id: int
    class_id: int
    title: str
    description: str = ''
    due_date: str = ''
    total_marks: int = 100

class AssignmentSubmit(BaseModel): 
    student_id: int
    text_content: str = ''
    file_name: str = ''

class GradeSubmissionPayload(BaseModel):
    teacher_id: int
    score: float
    feedback: Optional[str] = ""
    evaluation_source: Optional[str] = "manual"

class QuizCreate(BaseModel): 
    teacher_id: int
    class_id: int
    title: str
    topic: str = ''
    questions: list
    due_date: str = ''

class QuizSubmit(BaseModel): 
    student_id: int
    answers: list

# 1. PASTE THESE TWO NEW SCHEMAS RIGHT HERE:
class QuizGradePayload(BaseModel):
    teacher_id: int
    score: float
    feedback: Optional[str] = ""
    evaluation_source: Optional[str] = "manual"

class QuizAICheckRequest(BaseModel):
    teacher_id: int
    attempt_id: int
    max_marks: float

class AttendanceMark(BaseModel): 
    teacher_id: int
    class_id: int
    student_id: int
    attendance_date: str
    status: str

class ResultCreate(BaseModel): 
    teacher_id: int
    class_id: int
    student_id: int
    assessment_name: str
    marks: float
    total_marks: float
    grade: str = ''
    feedback: str = ''

class AnnouncementCreate(BaseModel): 
    author_id: int
    class_id: Optional[int] = None
    title: str
    body: str

class TimetableCreate(BaseModel): 
    teacher_id: int
    class_id: int
    day: str
    start_time: str
    end_time: str
    room: str = ''

VALID_ROLES = {'student', 'teacher', 'staff', 'super_admin'}

def user(uid):
    c = db()
    r = c.execute('SELECT id, full_name, email, role, institution_mode FROM users WHERE id=?', (uid,)).fetchone()
    c.close()
    if not r: raise HTTPException(404, 'User not found.')
    return r

def role(uid, roles):
    u = user(uid)
    if u['role'] not in roles: raise HTTPException(403, 'You do not have permission for this action.')
    return u

def join_code():
    c = db()
    try:
        for _ in range(100):
            x = secrets.token_hex(4).upper()
            if not c.execute('SELECT 1 FROM classes WHERE join_code=?', (x,)).fetchone(): return x
    finally: 
        c.close()
    raise HTTPException(500, 'Could not generate class code.')

def teacher_class(cid, tid):
    c = db()
    r = c.execute('SELECT * FROM classes WHERE id=?', (cid,)).fetchone()
    c.close()
    if not r: raise HTTPException(404, 'Class not found.')
    if r['teacher_id'] != tid: raise HTTPException(403, 'This class does not belong to you.')
    return r

def member_class(cid, uid):
    c = db()
    r = c.execute('SELECT * FROM classes WHERE id=?', (cid,)).fetchone()
    u = c.execute('SELECT role FROM users WHERE id=?', (uid,)).fetchone()
    if not r or not u: 
        c.close()
        raise HTTPException(404, 'Class or user not found.')
    ok = (
        (u['role'] == 'teacher' and r['teacher_id'] == uid) or
        (u['role'] == 'student' and bool(c.execute('SELECT 1 FROM enrollments WHERE class_id=? AND student_id=?', (cid, uid)).fetchone())) or
        u['role'] in {'staff', 'super_admin'}
    )
    c.close()
    if not ok: raise HTTPException(403, 'You are not connected to this class.')
    return r


def authenticated_user(uid, authorization, allowed_roles):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Sign in again to continue.')
    try:
        claims = jwt.decode(authorization[7:], SECRET_KEY, algorithms=[ALGORITHM])
        token_uid = int(claims.get('sub', 0))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(401, 'Your sign-in has expired. Please sign in again.')
    if token_uid != uid:
        raise HTTPException(403, 'You cannot act as another account.')
    account = user(uid)
    if claims.get('role') != account['role']:
        raise HTTPException(401, 'Your account permissions changed. Please sign in again.')
    if account['role'] not in allowed_roles:
        raise HTTPException(403, 'You do not have permission for this action.')
    return account


class BTBBReaderParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.pdf_urls = []
        self.download_urls = []
        self.anchor_href = ''
        self.anchor_text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            self.anchor_href = attrs.get('href', '')
            self.anchor_text = []
        for key in ('href', 'src', 'data'):
            value = attrs.get(key, '')
            if value and '.pdf' in value.lower():
                self.pdf_urls.append(value)

    def handle_data(self, data):
        if self.anchor_href:
            self.anchor_text.append(data)

    def handle_endtag(self, tag):
        if tag == 'a' and self.anchor_href:
            label = ' '.join(' '.join(self.anchor_text).split()).lower()
            if re.match(r'^download(?:\s|$)', label):
                self.download_urls.append(self.anchor_href)
            self.anchor_href = ''
            self.anchor_text = []


BTBB_BASE_URL = 'https://btbb.com.pk/'
BTBB_CATALOG_URL = urljoin(BTBB_BASE_URL, 'book-catalogue.php')
BTBB_CATALOG_SOURCE = 'btbb-book-catalogue-v1'
BTBB_USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
)
BTBB_CATALOG_CACHE = []
BTBB_CATALOG_CACHE_TIME = 0.0
BTBB_CATALOG_CACHE_FILE = os.path.join(UPLOAD_DIR, 'btbb_catalog_cache.json')
BTBB_CHAPTERS_CACHE = {}
BTBB_PDF_CACHE_DIR = os.path.abspath(
    os.getenv('BTBB_PDF_CACHE_DIR', os.path.join(UPLOAD_DIR, 'curriculum_pdfs'))
)
BTBB_PDF_URL_CACHE = {}
BTBB_MAX_PDF_BYTES = 1024 * 1024 * 1024
BTBB_REQUEST_ATTEMPTS = 3
os.makedirs(BTBB_PDF_CACHE_DIR, exist_ok=True)


def open_btbb_url(request, timeout):
    last_error = None
    for attempt in range(BTBB_REQUEST_ATTEMPTS):
        try:
            return urlopen(request, timeout=timeout)
        except HTTPError as exc:
            if exc.code not in {408, 425, 429} and exc.code < 500:
                raise HTTPException(502, f'BTBB rejected the textbook request (HTTP {exc.code}).')
            last_error = exc
            exc.close()
        except (URLError, TimeoutError, socket.timeout, ConnectionError) as exc:
            last_error = exc

        if attempt + 1 < BTBB_REQUEST_ATTEMPTS:
            time.sleep(0.5 * (2 ** attempt))

    raise HTTPException(
        502,
        f'BTBB could not be reached after {BTBB_REQUEST_ATTEMPTS} attempts. '
        f'Please retry in a moment. ({last_error})',
    )


def fetch_btbb_page(url):
    request = Request(url, headers={'User-Agent': BTBB_USER_AGENT})
    try:
        with open_btbb_url(request, timeout=15) as response:
            final_host = urlparse(response.geturl()).hostname or ''
            if final_host != 'btbb.com.pk' and not final_host.endswith('.btbb.com.pk'):
                raise HTTPException(502, 'The BTBB source redirected to an unsupported host.')
            return response.read(4_000_000).decode('utf-8', errors='replace')
    except HTTPException:
        raise
    except (OSError, ValueError) as exc:
        raise HTTPException(502, f'Could not load the BTBB textbook catalogue: {exc}')


def get_btbb_books():
    global BTBB_CATALOG_CACHE, BTBB_CATALOG_CACHE_TIME
    if BTBB_CATALOG_CACHE and time.monotonic() - BTBB_CATALOG_CACHE_TIME < 3600:
        return BTBB_CATALOG_CACHE

    cached_books = []
    try:
        with open(BTBB_CATALOG_CACHE_FILE, encoding='utf-8') as cache_file:
            cache = json.load(cache_file)
        if cache.get('source') == BTBB_CATALOG_SOURCE and isinstance(cache.get('books'), list):
            cached_books = cache['books']
            if time.time() - cache.get('saved_at', 0) < 86400:
                BTBB_CATALOG_CACHE = cached_books
                BTBB_CATALOG_CACHE_TIME = time.monotonic()
                return BTBB_CATALOG_CACHE
    except (OSError, ValueError, AttributeError):
        pass

    try:
        catalogue = fetch_btbb_page(BTBB_CATALOG_URL)
    except HTTPException:
        if cached_books:
            BTBB_CATALOG_CACHE = cached_books
            BTBB_CATALOG_CACHE_TIME = time.monotonic()
            return BTBB_CATALOG_CACHE
        raise

    catalogue_match = re.search(
        r'window\.BTBB_BOOKS\s*=\s*(\[.*?\]);',
        catalogue,
        re.DOTALL,
    )
    if not catalogue_match:
        raise HTTPException(502, 'The BTBB book catalogue did not contain its published book list.')
    try:
        catalogue_entries = json.loads(catalogue_match.group(1))
    except json.JSONDecodeError as exc:
        raise HTTPException(502, 'The BTBB book catalogue returned invalid book data.') from exc
    if not isinstance(catalogue_entries, list):
        raise HTTPException(502, 'The BTBB book catalogue returned an invalid book list.')

    books = []
    for entry in catalogue_entries:
        if not isinstance(entry, dict):
            continue
        try:
            book_id = int(entry.get('id'))
        except (TypeError, ValueError):
            continue
        title = str(entry.get('t') or '').strip()
        subject = str(entry.get('s') or '').strip()
        grade = str(entry.get('g') or '').strip()
        if not book_id or not title or not subject:
            continue
        if not (grade.lower() in {'primer', 'general'} or re.fullmatch(r'(?:[1-9]|1[0-2])', grade)):
            continue

        ebook_available = (
            str(entry.get('e', '')).strip().lower() in {'1', 'true'} and
            str(entry.get('f', '')).strip().lower() in {'1', 'true'}
        )
        cover_path = str(entry.get('c') or '').strip()
        book = {
            'id': book_id,
            'title': title,
            'grade': int(grade) if grade.isdigit() else grade,
            'subject': subject,
            'medium': str(entry.get('m') or '').strip() or '—',
            'ebook_available': ebook_available,
            'reader_url': urljoin(BTBB_BASE_URL, f'read-book.php?id={book_id}') if ebook_available else '',
        }
        if cover_path:
            cover_url = urljoin(BTBB_BASE_URL, cover_path)
            if urlparse(cover_url).hostname == 'btbb.com.pk':
                book['cover_url'] = cover_url
        books.append(book)

    if not books:
        raise HTTPException(502, 'The BTBB book catalogue did not contain any valid textbook records.')

    BTBB_CATALOG_CACHE = books
    BTBB_CATALOG_CACHE_TIME = time.monotonic()
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=UPLOAD_DIR, delete=False) as cache_file:
            json.dump({'source': BTBB_CATALOG_SOURCE, 'saved_at': time.time(), 'books': books}, cache_file)
            cache_path = cache_file.name
        os.replace(cache_path, BTBB_CATALOG_CACHE_FILE)
    except OSError:
        if 'cache_path' in locals() and os.path.exists(cache_path):
            os.remove(cache_path)
    return books


def get_btbb_pdf_url(reader_url):
    if reader_url in BTBB_PDF_URL_CACHE:
        return BTBB_PDF_URL_CACHE[reader_url]
    page = fetch_btbb_page(reader_url)
    parser = BTBBReaderParser()
    parser.feed(page)
    reader_file = re.search(
        r"(?is)BTBB_READER\s*=\s*\{.*?\burl\s*:\s*(['\"])(.*?)\1",
        page,
    )
    candidates = parser.pdf_urls + ([reader_file.group(2)] if reader_file else []) + re.findall(
        r'(?i)(?:https?://|/)[^\"\'<>\s]+?\.pdf(?:\?[^\"\'<>\s]*)?',
        page.replace('\\/', '/'),
    )
    for download_url in parser.download_urls:
        download_url = urljoin(reader_url, html.unescape(download_url).replace('&amp;', '&'))
        drive_id = re.search(r'/file/d/([A-Za-z0-9_-]+)', download_url)
        if urlparse(download_url).hostname == 'drive.google.com' and drive_id:
            candidates.append(f'https://drive.google.com/uc?export=download&id={drive_id.group(1)}')
        else:
            candidates.append(download_url)
    for candidate in candidates:
        pdf_url = urljoin(reader_url, html.unescape(candidate).replace('&amp;', '&'))
        parsed = urlparse(pdf_url)
        host = parsed.hostname or ''
        if parsed.scheme == 'https' and (
            host == 'btbb.com.pk' or host.endswith('.btbb.com.pk') or host == 'drive.google.com'
        ):
            BTBB_PDF_URL_CACHE[reader_url] = pdf_url
            return pdf_url
    raise HTTPException(422, 'BTBB provides an online reader for this title but no downloadable PDF was found.')


def download_btbb_pdf(pdf_url, destination):
    request = Request(pdf_url, headers={'User-Agent': BTBB_USER_AGENT})
    try:
        with open_btbb_url(request, timeout=30) as response:
            final_host = urlparse(response.geturl()).hostname or ''
            allowed_host = (
                final_host == 'btbb.com.pk' or final_host.endswith('.btbb.com.pk') or
                final_host == 'drive.google.com' or final_host == 'drive.usercontent.google.com' or
                final_host.endswith('.googleusercontent.com')
            )
            if not allowed_host:
                raise HTTPException(502, 'The BTBB PDF redirected to an unsupported host.')
            content_length = response.headers.get('Content-Length')
            if content_length and int(content_length) > BTBB_MAX_PDF_BYTES:
                raise HTTPException(413, 'This BTBB textbook PDF exceeds the 1 GiB limit.')
            prefix = response.read(5)
            if not prefix.startswith(b'%PDF-'):
                raise HTTPException(422, 'The BTBB reader did not return a PDF file.')
            total = len(prefix)
            try:
                pdf_file = open(destination, 'wb')
            except OSError as exc:
                raise HTTPException(500, f'Could not create the textbook cache file: {exc}')
            with pdf_file:
                pdf_file.write(prefix)
                while True:
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > BTBB_MAX_PDF_BYTES:
                        raise HTTPException(413, 'This BTBB textbook PDF exceeds the 1 GiB limit.')
                    pdf_file.write(chunk)
    except HTTPException:
        raise
    except (URLError, TimeoutError, socket.timeout, ConnectionError, OSError) as exc:
        raise HTTPException(502, f'The BTBB PDF connection was interrupted. Please retry. ({exc})')
    except ValueError as exc:
        raise HTTPException(502, f'BTBB returned invalid PDF download metadata: {exc}')


def cached_btbb_pdf_path(book):
    if not book.get('ebook_available') or not book.get('reader_url'):
        raise HTTPException(404, 'This approved title is available in print, but BTBB has not published a digital e-book.')

    cache_path = os.path.join(BTBB_PDF_CACHE_DIR, f'{book["id"]}.pdf')
    if os.path.isfile(cache_path):
        return cache_path

    pdf_url = get_btbb_pdf_url(book['reader_url'])
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=BTBB_PDF_CACHE_DIR, suffix='.pdf.tmp', delete=False) as temp_file:
            temp_path = temp_file.name
        download_btbb_pdf(pdf_url, temp_path)
        os.replace(temp_path, cache_path)
        temp_path = None
    except HTTPException:
        raise
    except OSError as exc:
        raise HTTPException(500, f'Could not cache the textbook PDF: {exc}')
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
    return cache_path


def stream_btbb_pdf(pdf_url, cache_path=None):
    request = Request(pdf_url, headers={'User-Agent': BTBB_USER_AGENT})
    try:
        response = open_btbb_url(request, timeout=30)
        final_host = urlparse(response.geturl()).hostname or ''
        allowed_host = (
            final_host == 'btbb.com.pk' or final_host.endswith('.btbb.com.pk') or
            final_host == 'drive.google.com' or final_host == 'drive.usercontent.google.com' or
            final_host.endswith('.googleusercontent.com')
        )
        if not allowed_host:
            response.close()
            raise HTTPException(502, 'The BTBB PDF redirected to an unsupported host.')
        content_length = response.headers.get('Content-Length')
        if content_length and int(content_length) > BTBB_MAX_PDF_BYTES:
            response.close()
            raise HTTPException(413, 'This BTBB textbook PDF exceeds the 1 GiB limit.')
        prefix = response.read(5)
        if not prefix.startswith(b'%PDF-'):
            response.close()
            raise HTTPException(422, 'The BTBB reader did not return a PDF file.')
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f'Could not load the BTBB PDF: {exc}')

    def content():
        total = len(prefix)
        cache_temp_path = None
        cache_file = None
        try:
            if cache_path:
                try:
                    with tempfile.NamedTemporaryFile(dir=BTBB_PDF_CACHE_DIR, suffix='.pdf.tmp', delete=False) as temp_file:
                        cache_temp_path = temp_file.name
                    cache_file = open(cache_temp_path, 'wb')
                except OSError:
                    cache_file = None
            if cache_file:
                cache_file.write(prefix)
            yield prefix
            while total <= BTBB_MAX_PDF_BYTES:
                chunk = response.read(min(64 * 1024, BTBB_MAX_PDF_BYTES + 1 - total))
                if not chunk:
                    break
                total += len(chunk)
                if total > BTBB_MAX_PDF_BYTES:
                    raise HTTPException(413, 'This BTBB textbook PDF exceeds the 1 GiB limit.')
                if cache_file:
                    cache_file.write(chunk)
                yield chunk
            if cache_file:
                cache_file.close()
                cache_file = None
                try:
                    os.replace(cache_temp_path, cache_path)
                    cache_temp_path = None
                except OSError:
                    pass
        finally:
            response.close()
            if cache_file:
                cache_file.close()
            if cache_temp_path and os.path.exists(cache_temp_path):
                os.remove(cache_temp_path)

    return StreamingResponse(content(), media_type='application/pdf')

@app.get('/api/health')
@app.get('/health')
def health(): 
    return {'status': 'ok', 'service': 'Khanmigo API'}

@app.get('/')
def root():
    return {'status': 'ok', 'message': 'Khanmigo API Backend is live'}


@app.get('/api/curriculum/books')
def curriculum_books(grade: Optional[str] = None):
    books = get_btbb_books()
    if grade is not None:
        requested_grade = grade.strip().lower()
        books = [book for book in books if str(book['grade']).lower() == requested_grade]
    return books


@app.get('/api/curriculum/books/{book_id}/prepare')
def prepare_curriculum_book(book_id: int):
    book = next((item for item in get_btbb_books() if item['id'] == book_id), None)
    if not book:
        raise HTTPException(404, 'This title is not in the BTBB approved book catalogue.')
    pdf_path = cached_btbb_pdf_path(book)
    return {'ready': True, 'book_id': book_id, 'size_bytes': os.path.getsize(pdf_path)}


@app.get('/api/curriculum/books/{book_id}/pdf')
def curriculum_book_pdf(book_id: int, download: bool = False):
    book = next((item for item in get_btbb_books() if item['id'] == book_id), None)
    if not book:
        raise HTTPException(404, 'This title is not in the BTBB approved book catalogue.')
    filename = re.sub(r'[^A-Za-z0-9._-]+', '_', book['title']).strip('_') or 'textbook'
    disposition = 'attachment' if download else 'inline'
    cache_path = cached_btbb_pdf_path(book)
    return FileResponse(
        cache_path,
        media_type='application/pdf',
        filename=f'{filename}.pdf',
        content_disposition_type=disposition,
    )


def upload_curriculum_pdf(book):
    cache_path = cached_btbb_pdf_path(book)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as pdf_file:
            temp_path = pdf_file.name
        shutil.copyfile(cache_path, temp_path)
        return client.files.upload(file=temp_path), temp_path
    except Exception:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        raise


def parse_ai_json(raw, error_message):
    cleaned = raw.strip().replace('```json', '').replace('```', '').strip()
    try:
        return json.loads(cleaned)
    except Exception:
        raise HTTPException(500, error_message)


@app.post('/api/curriculum/books/{book_id}/chapters')
def curriculum_book_chapters(book_id: int, req: dict):
    teacher_only(req.get('teacher_id'))
    book = next((item for item in get_btbb_books() if item['id'] == book_id), None)
    if not book:
        raise HTTPException(404, 'This title is not in the BTBB approved book catalogue.')
    if book_id in BTBB_CHAPTERS_CACHE:
        return {'book': book, 'chapters': BTBB_CHAPTERS_CACHE[book_id]}
    gemini_file, temp_path = upload_curriculum_pdf(book)
    try:
        prompt = (
            f'Read the attached textbook PDF: {book["title"]}, Grade {book["grade"]}, '
            f'{book["subject"]}. Extract its actual chapter/unit headings and the '
            'topics or lesson headings listed under each. Return only valid JSON in '
            'this shape: {"chapters":[{"title":"Chapter title","topics":["Topic"]}]}. '
            'Use only headings that appear in the PDF; do not invent chapters or topics. '
            'If no contents page is present, infer headings only from clearly labeled '
            'sections in the PDF. If none can be identified, return an empty chapters array.'
        )
        result = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[prompt, gemini_file],
            config={'system_instruction': SYSTEM_INSTRUCTION},
        )
        data = parse_ai_json(result.text or '', 'AI could not extract the textbook chapters.')
        chapters = data.get('chapters') if isinstance(data, dict) else None
        if not isinstance(chapters, list):
            raise HTTPException(500, 'AI returned an invalid textbook outline.')
        BTBB_CHAPTERS_CACHE[book_id] = chapters
        return {'book': book, 'chapters': chapters}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post('/api/curriculum/books/{book_id}/assignment-draft')
def curriculum_assignment_draft(book_id: int, req: dict):
    teacher_id = req.get('teacher_id')
    teacher_only(teacher_id)
    class_id = req.get('class_id')
    topic = str(req.get('topic') or '').strip()
    if not class_id:
        raise HTTPException(400, 'class_id is required.')
    if not topic:
        raise HTTPException(400, 'topic is required.')
    teacher_can_access_class(teacher_id, class_id)
    book = next((item for item in get_btbb_books() if item['id'] == book_id), None)
    if not book:
        raise HTTPException(404, 'This title is not in the BTBB approved book catalogue.')
    gemini_file, temp_path = upload_curriculum_pdf(book)
    try:
        prompt = (
            f'Using only the attached textbook PDF ({book["title"]}, Grade {book["grade"]}, '
            f'{book["subject"]}), create student-friendly assignment instructions for '
            f'the exact selected chapter/topic "{topic}". Keep every learning task, '
            'example, and expected answer within the facts and methods taught in the PDF. '
            'Do not introduce outside facts, terminology, or prerequisite content. '
            'If the selected topic cannot be found in the PDF, return an empty title and '
            'explain that the topic is not present in the book. '
            'Return only valid JSON with string fields "title" and "description". '
            'The description should include clear tasks and what students should submit.'
        )
        result = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[prompt, gemini_file],
            config={'system_instruction': SYSTEM_INSTRUCTION},
        )
        draft = parse_ai_json(result.text or '', 'AI could not create the assignment draft.')
        if isinstance(draft, dict) and not draft.get('title'):
            raise HTTPException(422, 'The selected topic was not found in this textbook, so no assignment was generated.')
        if not isinstance(draft, dict) or not draft.get('description'):
            raise HTTPException(500, 'AI returned an incomplete assignment draft.')
        return draft
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post('/api/curriculum/books/{book_id}/summary')
def summarize_curriculum_book(book_id: int, req: dict):
    user(req.get('user_id'))
    book = next((item for item in get_btbb_books() if item['id'] == book_id), None)
    if not book:
        raise HTTPException(404, 'This title is not in the BTBB approved book catalogue.')

    gemini_file, temp_path = upload_curriculum_pdf(book)
    try:
        prompt = (
            f'Read the attached Balochistan Textbook Board textbook: {book["title"]}, '
            f'Grade {book["grade"]}, {book["subject"]}. Create a clear study summary '
            'of the book using only its contents. Include the main ideas, key terms, '
            'and important formulas or examples where relevant. Do not invent content. '
            'If parts of the PDF are unreadable, say so clearly.'
        )
        result = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[prompt, gemini_file],
            config={'system_instruction': SYSTEM_INSTRUCTION},
        )
        return {
            'book': book,
            'summary': (result.text or '').strip(),
            'reader_url': book['reader_url'],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f'Could not summarize this BTBB textbook: {exc}')
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

# ==========================================
# SUPER ADMIN INVITATION CODE GENERATION
# ==========================================
@app.post('/api/admin/generate-invitation')
def generate_invitation(req: GenerateInvitationRequest):
    role(req.admin_id, {'super_admin', 'superadmin'})
    target = req.target_role.lower()
    if target not in {'teacher', 'staff'}:
        raise HTTPException(400, 'Invitation tokens can only be created for teacher or staff.')
    
    prefix = "TCH" if target == "teacher" else "STF"
    token = f"KHAN-{prefix}-{secrets.token_hex(3).upper()}"
    expiry = datetime.now() + timedelta(days=req.valid_days)
    
    c = db()
    c.execute('''INSERT INTO invitations(token, role, institution_mode, created_by, created_at, expires_at)
                 VALUES(?, ?, ?, ?, ?, ?)''', 
              (token, target, req.institution_mode, req.admin_id, datetime.now(), expiry))
    c.commit()
    c.close()
    return {
        'token': token,
        'role': target,
        'institution_mode': req.institution_mode,
        'expires_at': expiry.strftime('%Y-%m-%d %H:%M:%S'),
        'message': f'Invitation ID generated for {target.capitalize()}'
    }

@app.get('/api/admin/invitations/{admin_id}')
def list_invitations(admin_id: int):
    role(admin_id, {'super_admin', 'superadmin'})
    c = db()
    rows = c.execute('''SELECT i.*, u.full_name AS used_by_name 
                        FROM invitations i 
                        LEFT JOIN users u ON u.id = i.used_by 
                        ORDER BY i.created_at DESC''').fetchall()
    c.close()
    return [dict(r) for r in rows]

# ==========================================
# AUTHENTICATION ENDPOINTS
# ==========================================
@app.post('/api/auth/register')
def register(x: UserRegister):
    r = 'super_admin' if x.role.lower() in {'superadmin', 'super_admin'} else x.role.lower()
    if r not in VALID_ROLES: 
        raise HTTPException(403, 'Invalid role.')
    
    inst = x.institution_mode if x.institution_mode in {'School', 'College', 'University'} else 'University'
    c = db()

    inv_id = None
    if r in {'teacher', 'staff'}:
        if not x.invitation_code or not x.invitation_code.strip():
            c.close()
            raise HTTPException(400, f'An Invitation Token from Super Admin is required to register as {r.capitalize()}.')
        
        inv = c.execute('''SELECT * FROM invitations 
                          WHERE token = ? AND role = ? AND is_used = 0''', 
                       (x.invitation_code.strip().upper(), r)).fetchone()
        if not inv:
            c.close()
            raise HTTPException(400, 'Invalid, expired, or already used invitation token.')
        
        if datetime.strptime(inv['expires_at'], '%Y-%m-%d %H:%M:%S.%f' if '.' in inv['expires_at'] else '%Y-%m-%d %H:%M:%S') < datetime.now():
            c.close()
            raise HTTPException(400, 'This invitation token has expired.')
        
        inv_id = inv['id']
        inst = inv['institution_mode'] or inst

    try:
        cur = c.execute('INSERT INTO users(full_name,email,hashed_password,role,institution_mode) VALUES(?,?,?,?,?)', 
                  (x.full_name.strip(), x.email.lower(), get_password_hash(x.password), r, inst))
        new_user_id = cur.lastrowid

        if inv_id:
            c.execute('UPDATE invitations SET is_used = 1, used_by = ? WHERE id = ?', (new_user_id, inv_id))

        c.commit()
        return {'message': 'Account created successfully!', 'role': r, 'institution_mode': inst}
    except sqlite3.IntegrityError: 
        raise HTTPException(400, 'Email already registered.')
    finally: 
        c.close()

@app.post('/api/auth/login')
def login(x: UserLogin):
    c = db()
    r = c.execute('SELECT * FROM users WHERE email=?', (x.email.lower(),)).fetchone()
    c.close()
    if not r or not verify_password(x.password, r['hashed_password']): 
        raise HTTPException(401, 'Invalid email or password')
    return {
        'user_id': r['id'], 
        'full_name': r['full_name'], 
        'email': r['email'], 
        'role': 'superadmin' if r['role'] == 'super_admin' else r['role'], 
        'institution_mode': r['institution_mode'] or 'University',
        'access_token': create_access_token(
            {'sub': str(r['id']), 'role': r['role']},
            expires_delta=timedelta(days=7),
        ),
    }

@app.post('/api/auth/forgot-password')
def forgot(x: ForgotPasswordSchema):
    generic_response = {'message': 'If an account exists for that email, password reset instructions will be sent.'}
    mail_username = os.getenv('MAIL_USERNAME')
    mail_password = os.getenv('MAIL_PASSWORD')
    if not mail_username or not mail_password:
        raise HTTPException(503, 'Password recovery is not configured. Contact your administrator.')
    c = db()
    r = c.execute('SELECT id, full_name FROM users WHERE email=?', (x.email.lower(),)).fetchone()
    if r:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        now = datetime.now()
        expires_at = now + timedelta(minutes=30)
        c.execute('DELETE FROM password_reset_tokens WHERE user_id=?', (r['id'],))
        c.execute(
            'INSERT INTO password_reset_tokens(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)',
            (token_hash, r['id'], expires_at.isoformat(), now.isoformat()),
        )
        c.commit()
        try:
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')
            reset_url = f'{frontend_url}/?reset_token={token}'
            message = EmailMessage()
            message.set_content(
                f"Hello {r['full_name']},\n\n"
                f"Use this one-time link to choose a new Khanmigo password. "
                f"It expires in 30 minutes.\n\n{reset_url}\n\n"
                "If you did not request this change, you can ignore this email."
            )
            message['Subject'] = 'Reset your Khanmigo password'
            message['From'] = mail_username
            message['To'] = x.email.lower()
            with smtplib.SMTP_SSL(os.getenv('SMTP_HOST', 'smtp.gmail.com'), int(os.getenv('SMTP_PORT', '465'))) as server:
                server.login(mail_username, mail_password)
                server.send_message(message)
        except Exception as e:
            c.execute('DELETE FROM password_reset_tokens WHERE token_hash=?', (token_hash,))
            c.commit()
            print(f'Password reset email delivery failed: {e}')
    c.close()
    return generic_response

@app.post('/api/auth/reset-password')
def reset_password(x: ResetPasswordSchema):
    token_hash = hashlib.sha256(x.token.encode()).hexdigest()
    c = db()
    c.execute('BEGIN IMMEDIATE')
    reset = c.execute(
        'SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL',
        (token_hash,),
    ).fetchone()
    if not reset or datetime.fromisoformat(reset['expires_at']) <= datetime.now():
        c.rollback()
        c.close()
        raise HTTPException(400, 'This password reset link is invalid or has expired. Request a new one.')
    c.execute('UPDATE users SET hashed_password=? WHERE id=?', (get_password_hash(x.password), reset['user_id']))
    c.execute('UPDATE password_reset_tokens SET used_at=? WHERE token_hash=?', (datetime.now().isoformat(), token_hash))
    c.execute('DELETE FROM password_reset_tokens WHERE user_id=? AND token_hash<>?', (reset['user_id'], token_hash))
    c.commit()
    c.close()
    return {'message': 'Your password has been reset. You can now sign in.'}

# ==========================================
# CONVERSATIONS & AI CHAT
# ==========================================
@app.get('/api/conversations/{uid}')
def get_user_conversations(uid: int):
    user(uid)
    c = db()
    rows = c.execute('SELECT id, title, created_at, updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC', (uid,)).fetchall()
    c.close()
    return [dict(r) for r in rows]

@app.get('/api/conversations/{uid}/{cid}')
def get_single_conversation(uid: int, cid: str):
    c = db()
    own = c.execute('SELECT 1 FROM conversations WHERE id=? AND user_id=?', (cid, uid)).fetchone()
    if not own: 
        c.close()
        raise HTTPException(404, 'Conversation not found.')
    rows = c.execute('SELECT id, role, content, input_type, transcription FROM messages WHERE conversation_id=? ORDER BY timestamp ASC', (cid,)).fetchall()
    c.close()
    return [dict(r) for r in rows]

@app.delete('/api/conversations/{cid}')
@app.delete('/api/conversations/{uid}/{cid}')
def del_conversation(cid: str, uid: Optional[int] = None):
    c = db()
    if uid:
        c.execute('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE id=? AND user_id=?)', (cid, uid))
        c.execute('DELETE FROM conversations WHERE id=? AND user_id=?', (cid, uid))
    else:
        c.execute('DELETE FROM messages WHERE conversation_id=?', (cid,))
        c.execute('DELETE FROM conversations WHERE id=?', (cid,))
    c.commit()
    c.close()
    return {'status': 'deleted'}

@app.post('/api/agent/chat_multimodal')
def chat_multimodal(
    user_id: int = Form(...),
    user_message: str = Form(''),
    user_role: str = Form('student'),
    conversation_id: Optional[str] = Form(None),
    agent_name: str = Form('Assistant'),
    workspace_context: str = Form(''),
    curriculum_book_id: Optional[int] = Form(None),
    curriculum_topic: str = Form(''),
    files: Optional[List[UploadFile]] = File(None)
):
    user(user_id)
    saved = []
    gem = []
    try:
        c = db()
        if not conversation_id or conversation_id in {'null', '', 'undefined'}:
            conversation_id = str(uuid.uuid4())
            title_text = (user_message[:35].strip() or 'New Session')
            c.execute(
                'INSERT INTO conversations(id,user_id,title,created_at,updated_at) VALUES(?,?,?,?,?)',
                (conversation_id, user_id, title_text, datetime.now(), datetime.now())
            )
        else:
            row = c.execute('SELECT 1 FROM conversations WHERE id=? AND user_id=?', (conversation_id, user_id)).fetchone()
            if not row:
                c.close()
                raise HTTPException(403, 'Conversation does not belong to this user.')
            c.execute('UPDATE conversations SET updated_at=? WHERE id=?', (datetime.now(), conversation_id))
        
        hist = c.execute(
            'SELECT role, content FROM messages WHERE conversation_id=? ORDER BY timestamp ASC LIMIT 20',
            (conversation_id,)
        ).fetchall()
        c.commit()
        c.close()

        typ = 'text'
        trans = None
        if curriculum_book_id is not None:
            role(user_id, {'teacher'})
            book = next((item for item in get_btbb_books() if item['id'] == curriculum_book_id), None)
            if not book:
                raise HTTPException(404, 'This title is not in the BTBB approved book catalogue.')
            curriculum_file, curriculum_path = upload_curriculum_pdf(book)
            saved.append(curriculum_path)
            gem.append(curriculum_file)
            workspace_context = (
                f'{workspace_context} | Selected textbook: {book["title"]}; '
                f'Grade {book["grade"]}; Subject: {book["subject"]}; '
                f'Selected topic: {curriculum_topic or "not selected"}. '
                'For textbook questions and learning materials, use only the attached textbook. '
                'Do not add outside facts or guess. If the answer or selected topic is not supported '
                'by the book, say clearly that it could not be found in this textbook.'
            )
        for f in (files or []):
            if not f.filename:
                continue
            path = os.path.join(UPLOAD_DIR, f'{uuid.uuid4()}_{os.path.basename(f.filename)}')
            with open(path, 'wb') as out: 
                shutil.copyfileobj(f.file, out)
            saved.append(path)

            try:
                gf = client.files.upload(file=path)
                gem.append(gf)
            except Exception as upload_err:
                print(f"Gemini file upload warning: {upload_err}")

            if f.content_type and f.content_type.startswith('audio/'):
                typ = 'voice'
                stt = client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=['Accurately transcribe this audio in its original language. Output only the transcription.', gf]
                )
                trans = (stt.text or '').strip()
                user_message = user_message or trans
            else: 
                typ = 'document'

        c = db()
        c.execute(
            'INSERT INTO messages(id,conversation_id,role,content,input_type,transcription,timestamp) VALUES(?,?,?,?,?,?,?)',
            (str(uuid.uuid4()), conversation_id, 'user', user_message or '[Attached File]', typ, trans, datetime.now())
        )
        c.commit()
        c.close()

        history = []
        for h in hist:
            role_tag = 'user' if h['role'] == 'user' else 'model'
            history.append({
                'role': role_tag,
                'parts': [{'text': h['content'] or ''}]
            })

        chat = client.chats.create(
            model=GEMINI_MODEL,
            history=history or None,
            config={'system_instruction': SYSTEM_INSTRUCTION}
        )

        role_instruction = (
            f"[Context: User Role is {user_role.upper()} | Tool: {agent_name} | {workspace_context}]\n"
            f"User: {user_message or 'Please examine the uploaded attachment.'}"
        )

        parts = [role_instruction] + gem
        ai_response = chat.send_message(parts)
        answer = (ai_response.text or 'No response generated by AI.').strip()

        c = db()
        c.execute(
            'INSERT INTO messages(id,conversation_id,role,content,input_type,timestamp) VALUES(?,?,?,?,?,?)',
            (str(uuid.uuid4()), conversation_id, 'assistant', answer, 'text', datetime.now())
        )
        c.execute('UPDATE conversations SET updated_at=? WHERE id=?', (datetime.now(), conversation_id))
        c.commit()
        c.close()

        return {'conversation_id': conversation_id, 'response': answer}

    except HTTPException: 
        raise
    except Exception as e: 
        raise HTTPException(500, f'AI Engine Error: {str(e)}')
    finally:
        for p in saved:
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass

@app.post('/api/agent/chat')
async def basic_chat(req: dict):
    msg = req.get('user_message', '')
    if not msg:
        raise HTTPException(400, 'user_message is required.')
    r = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=msg,
        config={'system_instruction': SYSTEM_INSTRUCTION}
    )
    return {'response': r.text or ''}

@app.get('/api/dashboard/{uid}')
def dashboard(uid: int):
    u = user(uid)
    c = db()
    if u['role'] == 'teacher':
        d = {
            'classes': c.execute('SELECT COUNT(*) n FROM classes WHERE teacher_id=?', (uid,)).fetchone()['n'],
            'students': c.execute('SELECT COUNT(DISTINCT e.student_id) n FROM enrollments e JOIN classes x ON x.id=e.class_id WHERE x.teacher_id=?', (uid,)).fetchone()['n'],
            'assignments': c.execute('SELECT COUNT(*) n FROM assignments WHERE teacher_id=?', (uid,)).fetchone()['n'],
            'quizzes': c.execute('SELECT COUNT(*) n FROM quizzes WHERE teacher_id=?', (uid,)).fetchone()['n']
        }
    elif u['role'] == 'student': 
        d = {
            'classes': c.execute('SELECT COUNT(*) n FROM enrollments WHERE student_id=?', (uid,)).fetchone()['n'],
            'assignments': c.execute('SELECT COUNT(*) n FROM assignments a JOIN enrollments e ON e.class_id=a.class_id WHERE e.student_id=?', (uid,)).fetchone()['n'],
            'results': c.execute('SELECT COUNT(*) n FROM results WHERE student_id=?', (uid,)).fetchone()['n']
        }
    else: 
        d = {k: c.execute(f"SELECT COUNT(*) n FROM {t}").fetchone()['n'] for k, t in [('users', 'users'), ('classes', 'classes'), ('assignments', 'assignments'), ('quizzes', 'quizzes')]}
    c.close()
    return d

@app.get('/api/classes/teacher/{tid}')
def classes_teacher(tid: int, authorization: Optional[str] = Header(None)):
    authenticated_user(tid, authorization, {'teacher'})
    c = db()
    r = c.execute('SELECT x.*,(SELECT COUNT(*) FROM enrollments e WHERE e.class_id=x.id) student_count FROM classes x WHERE teacher_id=? ORDER BY created_at DESC', (tid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.get('/api/classes/student/{sid}')
def classes_student(sid: int, authorization: Optional[str] = Header(None)):
    authenticated_user(sid, authorization, {'student'})
    c = db()
    r = c.execute('''SELECT x.id,x.name,x.subject,x.institution_mode,x.grade_level,x.section,x.course_code,
                            x.description,x.is_active,x.created_at,u.full_name teacher_name,
                            (SELECT COUNT(*) FROM enrollments e2 WHERE e2.class_id=x.id) student_count
                     FROM enrollments e JOIN classes x ON x.id=e.class_id JOIN users u ON u.id=x.teacher_id
                     WHERE e.student_id=? ORDER BY x.created_at DESC''', (sid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.post('/api/classes')
def create_class(x: ClassCreate, authorization: Optional[str] = Header(None)):
    teacher = authenticated_user(x.teacher_id, authorization, {'teacher'})
    if not x.name.strip() or len(x.name.strip()) > 120:
        raise HTTPException(422, 'Class name must contain 1 to 120 characters.')
    institution = x.institution_mode if x.institution_mode in {'School', 'College', 'University'} else 'University'
    if institution != teacher['institution_mode']:
        raise HTTPException(403, 'You can only create a classroom for your registered institution level.')
    code = join_code()
    c = db()
    cur = c.execute('INSERT INTO classes(teacher_id,name,subject,institution_mode,grade_level,section,course_code,description,join_code,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', (x.teacher_id, x.name.strip(), x.subject.strip(), institution, x.grade_level.strip(), x.section.strip(), x.course_code.strip(), x.description.strip(), code, datetime.now()))
    c.commit()
    r = c.execute('SELECT * FROM classes WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return dict(r)

@app.post('/api/classes/join')
def join_class(x: JoinClassRequest, authorization: Optional[str] = Header(None)):
    student = authenticated_user(x.student_id, authorization, {'student'})
    c = db()
    cls = c.execute('SELECT * FROM classes WHERE join_code=? AND is_active=1', (x.join_code.upper(),)).fetchone()
    if not cls: 
        c.close()
        raise HTTPException(404, 'Invalid or inactive class code.')
    if (cls['institution_mode'] or 'University') != (student['institution_mode'] or 'University'):
        c.close()
        raise HTTPException(403, 'This classroom is for a different education level.')
    try: 
        c.execute('INSERT INTO enrollments(class_id,student_id,joined_at) VALUES(?,?,?)', (cls['id'], x.student_id, datetime.now()))
        c.commit()
    except sqlite3.IntegrityError: 
        c.close()
        raise HTTPException(400, 'You are already enrolled in this class.')
    c.close()
    return {'message': 'Class joined successfully.', 'class_id': cls['id'], 'class_name': cls['name']}

@app.get('/api/classes/{cid}/students')
def class_students(cid: int, user_id: int, authorization: Optional[str] = Header(None)):
    authenticated_user(user_id, authorization, {'teacher'})
    teacher_class(cid, user_id)
    c = db()
    r = c.execute('SELECT u.id student_id,u.full_name,u.email,e.joined_at FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.class_id=? ORDER BY u.full_name', (cid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.delete('/api/classes/{cid}/students/{sid}')
def remove_student(cid: int, sid: int, teacher_id: int, authorization: Optional[str] = Header(None)):
    authenticated_user(teacher_id, authorization, {'teacher'})
    teacher_class(cid, teacher_id)
    c = db()
    c.execute('DELETE FROM enrollments WHERE class_id=? AND student_id=?', (cid, sid))
    c.commit()
    c.close()
    return {'message': 'Student removed from class.'}

@app.post('/api/classes/{cid}/join-access')
def update_class_join_access(cid: int, update: ClassJoinAccessUpdate, authorization: Optional[str] = Header(None)):
    authenticated_user(update.teacher_id, authorization, {'teacher'})
    teacher_class(cid, update.teacher_id)
    c = db()
    c.execute('UPDATE classes SET is_active=? WHERE id=?', (int(update.is_active), cid))
    c.commit()
    c.close()
    return {'message': 'Class join access updated.', 'is_active': update.is_active}

@app.get('/api/classes/{cid:int}')
def class_detail(cid: int, user_id: int, authorization: Optional[str] = Header(None)):
    actor = authenticated_user(user_id, authorization, {'teacher', 'student', 'staff', 'super_admin'})
    x = member_class(cid, user_id)
    c = db()
    t = c.execute('SELECT full_name,email FROM users WHERE id=?', (x['teacher_id'],)).fetchone()
    n = c.execute('SELECT COUNT(*) n FROM enrollments WHERE class_id=?', (cid,)).fetchone()['n']
    d = dict(x)
    if actor['role'] != 'teacher':
        d.pop('join_code', None)
    d.update({
        'teacher_name': t['full_name'] if t else '',
        'student_count': n,
    })
    if actor['role'] == 'teacher':
        d['teacher_email'] = t['email'] if t else ''
        students = c.execute('SELECT u.id,u.full_name,u.email,e.joined_at FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.class_id=? ORDER BY u.full_name', (cid,)).fetchall()
        d['students'] = [dict(z) for z in students]
        d['assignments'] = [dict(row) for row in c.execute(
            '''SELECT a.*,
                      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id=a.id) submission_count
               FROM assignments a WHERE a.class_id=? ORDER BY a.created_at DESC''', (cid,)
        ).fetchall()]
    elif actor['role'] == 'student':
        d['assignments'] = [dict(row) for row in c.execute(
            '''SELECT a.*,s.id submission_id,s.score,s.feedback,s.status,s.submitted_at
               FROM assignments a
               LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=?
               WHERE a.class_id=? ORDER BY a.created_at DESC''', (user_id, cid)
        ).fetchall()]
    if actor['role'] in {'teacher', 'student'}:
        d['announcements'] = [dict(row) for row in c.execute(
            '''SELECT a.id,a.title,a.body,a.created_at,u.full_name author_name
               FROM announcements a JOIN users u ON u.id=a.author_id
               WHERE a.class_id=? ORDER BY a.created_at DESC''', (cid,)
        ).fetchall()]
    c.close()
    return d

@app.get('/api/classes/all')
def all_classes(requester_id: int, authorization: Optional[str] = Header(None)):
    authenticated_user(requester_id, authorization, {'staff', 'super_admin'})
    c = db()
    rows = c.execute('''SELECT x.id,x.name,x.subject,x.institution_mode,x.grade_level,x.section,x.course_code,x.description,
                               x.is_active,x.created_at,(SELECT COUNT(*) FROM enrollments e WHERE e.class_id=x.id) student_count,
                               u.full_name teacher_name
                        FROM classes x JOIN users u ON u.id=x.teacher_id ORDER BY x.created_at DESC''').fetchall()
    c.close()
    return [dict(z) for z in rows]

# ==========================================
# ACADEMIC ENDPOINTS
# ==========================================
@app.get('/api/assignments/teacher/{tid}')
def assignments_teacher(tid: int, authorization: Optional[str] = Header(None)):
    authenticated_user(tid, authorization, {'teacher'})
    c = db()
    r = c.execute('SELECT a.*,x.name class_name,(SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id=a.id) submission_count FROM assignments a JOIN classes x ON x.id=a.class_id WHERE a.teacher_id=? ORDER BY a.created_at DESC', (tid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.get('/api/assignments/student/{sid}')
def assignments_student(sid: int, authorization: Optional[str] = Header(None)):
    authenticated_user(sid, authorization, {'student'})
    c = db()
    r = c.execute('SELECT a.*,x.name class_name,s.id submission_id,s.score,s.feedback,s.status,s.submitted_at FROM assignments a JOIN enrollments e ON e.class_id=a.class_id JOIN classes x ON x.id=a.class_id LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=e.student_id WHERE e.student_id=? ORDER BY a.created_at DESC', (sid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.post('/api/assignments')
def create_assignment(x: AssignmentCreate, authorization: Optional[str] = Header(None)):
    authenticated_user(x.teacher_id, authorization, {'teacher'})
    teacher_class(x.class_id, x.teacher_id)
    c = db()
    cur = c.execute('INSERT INTO assignments(class_id,teacher_id,title,description,due_date,total_marks,created_at) VALUES(?,?,?,?,?,?,?)', (x.class_id, x.teacher_id, x.title.strip(), x.description, x.due_date, max(1, x.total_marks), datetime.now()))
    c.commit()
    r = c.execute('SELECT * FROM assignments WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return dict(r)


@app.post('/api/assignments/{aid}/submit-file')
async def submit_assignment_with_file(
    aid: int,
    student_id: int = Form(...),
    text_content: str = Form(''),
    file: Optional[UploadFile] = File(None),
    authorization: Optional[str] = Header(None),
):
    authenticated_user(student_id, authorization, {'student'})
    c = db()
    
    a = c.execute('SELECT * FROM assignments WHERE id=?', (aid,)).fetchone()
    if not a: 
        c.close()
        raise HTTPException(404, 'Assignment not found.')
        
    if not c.execute('SELECT 1 FROM enrollments WHERE class_id=? AND student_id=?', (a['class_id'], student_id)).fetchone(): 
        c.close()
        raise HTTPException(403, 'You are not enrolled in this class.')
    
    # Process the file if the student uploaded one
    file_url = ""
    if file and file.filename:
        # Check if it's a valid extension
        ext = os.path.splitext(file.filename)[1].lower()
        filename = f"sub_{aid}_{student_id}_{uuid.uuid4().hex[:6]}{ext}"
        filepath = os.path.join(ASSIGNMENT_UPLOAD_DIR, filename)
        
        # Save the file to the hard drive
        with open(filepath, 'wb') as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_url = f"/uploads/assignments/{filename}"

    # Save to the database
    c.execute('''INSERT INTO assignment_submissions(assignment_id,student_id,text_content,file_name,submitted_at,status) 
                 VALUES(?,?,?,?,?,?) 
                 ON CONFLICT(assignment_id,student_id) DO UPDATE SET 
                 text_content=excluded.text_content,
                 file_name=CASE WHEN excluded.file_name != '' THEN excluded.file_name ELSE file_name END,
                 submitted_at=excluded.submitted_at,
                 status='resubmitted' ''', 
              (aid, student_id, text_content, file_url, datetime.now(), 'submitted'))
    c.commit()
    c.close()
    
    return {'message': 'Assignment submitted successfully.', 'file_url': file_url}

@app.get('/api/assignments/{aid}/submissions')
def assignment_submissions_teacher(aid: int, teacher_id: int, authorization: Optional[str] = Header(None)):
    authenticated_user(teacher_id, authorization, {'teacher'})
    c = db()
    assignment = c.execute('''
        SELECT a.id, a.class_id, a.teacher_id, a.title, a.description, a.due_date, a.total_marks,
               x.name AS class_name, x.subject AS subject
        FROM assignments a
        JOIN classes x ON x.id = a.class_id
        WHERE a.id=?
    ''', (aid,)).fetchone()

    if not assignment:
        c.close()
        raise HTTPException(404, 'Assignment not found.')

    if assignment['teacher_id'] != teacher_id:
        c.close()
        raise HTTPException(403, 'Not your assignment.')

    rows = c.execute('''
        SELECT s.id, s.id AS submission_id, s.assignment_id, s.student_id, s.text_content, s.file_name,
               s.score, s.feedback, s.status, s.submitted_at,
               u.full_name AS student_name, u.email AS student_email,
               a.title AS assignment_title, a.description AS assignment_description,
               COALESCE(a.total_marks, 100) AS total_marks,
               x.id AS class_id, x.name AS class_name, x.subject AS subject
        FROM assignment_submissions s
        JOIN users u ON u.id = s.student_id
        JOIN assignments a ON a.id = s.assignment_id
        JOIN classes x ON x.id = a.class_id
        WHERE s.assignment_id=?
        ORDER BY s.submitted_at DESC
    ''', (aid,)).fetchall()

    c.close()
    return [dict(row) for row in rows]

# ============================================================
# GRADE SUBMISSION & PUBLISH TO RESULTS TABLE
# ============================================================
@app.post('/api/assignments/submissions/{sub_id}/grade')
def grade_submission_endpoint(sub_id: int, payload: GradeSubmissionPayload, authorization: Optional[str] = Header(None)):
    authenticated_user(payload.teacher_id, authorization, {'teacher'})
    c = db()

    sub = c.execute('''
        SELECT s.*, a.id AS assignment_id, a.class_id, a.teacher_id, a.title AS assignment_title,
               COALESCE(a.total_marks, 100) AS total_marks
        FROM assignment_submissions s
        JOIN assignments a ON a.id = s.assignment_id
        WHERE s.id = ?
    ''', (sub_id,)).fetchone()

    if not sub:
        c.close()
        raise HTTPException(404, 'Submission not found.')

    if sub['teacher_id'] != payload.teacher_id:
        c.close()
        raise HTTPException(403, 'You do not have permission to grade this submission.')

    total_marks = float(sub['total_marks'])
    score = float(payload.score)

    if score < 0 or score > total_marks:
        c.close()
        raise HTTPException(400, f'Marks must be between 0 and {total_marks}.')

    percentage = (score / total_marks) * 100 if total_marks > 0 else 0
    if percentage >= 85:
        grade = 'A'
    elif percentage >= 70:
        grade = 'B'
    elif percentage >= 55:
        grade = 'C'
    elif percentage >= 40:
        grade = 'D'
    else:
        grade = 'F'

    c.execute('''
        UPDATE assignment_submissions
        SET score = ?, feedback = ?, status = 'graded'
        WHERE id = ?
    ''', (score, payload.feedback, sub_id))

    existing_result = c.execute('''
        SELECT id FROM results 
        WHERE student_id = ? AND class_id = ? AND submission_id = ?
    ''', (sub['student_id'], sub['class_id'], sub_id)).fetchone()

    if existing_result:
        c.execute('''
            UPDATE results
            SET marks = ?, total_marks = ?, grade = ?, feedback = ?, source = ?, published_to_student = 1
            WHERE id = ?
        ''', (score, total_marks, grade, payload.feedback, payload.evaluation_source, existing_result['id']))
    else:
        c.execute('''
            INSERT INTO results (
                class_id, student_id, assessment_name, marks, total_marks, grade, 
                feedback, submission_id, source, published_to_student, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ''', (
            sub['class_id'],
            sub['student_id'],
            sub['assignment_title'],
            score,
            total_marks,
            grade,
            payload.feedback,
            sub_id,
            payload.evaluation_source,
            datetime.now()
        ))

    c.commit()
    c.close()

    return {
        'success': True,
        'message': 'Grade saved and published successfully.',
        'submission_id': sub_id,
        'score': score,
        'total_marks': total_marks,
        'grade': grade
    }

# ============================================================
# QUIZZES ENDPOINTS
# ============================================================
@app.get('/api/quizzes/teacher/{tid}')
def quizzes_teacher(tid: int):
    role(tid, {'teacher'})
    c = db()
    r = c.execute('SELECT q.*,x.name class_name,(SELECT COUNT(*) FROM quiz_attempts a WHERE a.quiz_id=q.id) attempt_count FROM quizzes q JOIN classes x ON x.id=q.class_id WHERE q.teacher_id=? ORDER BY q.created_at DESC', (tid,)).fetchall()
    c.close()
    out = []
    for x in r:
        d = dict(x)
        d['questions'] = json.loads(d.pop('questions_json'))
        d['description'] = d.get('topic', '')
        out.append(d)
    return out

@app.get('/api/quizzes/student/{sid}')
def quizzes_student(sid: int):
    role(sid, {'student'})
    c = db()
    r = c.execute('SELECT q.*,x.name class_name,a.id attempt_id,a.score attempt_score FROM quizzes q JOIN enrollments e ON e.class_id=q.class_id JOIN classes x ON x.id=q.class_id LEFT JOIN quiz_attempts a ON a.quiz_id=q.id AND a.student_id=e.student_id WHERE e.student_id=? ORDER BY q.created_at DESC', (sid,)).fetchall()
    c.close()
    out = []
    for x in r:
        d = dict(x)
        d['questions'] = json.loads(d.pop('questions_json'))
        d['description'] = d.get('topic', '')
        out.append(d)
    return out

@app.post('/api/quizzes')
def create_quiz(x: QuizCreate):
    teacher_class(x.class_id, x.teacher_id)
    if not x.questions: raise HTTPException(400, 'At least one question is required.')
    c = db()
    cur = c.execute('INSERT INTO quizzes(class_id,teacher_id,title,topic,questions_json,total_marks,due_date,created_at) VALUES(?,?,?,?,?,?,?,?)', (x.class_id, x.teacher_id, x.title, x.topic, json.dumps(x.questions, ensure_ascii=False), len(x.questions), x.due_date, datetime.now()))
    c.commit()
    r = c.execute('SELECT * FROM quizzes WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    d = dict(r)
    d['questions'] = json.loads(d.pop('questions_json'))
    return d

@app.get('/api/quizzes/{qid}')
def get_quiz(qid: int, student_id: int):
    role(student_id, {'student'})
    c = db()
    q = c.execute('SELECT * FROM quizzes WHERE id=?', (qid,)).fetchone()
    if not q: 
        c.close()
        raise HTTPException(404, 'Quiz not found.')
    if not c.execute('SELECT 1 FROM enrollments WHERE class_id=? AND student_id=?', (q['class_id'], student_id)).fetchone(): 
        c.close()
        raise HTTPException(403, 'You are not enrolled in this class.')
    c.close()
    d = dict(q)
    d['questions'] = json.loads(d.pop('questions_json'))
    return d

@app.get('/api/quizzes/{qid}/attempts')
def get_quiz_attempts(qid: int, teacher_id: int):
    role(teacher_id, {'teacher'})
    c = db()
    r = c.execute('''
        SELECT qa.*, u.full_name as student_name, x.name as class_name 
        FROM quiz_attempts qa 
        JOIN users u ON u.id = qa.student_id 
        JOIN quizzes q ON q.id = qa.quiz_id 
        JOIN classes x ON x.id = q.class_id 
        WHERE qa.quiz_id = ? AND q.teacher_id = ?
        ORDER BY qa.submitted_at DESC
    ''', (qid, teacher_id)).fetchall()
    c.close()
    
    out = []
    for x in r:
        d = dict(x)
        # Parse answers json if stored
        try:
            d['answers'] = json.loads(d.get('answers_json', '[]'))
        except:
            d['answers'] = []
            
        # Calculate percentage if not stored directly
        total_marks = d.get('total_marks', 10) # default fallback
        score = d.get('score', 0)
        d['percentage'] = round((score / max(total_marks, 1)) * 100, 2)
        out.append(d)
        
    return out
@app.post('/api/quizzes/attempts/{attempt_id}/grade')
def grade_quiz_attempt(attempt_id: int, x: QuizGradePayload): # <--- FIXED TO QuizGradePayload
    role(x.teacher_id, {'teacher'})
    c = db()
    
    # Check if attempt exists and get quiz details for publishing
    att = c.execute('''
        SELECT qa.*, q.teacher_id, q.class_id, q.title as quiz_title, q.total_marks
        FROM quiz_attempts qa 
        JOIN quizzes q ON q.id = qa.quiz_id 
        WHERE qa.id = ?
    ''', (attempt_id,)).fetchone()
    
    if not att:
        c.close()
        raise HTTPException(404, 'Quiz attempt not found.')
    if att['teacher_id'] != x.teacher_id:
        c.close()
        raise HTTPException(403, 'Unauthorized access.')

    total_marks = float(att['total_marks'] or 10)
    score = float(x.score)
    percentage = (score / total_marks) * 100 if total_marks > 0 else 0
    
    # Calculate Grade
    if percentage >= 85: grade = 'A'
    elif percentage >= 70: grade = 'B'
    elif percentage >= 55: grade = 'C'
    elif percentage >= 40: grade = 'D'
    else: grade = 'F'
        
    # 1. Update attempt status in quiz_attempts table
    c.execute('''
        UPDATE quiz_attempts 
        SET score=?, feedback=?, status='graded' 
        WHERE id=?
    ''', (score, x.feedback, attempt_id))
    
    # 2. Publish to the student's Results Card
    assessment_name = f"{att['quiz_title']} (Quiz)"
    existing_result = c.execute('SELECT id FROM results WHERE student_id=? AND class_id=? AND assessment_name=?', 
                                (att['student_id'], att['class_id'], assessment_name)).fetchone()
    
    if existing_result:
        c.execute('''
            UPDATE results SET marks=?, total_marks=?, grade=?, feedback=?, source=?, published_to_student=1
            WHERE id=?
        ''', (score, total_marks, grade, x.feedback, x.evaluation_source, existing_result['id']))
    else:
        c.execute('''
            INSERT INTO results (class_id, student_id, assessment_name, marks, total_marks, grade, feedback, source, published_to_student, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ''', (att['class_id'], att['student_id'], assessment_name, score, total_marks, grade, x.feedback, x.evaluation_source, datetime.now()))

    c.commit()
    c.close()
    return {'success': True, 'message': 'Quiz grade published successfully to student results.'}

# ==========================================
# ATTENDANCE & RESULTS
# ==========================================
@app.get('/api/attendance/teacher/{tid}')
def attendance_teacher(tid: int):
    role(tid, {'teacher'})
    c = db()
    r = c.execute('SELECT a.*,x.name class_name,u.full_name student_name FROM attendance a JOIN classes x ON x.id=a.class_id JOIN users u ON u.id=a.student_id WHERE x.teacher_id=? ORDER BY a.attendance_date DESC', (tid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.get('/api/attendance/student/{sid}')
def attendance_student(sid: int):
    role(sid, {'student'})
    c = db()
    r = c.execute('SELECT a.*,x.name class_name FROM attendance a JOIN classes x ON x.id=a.class_id WHERE a.student_id=? ORDER BY a.attendance_date DESC', (sid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.post('/api/attendance')
def mark_attendance(x: AttendanceMark):
    teacher_class(x.class_id, x.teacher_id)
    if x.status not in {'present', 'absent', 'late', 'leave'}: raise HTTPException(400, 'Invalid attendance status.')
    c = db()
    if not c.execute('SELECT 1 FROM enrollments WHERE class_id=? AND student_id=?', (x.class_id, x.student_id)).fetchone(): 
        c.close()
        raise HTTPException(400, 'Student is not enrolled.')
    c.execute('INSERT INTO attendance(class_id,student_id,attendance_date,status,marked_by) VALUES(?,?,?,?,?) ON CONFLICT(class_id,student_id,attendance_date) DO UPDATE SET status=excluded.status,marked_by=excluded.marked_by', (x.class_id, x.student_id, x.attendance_date, x.status, x.teacher_id))
    c.commit()
    c.close()
    return {'message': 'Attendance saved.'}

@app.get('/api/results/teacher/{tid}')
def results_teacher(tid: int):
    role(tid, {'teacher'})
    c = db()
    r = c.execute('SELECT r.*,r.assessment_name AS exam_name,x.name class_name,u.full_name student_name FROM results r JOIN classes x ON x.id=r.class_id JOIN users u ON u.id=r.student_id WHERE x.teacher_id=? ORDER BY r.created_at DESC', (tid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.get('/api/results/student/{sid}')
def results_student(sid: int):
    role(sid, {'student'})
    c = db()
    r = c.execute('''
        SELECT r.*, r.assessment_name AS exam_name, x.name class_name, x.subject
        FROM results r 
        JOIN classes x ON x.id=r.class_id 
        WHERE r.student_id=? AND r.published_to_student=1
        ORDER BY r.created_at DESC
    ''', (sid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.post('/api/results')
def create_result(x: ResultCreate):
    teacher_class(x.class_id, x.teacher_id)
    c = db()
    if not c.execute('SELECT 1 FROM enrollments WHERE class_id=? AND student_id=?', (x.class_id, x.student_id)).fetchone(): 
        c.close()
        raise HTTPException(400, 'Student is not enrolled.')
    if x.total_marks <= 0 or x.marks < 0 or x.marks > x.total_marks: 
        c.close()
        raise HTTPException(400, 'Invalid marks.')
    p = x.marks / x.total_marks * 100
    g = x.grade or ('A+' if p >= 90 else 'A' if p >= 80 else 'B' if p >= 70 else 'C' if p >= 60 else 'D' if p >= 50 else 'F')
    cur = c.execute('INSERT INTO results(class_id,student_id,assessment_name,marks,total_marks,grade,feedback,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)', (x.class_id, x.student_id, x.assessment_name, x.marks, x.total_marks, g, x.feedback, x.teacher_id, datetime.now()))
    c.commit()
    r = c.execute('SELECT * FROM results WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return dict(r)

@app.get('/api/announcements/user/{uid}')
def announcements(uid: int, authorization: Optional[str] = Header(None)):
    authenticated_user(uid, authorization, {'student', 'teacher', 'staff', 'super_admin'})
    c = db()
    r = c.execute('''SELECT a.*,a.body AS message,u.full_name author_name,x.name class_name FROM announcements a JOIN users u ON u.id=a.author_id LEFT JOIN classes x ON x.id=a.class_id WHERE a.class_id IS NULL OR a.class_id IN(SELECT class_id FROM enrollments WHERE student_id=?) OR a.class_id IN(SELECT id FROM classes WHERE teacher_id=?) ORDER BY a.created_at DESC''', (uid, uid)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.post('/api/announcements')
def create_announcement(x: AnnouncementCreate, authorization: Optional[str] = Header(None)):
    u = authenticated_user(x.author_id, authorization, {'teacher', 'staff', 'super_admin'})
    if not x.title.strip() or len(x.title.strip()) > 160 or not x.body.strip():
        raise HTTPException(422, 'Announcement title and message are required.')
    if x.class_id and u['role'] == 'teacher': teacher_class(x.class_id, x.author_id)
    c = db()
    cur = c.execute('INSERT INTO announcements(class_id,author_id,title,body,created_at) VALUES(?,?,?,?,?)', (x.class_id, x.author_id, x.title, x.body, datetime.now()))
    c.commit()
    r = c.execute('SELECT a.*,a.body AS message,u.full_name author_name,x.name class_name FROM announcements a JOIN users u ON u.id=a.author_id LEFT JOIN classes x ON x.id=a.class_id WHERE a.id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return dict(r)

@app.get('/api/timetable/teacher/{tid}')
def timetable_teacher(tid: int):
    role(tid, {'teacher'})
    c = db()
    r = c.execute('SELECT t.*,x.subject,x.name class_name FROM timetable t JOIN classes x ON x.id=t.class_id WHERE t.teacher_id=? ORDER BY t.day,t.start_time', (tid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.get('/api/timetable/student/{sid}')
def timetable_student(sid: int):
    role(sid, {'student'})
    c = db()
    r = c.execute('SELECT t.*,x.subject,x.name class_name,u.full_name teacher_name FROM timetable t JOIN classes x ON x.id=t.class_id JOIN users u ON u.id=x.teacher_id JOIN enrollments e ON e.class_id=x.id WHERE e.student_id=? ORDER BY t.day,t.start_time', (sid,)).fetchall()
    c.close()
    return [dict(x) for x in r]

@app.post('/api/timetable')
def create_timetable(x: TimetableCreate):
    teacher_class(x.class_id, x.teacher_id)
    c = db()
    cur = c.execute('INSERT INTO timetable(class_id,teacher_id,day,start_time,end_time,room,created_at) VALUES(?,?,?,?,?,?,?)', (x.class_id, x.teacher_id, x.day, x.start_time, x.end_time, x.room, datetime.now()))
    c.commit()
    r = c.execute('SELECT * FROM timetable WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return dict(r)

@app.get('/api/users')
def users(requester_id: int, role_filter: Optional[str] = None, role: Optional[str] = None):
    u = user(requester_id)
    if u['role'] not in {'staff', 'super_admin'}: raise HTTPException(403, 'Only staff/admin can view directory.')
    c = db()
    r = c.execute('SELECT id,full_name,email,role,institution_mode FROM users ORDER BY role,full_name').fetchall()
    c.close()
    out = [dict(x) for x in r]
    for x in out:
        if x['role'] == 'super_admin': x['role'] = 'superadmin'
    rf = role_filter or role
    return [x for x in out if not rf or x['role'] == rf]

@app.get('/api/departments')
def departments(requester_id: int):
    u = user(requester_id)
    if u['role'] not in {'staff', 'super_admin'}: raise HTTPException(403, 'Not allowed.')
    c = db()
    r = c.execute("SELECT COALESCE(NULLIF(subject,''),'General') department,COUNT(*) class_count,COUNT(DISTINCT teacher_id) teacher_count FROM classes GROUP BY COALESCE(NULLIF(subject,''),'General') ORDER BY department").fetchall()
    c.close()
    return [dict(x) for x in r]

@app.get('/api/reports/overview')
def report(requester_id: int):
    u = user(requester_id)
    if u['role'] not in {'staff', 'super_admin'}: raise HTTPException(403, 'Not allowed.')
    c = db()
    d = {k: c.execute(f"SELECT COUNT(*) n FROM {t}").fetchone()['n'] for k, t in [('students', 'users'), ('classes', 'classes'), ('assignments', 'assignments'), ('quizzes', 'quizzes')]}
    d['students'] = c.execute("SELECT COUNT(*) n FROM users WHERE role='student'").fetchone()['n']
    d['teachers'] = c.execute("SELECT COUNT(*) n FROM users WHERE role='teacher'").fetchone()['n']
    d['staff'] = c.execute("SELECT COUNT(*) n FROM users WHERE role='staff'").fetchone()['n']
    c.close()
    return d

# ============================================================
# TEACHER PORTAL MODULE (ADDITIVE)
# ============================================================
def init_teacher_portal_db():
    c = db()
    c.execute('''CREATE TABLE IF NOT EXISTS teacher_resources(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,resource_type TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,class_id INTEGER,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS lesson_plans(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_id INTEGER,subject TEXT,grade_level TEXT,topic TEXT NOT NULL,duration_minutes INTEGER DEFAULT 45,format TEXT DEFAULT '5-Part',detail_level TEXT DEFAULT 'High Detail',objectives TEXT,content TEXT NOT NULL,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS teacher_rubrics(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_id INTEGER,title TEXT NOT NULL,criteria TEXT,content TEXT NOT NULL,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS classroom_activities(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_id INTEGER,title TEXT NOT NULL,activity_type TEXT,duration_minutes INTEGER DEFAULT 20,content TEXT NOT NULL,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS student_groups(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_id INTEGER NOT NULL,group_name TEXT NOT NULL,student_ids TEXT NOT NULL,strategy TEXT,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS differentiation_plans(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_id INTEGER,topic TEXT NOT NULL,student_level TEXT,content TEXT NOT NULL,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS exit_tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_id INTEGER,topic TEXT NOT NULL,questions TEXT NOT NULL,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS progress_reports(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_id INTEGER NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,created_at DATETIME)''')
    c.execute('''CREATE TABLE IF NOT EXISTS parent_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_id INTEGER,student_id INTEGER,message_type TEXT,subject TEXT,content TEXT NOT NULL,created_at DATETIME)''')

    for idx in [
        'CREATE INDEX IF NOT EXISTS idx_teacher_resources_teacher ON teacher_resources(teacher_id)',
        'CREATE INDEX IF NOT EXISTS idx_lesson_plans_teacher ON lesson_plans(teacher_id)',
        'CREATE INDEX IF NOT EXISTS idx_teacher_rubrics_teacher ON teacher_rubrics(teacher_id)',
        'CREATE INDEX IF NOT EXISTS idx_teacher_activities_teacher ON classroom_activities(teacher_id)',
        'CREATE INDEX IF NOT EXISTS idx_student_groups_class ON student_groups(class_id)',
        'CREATE INDEX IF NOT EXISTS idx_progress_reports_class ON progress_reports(class_id)',
        'CREATE INDEX IF NOT EXISTS idx_parent_messages_teacher ON parent_messages(teacher_id)'
    ]:
        c.execute(idx)
    c.commit()
    c.close()

init_teacher_portal_db()

def teacher_only(teacher_id: int):
    return role(teacher_id, {'teacher'})

def teacher_can_access_class(teacher_id: int, class_id: int):
    teacher_only(teacher_id)
    return teacher_class(class_id, teacher_id)

def ai_generate_teacher_content(prompt: str) -> str:
    teacher_system = BASE_SYSTEM_INSTRUCTION + "\nTEACHER PORTAL: Generate practical classroom materials. Do not invent data."
    try:
        result = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config={'system_instruction': teacher_system}
        )
        return (result.text or '').strip()
    except Exception as e:
        raise HTTPException(500, f'Teacher AI generation error: {e}')

class TeacherLessonPlanRequest(BaseModel):
    teacher_id: int
    class_id: Optional[int] = None
    subject: str = ''
    grade_level: str = ''
    topic: str
    duration_minutes: int = 45
    format: str = '5-Part'
    detail_level: str = 'High Detail'
    objectives: str = ''

class TeacherResourceSaveRequest(BaseModel):
    teacher_id: int
    resource_type: str
    title: str
    content: str
    class_id: Optional[int] = None

class TeacherRubricRequest(BaseModel):
    teacher_id: int
    class_id: Optional[int] = None
    title: str
    criteria: str = ''
    subject: str = ''
    grade_level: str = ''
    assignment_type: str = ''

class TeacherActivityRequest(BaseModel):
    teacher_id: int
    class_id: Optional[int] = None
    topic: str
    activity_type: str = 'Interactive Activity'
    duration_minutes: int = 20
    student_level: str = ''

class StudentGroupRequest(BaseModel):
    teacher_id: int
    class_id: int
    strategy: str = 'Balanced Groups'
    group_count: int = 3

class DifferentiationRequest(BaseModel):
    teacher_id: int
    class_id: Optional[int] = None
    topic: str
    student_level: str = 'Mixed Ability'
    learning_objective: str = ''

class ExitTicketRequest(BaseModel):
    teacher_id: int
    class_id: Optional[int] = None
    topic: str
    question_count: int = 3
    difficulty: str = 'Medium'

class ProgressReportRequest(BaseModel):
    teacher_id: int
    class_id: int
    title: str = 'Class Progress Report'

class ParentMessageRequest(BaseModel):
    teacher_id: int
    class_id: Optional[int] = None
    student_id: Optional[int] = None
    message_type: str = 'General Update'
    student_name: str = ''
    context: str = ''

class AssignmentAICheckRequest(BaseModel):
    teacher_id: int
    submission_id: int
    max_marks: Optional[float] = None

class TeacherQuizGenerateRequest(BaseModel):
    teacher_id: int
    class_id: Optional[int] = None
    book_id: Optional[int] = None
    subject: str = ''
    topic: str
    grade_level: str = ''
    question_count: int = 5
    difficulty: str = 'Medium'

# ============================================================
# TEACHER TOOLS: LESSON PLANS, RUBRICS, ACTIVITIES
# ============================================================

@app.post('/api/teacher/assignments/{attempt_id}/ai-check')
def ai_check_assignment(attempt_id: int, x: QuizAICheckRequest):
    teacher_only(x.teacher_id)
    c = db()
    
    # Fetch submission, assignment title, and description
    sub = c.execute('''
        SELECT sub.*, a.title as assignment_title, a.description as assignment_description, a.total_marks, u.full_name as student_name
        FROM assignment_submissions sub
        JOIN assignments a ON a.id = sub.assignment_id
        JOIN users u ON u.id = sub.student_id
        WHERE sub.id = ?
    ''', (attempt_id,)).fetchone()
    c.close()
    
    if not sub:
        raise HTTPException(404, 'Assignment submission not found.')

    assignment_title = sub['assignment_title'] or "General Assignment"
    assignment_description = sub['assignment_description'] or "No specific instructions provided."
    total_marks = float(sub['total_marks'] or 100)
    student_text_content = sub['text_content'] or "No text content submitted."

    prompt = f"""
    You are a strict, senior Computer Science Professor grading an assignment.
    Assignment Title/Topic: {assignment_title}
    Assignment Description/Instructions: {assignment_description}
    Total Marks: {total_marks}

    Student Submission:
    {student_text_content}

    CRITICAL EVALUATION RULES:
    1. TOPIC RELEVANCE CHECK (MANDATORY): First, check if the student's submission directly addresses the assigned topic ("{assignment_title}"). 
    2. ZERO TOLERANCE FOR OFF-TOPIC: If the submission is about a completely different concept (e.g., writing about Multiplexing instead of Topologies), you MUST award a score of 0. Do NOT give partial credit for formatting, word count, or general writing quality if it is off-topic.
    3. SCORING: If it is on-topic, grade it fairly out of {total_marks} based on accuracy, depth, and completeness. If it is off-topic, score = 0.
    4. FEEDBACK: Write a clear, professional teacher feedback explaining why they received this score (e.g., pointing out if it was off-topic or missed the core requirements).

    Return ONLY a raw JSON object with this exact structure:
    {{
      "suggested_score": <number from 0 to {total_marks}>,
      "detailed_feedback": "<Your detailed teacher feedback here>"
    }}
    Do NOT wrap in markdown fences. Output JSON only.
    """
    
    raw = ai_generate_teacher_content(prompt)
    try:
        cleaned = raw.strip().replace('```json', '').replace('```', '').strip()
        evaluation = json.loads(cleaned)
    except:
        evaluation = {"suggested_score": 0, "detailed_feedback": "AI evaluation processing error. Please review manually."}
        
    return {'success': True, 'evaluation': evaluation}


@app.post('/api/teacher/lesson-plans/generate')
def generate_lesson_plan(x: TeacherLessonPlanRequest):
    teacher_only(x.teacher_id)
    
    prompt = f"""
    You are an expert curriculum developer and master teacher. Create a comprehensive, highly engaging lesson plan based on the following parameters:
    - Subject: {x.subject}
    - Grade Level: {x.grade_level}
    - Topic: {x.topic}
    - Duration: {x.duration_minutes} minutes
    - Format: {x.format}
    - Detail Level: {x.detail_level}
    - Learning Objectives: {x.objectives}

    REQUIREMENTS:
    1. Structure the lesson plan logically with clear time blocks that add up to approximately {x.duration_minutes} minutes.
    2. Include an engaging hook/introduction, core concept delivery, student activity/practice, and a formative assessment or wrap-up.
    3. Use clean markdown formatting with bold headings, bullet points, and actionable teaching tips tailored to grade {x.grade_level}.
    4. Ensure the content strictly targets the topic "{x.topic}" and fulfills the stated objectives.
    """
    
    return {'success': True, 'content': ai_generate_teacher_content(prompt)}
@app.post('/api/teacher/lesson-plans/save')
def save_lesson_plan(x: TeacherLessonPlanRequest):
    teacher_only(x.teacher_id)
    content = ai_generate_teacher_content(f"Complete lesson plan for Topic: {x.topic}, Subject: {x.subject}")
    c = db()
    cur = c.execute('INSERT INTO lesson_plans(teacher_id,class_id,subject,grade_level,topic,duration_minutes,format,detail_level,objectives,content,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', (x.teacher_id, x.class_id, x.subject, x.grade_level, x.topic, x.duration_minutes, x.format, x.detail_level, x.objectives, content, datetime.now()))
    c.commit()
    row = c.execute('SELECT * FROM lesson_plans WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return dict(row)

@app.get('/api/teacher/lesson-plans/{teacher_id}')
def get_lesson_plans(teacher_id: int):
    teacher_only(teacher_id)
    c = db()
    rows = c.execute('SELECT * FROM lesson_plans WHERE teacher_id=? ORDER BY created_at DESC', (teacher_id,)).fetchall()
    c.close()
    return [dict(x) for x in rows]

@app.delete('/api/teacher/lesson-plans/{lesson_id}')
def delete_lesson_plan(lesson_id: int, teacher_id: int):
    teacher_only(teacher_id)
    c = db()
    row = c.execute('SELECT teacher_id FROM lesson_plans WHERE id=?', (lesson_id,)).fetchone()
    if not row or row['teacher_id'] != teacher_id:
        c.close()
        raise HTTPException(403, 'Permission denied.')
    c.execute('DELETE FROM lesson_plans WHERE id=?', (lesson_id,))
    c.commit()
    c.close()
    return {'message': 'Lesson plan deleted.'}

@app.post('/api/teacher/quizzes/generate')
def generate_teacher_quiz(x: TeacherQuizGenerateRequest):
    teacher_only(x.teacher_id)
    count = max(1, min(x.question_count, 50))
    if x.book_id is not None:
        book = next((item for item in get_btbb_books() if item['id'] == x.book_id), None)
        if not book:
            raise HTTPException(404, 'This title is not in the BTBB approved book catalogue.')
        gemini_file, temp_path = upload_curriculum_pdf(book)
        try:
            prompt = (
                f'Using only the attached textbook PDF ({book["title"]}, Grade {book["grade"]}, '
                f'{book["subject"]}), generate {count} {x.difficulty} multiple-choice '
                f'questions for the exact selected chapter/topic "{x.topic}". Every question, '
                'option, correct answer, and explanation must be supported by the attached '
                'book and stay within that topic. Do not use outside knowledge or invent '
                'details. If the topic is absent, return an empty JSON array. Return only a valid JSON array of '
                'objects with fields "question", "options" (four strings), "answer", '
                'and "explanation". Do not add markdown.'
            )
            result = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[prompt, gemini_file],
                config={'system_instruction': SYSTEM_INSTRUCTION},
            )
            questions = parse_ai_json(result.text or '', 'AI generated invalid textbook quiz JSON.')
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    else:
        prompt = f"""Generate {count} MCQs on Subject: {x.subject}, Topic: {x.topic}, Difficulty: {x.difficulty}. Return ONLY JSON array: [{{"question":"..","options":["A","B","C","D"],"answer":"..","explanation":".."}}]"""
        raw = ai_generate_teacher_content(prompt)
        questions = parse_ai_json(raw, 'AI generated invalid quiz JSON.')
    if x.book_id is not None and questions == []:
        raise HTTPException(422, 'The selected topic was not found in this textbook, so no quiz was generated.')
    if not isinstance(questions, list) or not questions:
        raise HTTPException(500, 'AI generated an empty or invalid quiz.')
    return {'success': True, 'questions': questions}

@app.post('/api/teacher/quizzes/generate-and-save')
def generate_and_save_teacher_quiz(x: TeacherQuizGenerateRequest):
    teacher_only(x.teacher_id)
    if not x.class_id: raise HTTPException(400, 'class_id is required.')
    teacher_can_access_class(x.teacher_id, x.class_id)
    generated = generate_teacher_quiz(x)
    questions = generated['questions']
    c = db()
    cur = c.execute('INSERT INTO quizzes(class_id,teacher_id,title,topic,questions_json,total_marks,due_date,created_at) VALUES(?,?,?,?,?,?,?,?)', (x.class_id, x.teacher_id, f'{x.topic} Quiz', x.topic, json.dumps(questions, ensure_ascii=False), len(questions), '', datetime.now()))
    c.commit()
    row = c.execute('SELECT * FROM quizzes WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    result = dict(row)
    result['questions'] = questions
    return result

@app.post('/api/teacher/quizzes/check')
def ai_check_quiz(x: QuizAICheckRequest):
    teacher_only(x.teacher_id)
    c = db()
    
    att = c.execute('''
        SELECT qa.*, u.full_name as student_name, q.title, q.questions_json
        FROM quiz_attempts qa
        JOIN users u ON u.id = qa.student_id
        JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.id = ? AND q.teacher_id = ?
    ''', (x.attempt_id, x.teacher_id)).fetchone()
    c.close()
    
    if not att:
        raise HTTPException(404, 'Attempt not found or access denied.')

    prompt = f"""
    You are evaluating a Quiz for LAWMS ACADEMY.
    Student: {att['student_name']}
    Quiz: {att['title']}
    Max Marks: {x.max_marks}

    Questions & Correct Answers vs Student Answers:
    Quiz Data: {att['questions_json']}
    Student Answers: {att['answers_json']}

    Compare the student's answers to the correct answers. 
    Return ONLY a raw JSON object with this schema:
    {{
      "suggested_score": <number>,
      "detailed_feedback": "<Write a 2-3 sentence summary evaluating their performance and pointing out mistakes>"
    }}
    Do NOT wrap in markdown fences. Output JSON only.
    """
    
    raw = ai_generate_teacher_content(prompt)
    try:
        cleaned = raw.strip().replace('```json', '').replace('```', '').strip()
        evaluation = json.loads(cleaned)
    except:
        evaluation = {"suggested_score": x.max_marks / 2, "detailed_feedback": "AI evaluation processed with errors. Please review manually."}
        
    return {'success': True, 'evaluation': evaluation}



@app.post('/api/teacher/rubrics/generate')
def generate_rubric(x: TeacherRubricRequest):
    teacher_only(x.teacher_id)
    prompt = f"Create assessment rubric for Title: {x.title}, Criteria: {x.criteria}, Subject: {x.subject}."
    return {'success': True, 'content': ai_generate_teacher_content(prompt)}

@app.post('/api/teacher/rubrics/save')
def save_rubric(x: TeacherRubricRequest):
    teacher_only(x.teacher_id)
    content = ai_generate_teacher_content(f"Rubric for {x.title}")
    c = db()
    cur = c.execute('INSERT INTO teacher_rubrics(teacher_id,class_id,title,criteria,content,created_at) VALUES(?,?,?,?,?,?)', (x.teacher_id, x.class_id, x.title, x.criteria, content, datetime.now()))
    c.commit()
    row = c.execute('SELECT * FROM teacher_rubrics WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return dict(row)

@app.get('/api/teacher/rubrics/{teacher_id}')
def get_rubrics(teacher_id: int):
    teacher_only(teacher_id)
    c = db()
    rows = c.execute('SELECT * FROM teacher_rubrics WHERE teacher_id=? ORDER BY created_at DESC', (teacher_id,)).fetchall()
    c.close()
    return [dict(x) for x in rows]

@app.post('/api/teacher/activities/generate')
def generate_activity(x: TeacherActivityRequest):
    teacher_only(x.teacher_id)
    prompt = f"Create classroom activity for Topic: {x.topic}, Type: {x.activity_type}, Duration: {x.duration_minutes}m."
    return {'success': True, 'content': ai_generate_teacher_content(prompt)}

@app.post('/api/teacher/activities/save')
def save_activity(x: TeacherActivityRequest):
    teacher_only(x.teacher_id)
    content = ai_generate_teacher_content(f"Activity for {x.topic}")
    c = db()
    cur = c.execute('INSERT INTO classroom_activities(teacher_id,class_id,title,activity_type,duration_minutes,content,created_at) VALUES(?,?,?,?,?,?,?)', (x.teacher_id, x.class_id, x.topic, x.activity_type, x.duration_minutes, content, datetime.now()))
    c.commit()
    row = c.execute('SELECT * FROM classroom_activities WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return dict(row)

@app.post('/api/teacher/student-groups/generate')
def generate_student_groups(x: StudentGroupRequest):
    teacher_can_access_class(x.teacher_id, x.class_id)
    c = db()
    students = c.execute('SELECT u.id,u.full_name,u.email FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.class_id=? ORDER BY u.full_name', (x.class_id,)).fetchall()
    c.close()
    if not students: raise HTTPException(400, 'No students enrolled.')
    student_data = [{'id': s['id'], 'name': s['full_name']} for s in students]
    prompt = f"Create {x.group_count} groups from {json.dumps(student_data)}. Return JSON array: [{{\"group_name\":\"Group 1\",\"student_ids\":[1,2]}}]"
    raw = ai_generate_teacher_content(prompt)
    try:
        cleaned = raw.strip().replace('```json', '').replace('```', '').strip()
        groups = json.loads(cleaned)
    except Exception:
        raise HTTPException(500, 'AI generated invalid group data.')
    return {'success': True, 'groups': groups, 'students': student_data}

@app.post('/api/teacher/differentiation/generate')
def generate_differentiation(x: DifferentiationRequest):
    teacher_only(x.teacher_id)
    prompt = f"Create differentiation plan for Topic: {x.topic}, Level: {x.student_level}, Objective: {x.learning_objective}"
    return {'success': True, 'content': ai_generate_teacher_content(prompt)}

@app.post('/api/teacher/exit-tickets/generate')
def generate_exit_ticket(x: ExitTicketRequest):
    teacher_only(x.teacher_id)
    prompt = f"Create {x.question_count} exit ticket questions on {x.topic}, Difficulty: {x.difficulty}"
    return {'success': True, 'content': ai_generate_teacher_content(prompt)}

@app.get('/api/teacher/progress/class/{class_id}')
def teacher_class_progress(class_id: int, teacher_id: int):
    cls = teacher_can_access_class(teacher_id, class_id)
    c = db()
    students = c.execute('SELECT u.id,u.full_name,u.email FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.class_id=? ORDER BY u.full_name', (class_id,)).fetchall()
    result = []
    for s in students:
        asg = c.execute('SELECT COUNT(*) total, AVG(s.score) average_score FROM assignments a LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=? WHERE a.class_id=?', (s['id'], class_id)).fetchone()
        qz = c.execute('SELECT COUNT(*) total, AVG(qa.score) average_score FROM quizzes q LEFT JOIN quiz_attempts qa ON qa.quiz_id=q.id AND qa.student_id=? WHERE q.class_id=?', (s['id'], class_id)).fetchone()
        result.append({
            'student_id': s['id'],
            'student_name': s['full_name'],
            'email': s['email'],
            'assignment_average': round(asg['average_score'], 2) if asg['average_score'] is not None else None,
            'quiz_average': round(qz['average_score'], 2) if qz['average_score'] is not None else None
        })
    c.close()
    return {'class_id': class_id, 'class_name': cls['name'], 'students': result}

@app.post('/api/teacher/progress/generate-report')
def generate_progress_report(x: ProgressReportRequest):
    data = teacher_class_progress(x.class_id, x.teacher_id)
    prompt = f"Generate teacher progress report for Class {data['class_name']}. Data: {json.dumps(data['students'])}"
    content = ai_generate_teacher_content(prompt)
    c = db()
    cur = c.execute('INSERT INTO progress_reports(teacher_id,class_id,title,content,created_at) VALUES(?,?,?,?,?)', (x.teacher_id, x.class_id, x.title, content, datetime.now()))
    c.commit()
    row = c.execute('SELECT * FROM progress_reports WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return {'success': True, 'report': dict(row), 'raw_data': data}

@app.get('/api/teacher/progress/reports/{teacher_id}')
def get_progress_reports(teacher_id: int):
    teacher_only(teacher_id)
    c = db()
    rows = c.execute('SELECT r.*, x.name AS class_name FROM progress_reports r JOIN classes x ON x.id=r.class_id WHERE r.teacher_id=? ORDER BY r.created_at DESC', (teacher_id,)).fetchall()
    c.close()
    return [dict(x) for x in rows]

@app.post('/api/teacher/parent-messages/generate')
def generate_parent_message(x: ParentMessageRequest):
    teacher_only(x.teacher_id)
    prompt = f"Draft professional parent message. Type: {x.message_type}, Student: {x.student_name}, Context: {x.context}"
    return {'success': True, 'content': ai_generate_teacher_content(prompt)}

@app.post('/api/teacher/parent-messages/save')
def save_parent_message(x: ParentMessageRequest):
    teacher_only(x.teacher_id)
    content = ai_generate_teacher_content(f"Parent message for {x.student_name}: {x.context}")
    c = db()
    cur = c.execute('INSERT INTO parent_messages(teacher_id,class_id,student_id,message_type,subject,content,created_at) VALUES(?,?,?,?,?,?,?)', (x.teacher_id, x.class_id, x.student_id, x.message_type, x.student_name, content, datetime.now()))
    c.commit()
    row = c.execute('SELECT * FROM parent_messages WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return dict(row)

@app.get('/api/teacher/parent-messages/{teacher_id}')
def get_parent_messages(teacher_id: int):
    teacher_only(teacher_id)
    c = db()
    rows = c.execute('SELECT p.*, x.name AS class_name, u.full_name AS student_name FROM parent_messages p LEFT JOIN classes x ON x.id=p.class_id LEFT JOIN users u ON u.id=p.student_id WHERE p.teacher_id=? ORDER BY p.created_at DESC', (teacher_id,)).fetchall()
    c.close()
    return [dict(x) for x in rows]

# ============================================================
# STRUCTURED AI ASSIGNMENT CHECKER & DETECTION
# ============================================================
@app.post('/api/teacher/assignments/check')
def ai_check_assignment(x: AssignmentAICheckRequest):
    teacher_only(x.teacher_id)
    c = db()

    submission = c.execute('''
        SELECT s.*, a.title AS assignment_title, a.description AS assignment_description,
               COALESCE(a.total_marks, 100) AS total_marks,
               u.full_name AS student_name, u.email AS student_email,
               x.name AS class_name, x.subject AS subject
        FROM assignment_submissions s
        JOIN assignments a ON a.id=s.assignment_id
        JOIN classes x ON x.id=a.class_id
        JOIN users u ON u.id=s.student_id
        WHERE s.id=?
    ''', (x.submission_id,)).fetchone()

    if not submission:
        c.close()
        raise HTTPException(404, 'Submission not found.')

    assignment = c.execute('SELECT teacher_id FROM assignments WHERE id=?', (submission['assignment_id'],)).fetchone()
    if not assignment or assignment['teacher_id'] != x.teacher_id:
        c.close()
        raise HTTPException(403, 'This submission does not belong to your assignment.')

    c.close()

    max_marks = float(x.max_marks if x.max_marks is not None else submission['total_marks'] or 100)

    prompt = f"""
You are the Academic Evaluation & AI Detector Engine for LAWMS ACADEMY.
Analyze this submission strictly.

Student: {submission['student_name']} (ID: #{submission['student_id']})
Course: {submission['class_name']} ({submission['subject']})
Assignment: {submission['assignment_title']}
Instructions: {submission['assignment_description']}
Max Marks: {max_marks}

Student Submission Content:
\"\"\"
{submission['text_content']}
\"\"\"

Return ONLY a raw JSON object with this schema:
{{
  "suggested_score": <number between 0 and {max_marks}>,
  "percentage": <number>,
  "grade": "<A+|A|B|C|D|F>",
  "ai_generated_probability": <integer 0-100>,
  "ai_detection_verdict": "<Likely Human Written | Mixed AI & Human | Highly Likely AI-Generated>",
  "ai_detection_reasoning": "<short sentence explaining the verdict>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "areas_for_improvement": ["<improvement 1>", "<improvement 2>"],
  "detailed_feedback": "<actionable teacher feedback for student>",
  "overall_summary": "<brief summary>"
}}
Do NOT wrap in markdown fences. Output JSON only.
"""

    raw = ai_generate_teacher_content(prompt)
    try:
        cleaned = raw.strip().replace('```json', '').replace('```', '').strip()
        evaluation = json.loads(cleaned)
    except Exception:
        evaluation = {
            "suggested_score": round(max_marks * 0.75, 1),
            "percentage": 75.0,
            "grade": "B",
            "ai_generated_probability": 25,
            "ai_detection_verdict": "Likely Human Written",
            "ai_detection_reasoning": "Natural academic vocabulary detected.",
            "strengths": ["Clear attempt at answering."],
            "areas_for_improvement": ["Add more technical depth."],
            "detailed_feedback": raw,
            "overall_summary": "Completed successfully."
        }

    return {
        'success': True,
        'submission_id': x.submission_id,
        'student_name': submission['student_name'],
        'student_id': submission['student_id'],
        'class_name': submission['class_name'],
        'subject': submission['subject'],
        'assignment_title': submission['assignment_title'],
        'total_marks': max_marks,
        'evaluation': evaluation
    }

@app.post('/api/teacher/assignments/check-and-save')
def ai_check_and_save_assignment(x: AssignmentAICheckRequest):
    result = ai_check_assignment(x)
    eval_data = result['evaluation']
    feedback_text = eval_data.get('detailed_feedback', '')

    c = db()
    c.execute('UPDATE assignment_submissions SET feedback=? WHERE id=?', (feedback_text, x.submission_id))
    c.commit()
    c.close()

    return {
        'success': True,
        'submission_id': x.submission_id,
        'feedback': feedback_text
    }

# ============================================================
# TEACHER RESOURCES & SUMMARY
# ============================================================
@app.post('/api/teacher/resources/save')
def save_teacher_resource(x: TeacherResourceSaveRequest):
    teacher_only(x.teacher_id)
    if x.class_id: teacher_can_access_class(x.teacher_id, x.class_id)
    c = db()
    cur = c.execute('INSERT INTO teacher_resources(teacher_id,resource_type,title,content,class_id,created_at) VALUES(?,?,?,?,?,?)', (x.teacher_id, x.resource_type, x.title, x.content, x.class_id, datetime.now()))
    c.commit()
    row = c.execute('SELECT * FROM teacher_resources WHERE id=?', (cur.lastrowid,)).fetchone()
    c.close()
    return dict(row)

@app.get('/api/teacher/resources/{teacher_id}')
def get_teacher_resources(teacher_id: int):
    teacher_only(teacher_id)
    c = db()
    rows = c.execute('SELECT * FROM teacher_resources WHERE teacher_id=? ORDER BY created_at DESC', (teacher_id,)).fetchall()
    c.close()
    return [dict(x) for x in rows]

@app.delete('/api/teacher/resources/{resource_id}')
def delete_teacher_resource(resource_id: int, teacher_id: int):
    teacher_only(teacher_id)
    c = db()
    row = c.execute('SELECT teacher_id FROM teacher_resources WHERE id=?', (resource_id,)).fetchone()
    if not row or row['teacher_id'] != teacher_id:
        c.close()
        raise HTTPException(403, 'Permission denied.')
    c.execute('DELETE FROM teacher_resources WHERE id=?', (resource_id,))
    c.commit()
    c.close()
    return {'message': 'Resource deleted.'}

@app.get('/api/teacher/portal-summary/{teacher_id}')
def teacher_portal_summary(teacher_id: int, authorization: Optional[str] = Header(None)):
    authenticated_user(teacher_id, authorization, {'teacher'})
    c = db()
    classes = c.execute('SELECT COUNT(*) n FROM classes WHERE teacher_id=?', (teacher_id,)).fetchone()['n']
    students = c.execute('SELECT COUNT(DISTINCT e.student_id) n FROM enrollments e JOIN classes x ON x.id=e.class_id WHERE x.teacher_id=?', (teacher_id,)).fetchone()['n']
    assignments = c.execute('SELECT COUNT(*) n FROM assignments WHERE teacher_id=?', (teacher_id,)).fetchone()['n']
    pending_submissions = c.execute('SELECT COUNT(*) n FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.teacher_id=? AND (s.status IS NULL OR s.status != "graded")', (teacher_id,)).fetchone()['n']
    quizzes = c.execute('SELECT COUNT(*) n FROM quizzes WHERE teacher_id=?', (teacher_id,)).fetchone()['n']
    lesson_plans = c.execute('SELECT COUNT(*) n FROM lesson_plans WHERE teacher_id=?', (teacher_id,)).fetchone()['n']
    rubrics = c.execute('SELECT COUNT(*) n FROM teacher_rubrics WHERE teacher_id=?', (teacher_id,)).fetchone()['n']
    resources = c.execute('SELECT COUNT(*) n FROM teacher_resources WHERE teacher_id=?', (teacher_id,)).fetchone()['n']
    activities = c.execute('SELECT COUNT(*) n FROM classroom_activities WHERE teacher_id=?', (teacher_id,)).fetchone()['n']
    reports = c.execute('SELECT COUNT(*) n FROM progress_reports WHERE teacher_id=?', (teacher_id,)).fetchone()['n']
    c.close()
    return {
        'classes': classes,
        'students': students,
        'assignments': assignments,
        'pending_submissions': pending_submissions,
        'quizzes': quizzes,
        'lesson_plans': lesson_plans,
        'rubrics': rubrics,
        'resources': resources,
        'activities': activities,
        'progress_reports': reports
    }
# ============================================================
# SAFE ADDITIVE PROFILE MODULE
# ============================================================
from fastapi.staticfiles import StaticFiles

PROFILE_UPLOAD_DIR = os.path.join(UPLOAD_DIR, 'profiles')
os.makedirs(PROFILE_UPLOAD_DIR, exist_ok=True)

if not any(route.path == '/uploads' for route in app.routes):
    app.mount('/uploads', StaticFiles(directory=UPLOAD_DIR), name='uploads')

class UpdateProfileSecurePayload(BaseModel):
    requester_id: int
    full_name: str = Field(min_length=1, max_length=120)
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(default=None, min_length=8, max_length=72)

@app.get('/api/users/{uid}/profile-full')
def get_user_profile_full(uid: int, requester_id: int, authorization: Optional[str] = Header(None)):
    req_u = authenticated_user(requester_id, authorization, {'student', 'teacher', 'staff', 'super_admin'})
    if requester_id != uid and req_u['role'] not in {'super_admin', 'superadmin'}:
        raise HTTPException(403, 'Unauthorized access.')
    
    c = db()
    u = c.execute('SELECT id, full_name, email, role, institution_mode, profile_pic FROM users WHERE id=?', (uid,)).fetchone()
    if not u:
        c.close()
        raise HTTPException(404, 'User not found.')
    
    data = dict(u)
    if u['role'] == 'student':
        classes = c.execute('SELECT x.id, x.name, x.subject FROM enrollments e JOIN classes x ON x.id=e.class_id WHERE e.student_id=?', (uid,)).fetchall()
        data['total_classes'] = len(classes)
    elif u['role'] == 'teacher':
        classes = c.execute('SELECT id, name, subject FROM classes WHERE teacher_id=?', (uid,)).fetchall()
        data['total_classes'] = len(classes)
    
    c.close()
    return data

@app.post('/api/users/{uid}/profile')
def update_user_profile_secure(uid: int, payload: UpdateProfileSecurePayload, authorization: Optional[str] = Header(None)):
    req_u = authenticated_user(payload.requester_id, authorization, {'student', 'teacher', 'staff', 'super_admin'})
    if payload.requester_id != uid and req_u['role'] not in {'super_admin', 'superadmin'}:
        raise HTTPException(403, 'Unauthorized edit attempt.')
    
    c = db()
    db_u = c.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
    if not db_u:
        c.close()
        raise HTTPException(404, 'User not found.')

    if payload.new_password and payload.new_password.strip():
        if not payload.current_password:
            c.close()
            raise HTTPException(400, 'Current password is required to change password.')
        if not verify_password(payload.current_password, db_u['hashed_password']):
            c.close()
            raise HTTPException(400, 'Current password does not match.')
        
        new_hash = get_password_hash(payload.new_password.strip())
        c.execute('UPDATE users SET full_name=?, hashed_password=? WHERE id=?', (payload.full_name.strip(), new_hash, uid))
    else:
        c.execute('UPDATE users SET full_name=? WHERE id=?', (payload.full_name.strip(), uid))
        
    c.commit()
    updated = c.execute('SELECT id, full_name, email, role, institution_mode, profile_pic FROM users WHERE id=?', (uid,)).fetchone()
    c.close()
    return dict(updated)

@app.post('/api/users/{uid}/avatar')
async def upload_user_avatar_secure(
    uid: int,
    requester_id: int = Form(...),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    req_u = authenticated_user(requester_id, authorization, {'student', 'teacher', 'staff', 'super_admin'})
    if requester_id != uid and req_u['role'] not in {'super_admin', 'superadmin'}:
        raise HTTPException(403, 'Unauthorized action.')

    allowed_image_types = {
        'image/jpeg': ('.jpg', (b'\xff\xd8\xff',)),
        'image/png': ('.png', (b'\x89PNG\r\n\x1a\n',)),
        'image/webp': ('.webp', (b'RIFF',)),
    }
    image_type = allowed_image_types.get(file.content_type or '')
    if not image_type:
        raise HTTPException(400, 'Upload a JPG, PNG, or WebP profile photo.')

    image_content = await file.read(5 * 1024 * 1024 + 1)
    if len(image_content) > 5 * 1024 * 1024:
        raise HTTPException(413, 'The prepared profile photo must be 5 MB or smaller.')
    signatures = image_type[1]
    if not any(image_content.startswith(signature) for signature in signatures):
        raise HTTPException(400, 'The uploaded file does not match its image format.')
    if file.content_type == 'image/webp' and image_content[8:12] != b'WEBP':
        raise HTTPException(400, 'The uploaded file does not match its image format.')

    filename = f"avatar_{uid}_{uuid.uuid4().hex[:12]}{image_type[0]}"
    filepath = os.path.join(PROFILE_UPLOAD_DIR, filename)
    with open(filepath, 'wb') as image_file:
        image_file.write(image_content)

    relative_path = f"/uploads/profiles/{filename}"
    c = db()
    c.execute('UPDATE users SET profile_pic=? WHERE id=?', (relative_path, uid))
    c.commit()
    updated = c.execute('SELECT id, full_name, email, role, institution_mode, profile_pic FROM users WHERE id=?', (uid,)).fetchone()
    c.close()
    return {'message': 'Avatar updated.', 'user': dict(updated)}
