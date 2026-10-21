import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_BASE, API_CONFIG_ERROR } from "./apiConfig";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  BookCopy,
  Camera,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ClipboardList,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  LogOut,
  Languages,
  Megaphone,
  Menu,
  MessageSquare,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Presentation,
  Reply,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  StopCircle,
  Target,
  Trash2,
  UploadCloud,
  Users,
  Video,
  WandSparkles,
  X,
  Building2,
  ChevronRight,
} from "lucide-react";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const DASHBOARD_IMAGES = {
  teacher: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1400&q=80",
  student: "https://images.unsplash.com/photo-1660128357542-ee58f1c72586?auto=format&fit=crop&w=1400&q=80",
  staff: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=80",
};
const CLASS_CHAT_TRANSLATION_LANGUAGES = [
  "Urdu", "English", "Balochi", "Pashto", "Brahui", "Punjabi (Shahmukhi)", "Sindhi", "Saraiki", "Arabic", "Spanish", "Persian", "Hindi", "Bengali", "French", "German", "Turkish", "Chinese", "Russian", "Dari", "Kashmiri", "Hindko",
];
const CLASS_CHAT_RTL_LANGUAGES = new Set(["Urdu", "Balochi", "Pashto", "Brahui", "Punjabi (Shahmukhi)", "Sindhi", "Saraiki", "Arabic", "Persian", "Dari", "Kashmiri", "Hindko"]);
const MAX_AVATAR_FILE_SIZE = 10 * 1024 * 1024;

async function cropProfileImage(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_AVATAR_FILE_SIZE) {
    throw new Error("Choose an image smaller than 10 MB.");
  }

  const image = await createImageBitmap(file);
  try {
    const side = Math.min(image.width, image.height);
    if (!side) throw new Error("This image could not be read.");
    const sourceX = (image.width - side) / 2;
    const sourceY = (image.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this profile photo.");
    context.drawImage(image, sourceX, sourceY, side, side, 0, 0, 512, 512);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("Could not prepare the cropped profile photo.");
    const baseName = file.name.replace(/\.[^.]+$/, "") || "profile-photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    image.close();
  }
}

const SUBJECTS = [
  "URDU",
  "ENGLISH",
  "ISLAMIYAT",
  "MATHS",
  "SCIENCE",
  "COMPUTER SCIENCE",
];

const CURRICULUM_STAGES = [
  {
    name: "Primary",
    grades: "Grades 1-5",
    description: "Build literacy, numeracy, curiosity and a strong foundation for lifelong learning.",
    subjects: ["English", "Urdu", "Mathematics", "General Knowledge", "General Science", "Islamiat / Religious Education", "Balochi, Brahui, Pashto or other local language"],
  },
  {
    name: "Middle",
    grades: "Grades 6-8",
    description: "Strengthen core skills and introduce broader science, society and digital learning.",
    subjects: ["English", "Urdu", "Mathematics", "General Science", "Social Studies", "Islamiat / Religious Education", "Computer Studies", "Regional Language"],
  },
  {
    name: "Secondary",
    grades: "Grades 9-10 · SSC",
    description: "Prepare for secondary certification through core subjects and locally offered electives.",
    subjects: ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology or Computer Science", "Pakistan Studies", "Islamiat / Religious Education"],
  },
  {
    name: "Higher Secondary",
    grades: "Grades 11-12 · HSSC",
    description: "Choose a study group aligned with college offerings and future goals.",
    subjects: ["Pre-Medical: Biology, Physics, Chemistry", "Pre-Engineering: Mathematics, Physics, Chemistry", "Computer Science: Mathematics, Physics, Computer Science", "Humanities and Social Sciences", "Commerce and Business Studies", "English, Urdu and required core subjects"],
  },
  {
    name: "University",
    grades: "Undergraduate · Graduate",
    description: "Explore degree-level study across public and private institutions in Balochistan.",
    subjects: ["Education", "Computer Science and IT", "Engineering", "Health and Life Sciences", "Agriculture and Veterinary Sciences", "Business and Management", "Social Sciences and Humanities", "Balochi, Brahui and regional studies"],
  },
] as const;

const INSTITUTION_CURRICULUM_STAGES: Record<Institution, string[]> = {
  School: ["Primary", "Middle", "Secondary"],
  College: ["Higher Secondary"],
  University: ["University"],
};

const SCHOOL_BOOK_GRADES: Array<number | string> = ["Primer", ...Array.from({ length: 10 }, (_, index) => index + 1)];
const COLLEGE_BOOK_GRADES: Array<number | string> = [11, 12];
const ALL_BOOK_GRADES: Array<number | string> = ["Primer", ...Array.from({ length: 12 }, (_, index) => index + 1), "General"];

function institutionCurriculumStages(institution?: string) {
  if (institution === "School" || institution === "College" || institution === "University") {
    return INSTITUTION_CURRICULUM_STAGES[institution];
  }
  return CURRICULUM_STAGES.map((stage) => stage.name);
}

function institutionBookGrades(institution?: string): Array<number | string> | null {
  if (institution === "School") return SCHOOL_BOOK_GRADES;
  if (institution === "College") return COLLEGE_BOOK_GRADES;
  if (institution === "University") return [];
  return null;
}

const CLASS_GRADE_OPTIONS = [
  "Primary - Grade 1", "Primary - Grade 2", "Primary - Grade 3", "Primary - Grade 4", "Primary - Grade 5",
  "Middle - Grade 6", "Middle - Grade 7", "Middle - Grade 8",
  "Secondary - Grade 9", "Secondary - Grade 10",
  "Higher Secondary - Grade 11", "Higher Secondary - Grade 12",
  "University - Undergraduate", "University - Postgraduate",
];

function classGradeOptions(institution?: string) {
  if (institution === "School") return CLASS_GRADE_OPTIONS.slice(0, 10);
  if (institution === "College") return CLASS_GRADE_OPTIONS.slice(10, 12);
  if (institution === "University") return CLASS_GRADE_OPTIONS.slice(12);
  return CLASS_GRADE_OPTIONS;
}

function classSubjectOptions(institution?: string, gradeLevel?: string) {
  if (institution === "University") return [];
  if (institution === "College") return ["English", "Urdu", "Islamic Studies / Ethics", "Pakistan Studies", "Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Economics", "Accounting", "Business Studies", "Statistics", "Civics", "History", "Geography"];
  if (institution === "School") {
    if (gradeLevel?.startsWith("Secondary")) return ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Pakistan Studies", "Islamiat / Religious Education"];
    if (gradeLevel?.startsWith("Middle")) return ["English", "Urdu", "Mathematics", "General Science", "Social Studies", "Computer Studies", "Islamiat / Religious Education", "Regional Language"];
    return ["English", "Urdu", "Mathematics", "General Knowledge", "General Science", "Islamiat / Religious Education", "Regional Language"];
  }
  return SUBJECTS;
}

function curriculumClassSubjects(institution?: string, gradeLevel?: string, books: CurriculumBook[] = []) {
  const gradeMatch = String(gradeLevel || "").match(/grade\s*(\d+)/i);
  const grade = gradeMatch?.[1];
  const officialSubjects = [...new Set(books
    .filter((book) => !grade || String(book.grade) === grade)
    .map((book) => String(book.subject || "").trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
  return officialSubjects.length ? officialSubjects : classSubjectOptions(institution, gradeLevel);
}

type Role = "student" | "teacher" | "staff";
type Institution = "School" | "College" | "University";
type Tab =
  | "profile"
  | "dashboard"
  | "classes"
  | "class-detail"
  | "assignments"
  | "submissions"
  | "tools"
  | "tool-form"
  | "resources"
  | "quizzes"
  | "attendance"
  | "results"
  | "announcements"
  | "timetable"
  | "browse-subjects"
  | "subject-view"
  | "student-class-detail"
  | "student-assignment"
  | "student-quiz"
  | "reports"
  | "teacher-quiz-submissions"
  | "departments"
  | "students"
  | "teachers"
  | "staff"
  | "communications"
  | "meetings"
  | "chat";


interface User {
  user_id: number;
  roll_number?: string | null;
  access_token?: string;
  profile_pic?: string;
  full_name: string;
  email: string;
  role: Role;
  institution_mode?: Institution;
}

interface CurriculumBook {
  id: number;
  title: string;
  grade: number | string;
  subject: string;
  medium: string;
  reader_url: string;
  ebook_available: boolean;
  cover_url?: string;
}

interface CurriculumChapter {
  title: string;
  topics: string[];
}

interface UniversityProgram {
  id: string;
  name: string;
}

interface UniversityDepartment {
  name: string;
  programs: UniversityProgram[];
}

interface UniversityCourse {
  title: string;
  code: string;
  credit_hours: string;
}

interface UniversitySemester {
  semester: number;
  name: string;
  courses: UniversityCourse[];
}

interface UniversityTrack {
  name: string;
  semesters: UniversitySemester[];
}

interface UniversityOutline {
  program: string;
  department: string;
  tracks: UniversityTrack[];
}

interface ToolConfig {
  id: string;
  title: string;
  description: string;
  category: string;
  subtitle: string;
}

interface ChatMessage {
  sender: "user" | "assistant";
  content: string;
  input_type?: string;
  transcription?: string;
}

interface TeacherClass {
  id: number;
  name: string;
  subject: string;
  institution_mode?: string;
  grade_level?: string;
  section?: string;
  course_code?: string;
  description?: string;
  join_code: string;
  teacher_id: number;
  teacher_name?: string;
  student_count?: number;
  is_active?: number | boolean;
  created_at?: string;
  announcements?: ClassAnnouncement[];
}

interface ClassAnnouncement {
  id: number;
  title: string;
  body: string;
  created_at: string;
  author_name: string;
}

interface Assignment {
  id: number;
  class_id: number;
  teacher_id: number;
  title: string;
  description?: string;
  due_date?: string;
  total_marks: number;
  class_name?: string;
  submission_count?: number;
  created_at?: string;
  submission_id?: number | null;
  score?: number | null;
  feedback?: string | null;
  status?: string | null;
}

interface Submission {
  id: number;
  assignment_id: number;
  student_id: number;
  student_name: string;
  email?: string;
  text_content?: string;
  file_name?: string;
  submitted_at?: string;
  score?: number | null;
  feedback?: string | null;
  status?: string | null;
}

interface Quiz {
  id: number;
  class_id: number;
  teacher_id?: number;
  title: string;
  topic: string;
  questions?: any[];
  questions_json?: string;
  total_marks?: number;
  due_date?: string;
  class_name?: string;
  attempt_count?: number;
  attempt_id?: number;
  attempt_score?: number;
}

const TEACHER_TOOLS: ToolConfig[] = [
  { id: "assignment-checker", title: "Assignment Checker", description: "Grade student assignments with AI-assisted feedback.", category: "Evaluate", subtitle: "Score, mistakes & feedback" },
  { id: "quiz-generator", title: "Quiz Generator", description: "Generate quizzes with answer keys and explanations.", category: "Create", subtitle: "Custom quizzes" },
  { id: "blooket-gen", title: "Blooket Generator", description: "Create interactive game-style questions for Blooket.", category: "Create", subtitle: "Gamified questions" },
  { id: "chunk-text", title: "Chunk Text", description: "Break difficult content into manageable learning chunks.", category: "Differentiate", subtitle: "Structured comprehension" },
  { id: "clear-directions", title: "Clear Directions", description: "Rewrite assignment directions into concise student-friendly steps.", category: "Create", subtitle: "Simple instructions" },
  { id: "lesson-plan", title: "Lesson Plan", description: "Generate structured lesson plans for your classroom.", category: "Plan", subtitle: "Lesson planning" },
  { id: "real-world", title: "Real World Context", description: "Connect lesson concepts to real-world applications.", category: "Differentiate", subtitle: "Meaningful examples" },
  { id: "rubric-generator", title: "Rubric Generator", description: "Create clear and detailed grading rubrics.", category: "Create", subtitle: "Professional rubrics" },
  { id: "activity-generator", title: "Classroom Activity", description: "Create interactive classroom activities.", category: "Create", subtitle: "Engaging activities" },
  { id: "group-generator", title: "Student Groups", description: "Generate balanced student groups from the real class roster.", category: "Manage", subtitle: "Smart grouping" },
  { id: "differentiation", title: "Differentiation", description: "Prepare content for mixed-ability learners.", category: "Differentiate", subtitle: "Support every learner" },
  { id: "exit-ticket", title: "Exit Ticket", description: "Generate fast end-of-lesson assessment questions.", category: "Assess", subtitle: "Check understanding" },
  { id: "progress-report", title: "Progress Report", description: "Generate reports from classroom data.", category: "Reports", subtitle: "Performance analysis" },
  { id: "parent-message", title: "Parent Message", description: "Draft professional parent communication.", category: "Communication", subtitle: "Clear communication" },
  { id: "chat-gpt", title: "AI Teaching Assistant", description: "Chat with the educational AI assistant.", category: "Learn", subtitle: "AI assistant" },
];

const STAFF_TOOLS: ToolConfig[] = [
  { id: "email-drafter", title: "Email Drafter", description: "Draft professional institutional emails.", category: "Communication", subtitle: "Professional email" },
  { id: "meeting-summarizer", title: "Meeting Summarizer", description: "Turn notes into minutes and action items.", category: "Admin", subtitle: "Minutes & actions" },
  { id: "report-generator", title: "Report Generator", description: "Create structured administrative reports.", category: "Operations", subtitle: "Standardized reports" },
  { id: "schedule-planner", title: "Schedule Planner", description: "Organize events, duties and schedules.", category: "Planning", subtitle: "Operational planning" },
  { id: "performance-analyzer", title: "Performance Analyzer", description: "Analyze supplied academic performance data.", category: "Analysis", subtitle: "Performance insights" },
  { id: "attendance-report", title: "Attendance Reporter", description: "Analyze attendance records and thresholds.", category: "Reports", subtitle: "Attendance analysis" },
  { id: "announcement-creator", title: "Announcement Creator", description: "Draft official institutional announcements.", category: "Communication", subtitle: "Official notices" },
];

function normalizeRole(role: string): Role {
  if (role === "student" || role === "teacher" || role === "staff") return role;
  throw new Error("This account has an unsupported role. Contact staff for assistance.");
}

function prettyDate(value: any) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function MediaLightbox({ src, type, name, onClose }: { src: string; type: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(<div role="dialog" aria-modal="true" aria-label={name || "Media viewer"} className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950/95 text-white" onClick={onClose}>
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3 sm:px-5" onClick={(event) => event.stopPropagation()}><button onClick={onClose} aria-label="Back to classroom chat" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"><ArrowLeft className="h-5 w-5" /></button><span className="min-w-0 truncate text-sm font-semibold">{name || "Media"}</span></header>
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-6" onClick={(event) => event.stopPropagation()}>{type.startsWith("image/") ? <img src={src} alt={name || "Shared classroom image"} className="block max-h-[calc(100dvh-4.5rem)] max-w-full object-contain object-center" /> : <video src={src} controls autoPlay playsInline className="block max-h-[calc(100dvh-4.5rem)] max-w-full rounded-lg bg-black object-contain object-center" />}</div>
  </div>, document.body);
}

function ResourceDocumentViewer({ resource, src, onClose }: { resource: any; src: string; onClose: () => void }) {
  const mime = String(resource.attachment_mime || "").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";
  const isText = mime.startsWith("text/");
  return createPortal(<div role="dialog" aria-modal="true" aria-label={resource.attachment_name || resource.title} className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950 text-white">
    <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-slate-950 px-3 sm:px-5">
      <button type="button" onClick={onClose} aria-label="Back to resources" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"><ArrowLeft className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{resource.attachment_name || resource.title}</p><p className="truncate text-xs text-slate-400">{resource.title}</p></div>
      <a href={src} download={resource.attachment_name || "teaching-resource"} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold transition hover:bg-white/20">Download</a>
      <button type="button" onClick={onClose} aria-label="Close file viewer" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"><X className="h-5 w-5" /></button>
    </header>
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-900 p-2 sm:p-4">
      {isPdf ? <iframe src={src} title={resource.attachment_name || resource.title} className="h-full min-h-[60vh] w-full rounded-lg bg-white" /> : isImage ? <img src={src} alt={resource.attachment_name || resource.title} className="block max-h-full max-w-full object-contain object-center" /> : isText ? <iframe src={src} title={resource.attachment_name || resource.title} className="h-full min-h-[60vh] w-full rounded-lg bg-white" /> : <div className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-center"><FileText className="mx-auto h-10 w-10 text-emerald-300" /><h2 className="mt-4 text-lg font-black">This file needs a document app to preview</h2><p className="mt-2 text-sm leading-6 text-slate-300">Download the file to open it in Word, PowerPoint, or Excel.</p><a href={src} download={resource.attachment_name || "teaching-resource"} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white hover:bg-emerald-600">Download document</a></div>}
    </main>
  </div>, document.body);
}

function ClassChatDraftPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState("");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  const type = file.type.toLowerCase();
  return <div className="mb-3 max-w-full rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
    <div className="mb-2 flex items-center justify-between gap-3"><span className="min-w-0 truncate text-xs font-bold text-emerald-900">Preview before sending · {file.name}</span><button aria-label="Remove attachment" onClick={onRemove} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button></div>
    {url && type.startsWith("image/") && <button onClick={() => setExpanded(true)} className="block max-w-full" aria-label="Open image preview"><img src={url} alt={file.name} className="max-h-52 max-w-full rounded-xl border border-emerald-100 object-contain" /></button>}
    {url && type.startsWith("video/") && <div className="relative max-w-full"><video src={url} controls playsInline preload="metadata" className="max-h-52 max-w-full rounded-xl bg-black" /><button onClick={() => setExpanded(true)} className="mt-1 text-xs font-bold text-emerald-800 underline">Open full video</button></div>}
    {url && type.startsWith("audio/") && <audio src={url} controls preload="metadata" className="w-full max-w-sm" aria-label="Listen to voice note before sending" />}
    {type === "application/pdf" && <span className="text-xs text-slate-600">PDF ready to send</span>}
    {expanded && <MediaLightbox src={url} type={type} name={file.name} onClose={() => setExpanded(false)} />}
  </div>;
}

function PickerCards({ items, onSelect }: { items: { value: string; title: string; subtitle?: string; icon?: any }[]; onSelect: (value: string) => void }) {
  if (items.length === 0) return <Empty title="Nothing to show yet" text="No options are available here right now." />;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((item, index) => {
    const Icon = item.icon || GraduationCap;
    return <button key={item.value} type="button" onClick={() => onSelect(item.value)} className="group flex min-h-32 flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-950/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-800 transition group-hover:bg-emerald-800 group-hover:text-white"><Icon className="h-6 w-6" /></span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <span className="mt-4 block text-base font-black leading-5 text-slate-900">{item.title}</span>
      <span className="mt-auto flex items-center justify-between pt-3 text-xs font-semibold text-slate-500"><span>{item.subtitle || ""}</span><ChevronRight className="h-4 w-4 text-emerald-700 transition group-hover:translate-x-1" /></span>
    </button>;
  })}</div>;
}

const MATERIAL_FILE_KINDS: Record<string, { label: string; icon: any; tone: string }> = {
  pdf: { label: "PDF", icon: FileText, tone: "bg-rose-100 text-rose-700" },
  doc: { label: "Word", icon: FileText, tone: "bg-blue-100 text-blue-700" },
  docx: { label: "Word", icon: FileText, tone: "bg-blue-100 text-blue-700" },
  ppt: { label: "PowerPoint", icon: Presentation, tone: "bg-orange-100 text-orange-700" },
  pptx: { label: "PowerPoint", icon: Presentation, tone: "bg-orange-100 text-orange-700" },
  xls: { label: "Excel", icon: FileSpreadsheet, tone: "bg-emerald-100 text-emerald-700" },
  xlsx: { label: "Excel", icon: FileSpreadsheet, tone: "bg-emerald-100 text-emerald-700" },
  txt: { label: "Text", icon: FileText, tone: "bg-slate-200 text-slate-700" },
  jpg: { label: "Image", icon: ImageIcon, tone: "bg-violet-100 text-violet-700" },
  jpeg: { label: "Image", icon: ImageIcon, tone: "bg-violet-100 text-violet-700" },
  png: { label: "Image", icon: ImageIcon, tone: "bg-violet-100 text-violet-700" },
  webp: { label: "Image", icon: ImageIcon, tone: "bg-violet-100 text-violet-700" },
};
const MATERIAL_NOTE_KIND = { label: "Note", icon: Pencil, tone: "bg-amber-100 text-amber-700" };
const materialKind = (name?: string) => MATERIAL_FILE_KINDS[(name || "").split(".").pop()?.toLowerCase() || ""] || (name ? { label: "File", icon: Paperclip, tone: "bg-slate-200 text-slate-700" } : MATERIAL_NOTE_KIND);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

function MaterialThumb({ item, userId, authHeaders }: { item: any; userId: number; authHeaders: () => Record<string, string> }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let url = "";
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/course-materials/${item.id}/file?user_id=${userId}`, { headers: authHeaders() });
        if (!response.ok || cancelled) return;
        url = URL.createObjectURL(await response.blob());
        if (cancelled) URL.revokeObjectURL(url); else setSrc(url);
      } catch { /* the icon stays as the fallback */ }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [item.id, userId]);
  if (!src) return null;
  return <img src={src} alt={item.title} className="h-full w-full object-cover" />;
}

function CourseMaterialsPanel({ courseKey, courseTitle, userId }: { courseKey: string; courseTitle: string; userId: number }) {
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [viewer, setViewer] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const authHeaders = (): Record<string, string> => {
    const token = JSON.parse(localStorage.getItem("khanmigo_user") || "{}").access_token || "";
    return token ? { Authorization: "Bearer " + token } : {};
  };
  const load = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/course-materials?user_id=${userId}&course_key=${encodeURIComponent(courseKey)}`, { headers: authHeaders() });
      setItems(response.ok ? await response.json() : []);
    } catch {
      setItems([]);
    }
  };
  useEffect(() => { setError(""); setItems([]); setQuery(""); setTypeFilter("All"); void load(); }, [courseKey, userId]);
  useEffect(() => {
    if (!viewer) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeViewer(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);
  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview("");
  }, [file]);

  const pickFile = (picked?: File | null) => {
    if (!picked) return;
    setFile(picked);
    setError("");
    if (!title.trim()) setTitle(picked.name.replace(/\.[^.]+$/, ""));
  };

  const save = () => {
    if (!title.trim()) { setError("Give your upload a title."); return; }
    if (!file && !note.trim()) { setError("Attach a file or write a note."); return; }
    const form = new FormData();
    form.append("user_id", String(userId));
    form.append("course_key", courseKey);
    form.append("course_title", courseTitle);
    form.append("title", title.trim());
    form.append("note_text", note);
    if (file) form.append("file", file);
    setBusy(true);
    setProgress(0);
    setError("");
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE}/api/course-materials`);
    Object.entries(authHeaders()).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => { setBusy(false); setError("Could not reach the server. Please try again."); };
    request.onload = async () => {
      setBusy(false);
      if (request.status >= 200 && request.status < 300) {
        setTitle(""); setNote(""); setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        await load();
        return;
      }
      let detail = "The upload failed.";
      try { const result = JSON.parse(request.responseText); if (typeof result.detail === "string") detail = result.detail; } catch { /* keep the generic message */ }
      setError(detail);
    };
    request.send(form);
  };

  const fetchBlob = async (item: any) => {
    const response = await fetch(`${API_BASE}/api/course-materials/${item.id}/file?user_id=${userId}`, { headers: authHeaders() });
    if (!response.ok) throw new Error("The file could not be opened.");
    return response.blob();
  };

  const closeViewer = () => {
    setViewer((current: any) => { if (current?.url) URL.revokeObjectURL(current.url); return null; });
  };

  const openViewer = async (item: any) => {
    setError("");
    const ext = (item.attachment_name || "").split(".").pop()?.toLowerCase() || "";
    if (!item.has_file) { setViewer({ item, mode: "note" }); return; }
    setViewer({ item, mode: "loading" });
    try {
      const blob = await fetchBlob(item);
      if (IMAGE_EXTENSIONS.has(ext)) setViewer({ item, mode: "image", url: URL.createObjectURL(blob) });
      else if (ext === "pdf") setViewer({ item, mode: "pdf", url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) });
      else if (ext === "txt") setViewer({ item, mode: "text", text: await blob.text() });
      else setViewer({ item, mode: "unsupported" });
    } catch (cause: any) {
      setViewer(null);
      setError(cause?.message || "The file could not be opened.");
    }
  };

  const downloadFile = async (item: any) => {
    setError("");
    try {
      const url = URL.createObjectURL(await fetchBlob(item));
      const link = document.createElement("a");
      link.href = url;
      link.download = item.attachment_name || item.title;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (cause: any) {
      setError(cause?.message || "The file could not be downloaded.");
    }
  };

  const remove = async (item: any) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/course-materials/${item.id}?user_id=${userId}`, { method: "DELETE", headers: authHeaders() });
      if (!response.ok) throw new Error("Could not delete this upload.");
      await load();
    } catch (cause: any) {
      setError(cause?.message || "Could not delete this upload.");
    }
  };

  const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const kinds = ["All", ...Array.from(new Set(items.map((item) => materialKind(item.attachment_name).label)))];
  const shown = items.filter((item) => (typeFilter === "All" || materialKind(item.attachment_name).label === typeFilter) && (!query.trim() || `${item.title} ${item.attachment_name || ""} ${item.note_text || ""}`.toLowerCase().includes(query.trim().toLowerCase())));
  const chosenKind = file ? materialKind(file.name) : null;

  return <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-wider text-emerald-800">My uploads · private</p><h3 className="mt-1 text-xl font-black text-slate-950">Course files and notes</h3><p className="mt-1 text-sm text-slate-600">Only you can see what you upload here. Every upload becomes a card below.</p></div>
      <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800">{items.length} upload{items.length === 1 ? "" : "s"}</span>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
    <div
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); pickFile(event.dataTransfer.files?.[0]); }}
      className={`mt-5 rounded-2xl border-2 border-dashed p-5 text-center transition ${dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}
    >
      <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp" onChange={(event) => pickFile(event.target.files?.[0])} />
      {file && chosenKind ? <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left">
        <span className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl ${chosenKind.tone}`}>{preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <chosenKind.icon className="h-6 w-6" />}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900">{file.name}</p><p className="text-xs font-semibold text-slate-500">{chosenKind.label} · {size(file.size)}</p></div>
        <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} disabled={busy} aria-label="Remove selected file" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
      </div> : <>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><UploadCloud className="h-6 w-6" /></span>
        <p className="mt-3 text-sm font-black text-slate-800">Drag and drop a file here</p>
        <p className="mt-1 text-xs text-slate-500">PDF, Word, PowerPoint, Excel, text or image</p>
        <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50">Browse files</button>
      </>}
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Title (e.g. Chapter 1 notes)" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={1} placeholder="Optional note (a note alone is also fine)" className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}{busy ? `Uploading ${progress}%` : "Upload"}</Button>
      {busy && <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} /></div>}
    </div>

    <div className="mt-8 border-t border-slate-100 pt-6">
      {items.length === 0 ? <Empty title="No uploads yet" text="Your uploaded files and notes for this course will appear here as cards." /> : <>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your uploads" className="w-full bg-transparent py-2.5 text-sm outline-none" /></label>
          <div className="flex flex-wrap gap-1.5">{kinds.map((kind) => <button key={kind} type="button" onClick={() => setTypeFilter(kind)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${typeFilter === kind ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-emerald-50"}`}>{kind}</button>)}</div>
        </div>
        {shown.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No uploads match your search.</p> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map((item) => {
          const kind = materialKind(item.attachment_name);
          const isImage = IMAGE_EXTENSIONS.has((item.attachment_name || "").split(".").pop()?.toLowerCase() || "");
          return <article key={item.id} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className={`relative grid h-32 place-items-center overflow-hidden ${kind.tone}`}>
              <kind.icon className="h-12 w-12 opacity-80" />
              {isImage && item.has_file && <div className="absolute inset-0"><MaterialThumb item={item} userId={userId} authHeaders={authHeaders} /></div>}
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700">{kind.label}</span>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h4 className="truncate font-black text-slate-900">{item.title}</h4>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{prettyDate(item.created_at)}{item.attachment_size ? ` · ${size(item.attachment_size)}` : ""}</p>
              {item.attachment_name && <p className="mt-2 truncate text-xs font-bold text-slate-600">{item.attachment_name}</p>}
              {item.note_text && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{item.note_text}</p>}
              <div className="mt-auto flex flex-wrap gap-2 pt-4"><button onClick={() => void openViewer(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"><Eye className="h-3.5 w-3.5" />Open</button>{item.has_file && <button onClick={() => void downloadFile(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />Download</button>}<button onClick={() => void remove(item)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete</button></div>
            </div>
          </article>;
        })}</div>}
      </>}
    </div>
    {viewer && createPortal(<div role="dialog" aria-modal="true" aria-label={viewer.item.title} className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" onClick={closeViewer}>
      <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${materialKind(viewer.item.attachment_name).tone}`}>{(() => { const KindIcon = materialKind(viewer.item.attachment_name).icon; return <KindIcon className="h-5 w-5" />; })()}</span>
          <div className="min-w-0 flex-1"><h4 className="truncate font-black text-slate-900">{viewer.item.title}</h4><p className="truncate text-xs font-semibold text-slate-500">{viewer.item.attachment_name || "Note"}</p></div>
          {viewer.item.has_file && <button type="button" onClick={() => void downloadFile(viewer.item)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Download</button>}
          <button type="button" onClick={closeViewer} aria-label="Close viewer" className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
          {viewer.mode === "loading" && <div className="grid h-full min-h-64 place-items-center text-sm font-semibold text-slate-500"><span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Opening file…</span></div>}
          {viewer.mode === "image" && <div className="grid min-h-full place-items-center p-4"><img src={viewer.url} alt={viewer.item.title} className="max-h-[75vh] max-w-full rounded-xl object-contain" /></div>}
          {viewer.mode === "pdf" && <iframe src={viewer.url} title={viewer.item.title} className="h-[75vh] w-full border-0 bg-white" />}
          {viewer.mode === "text" && <pre className="whitespace-pre-wrap break-words p-5 text-sm leading-6 text-slate-800">{viewer.text}</pre>}
          {viewer.mode === "note" && <div className="p-5 sm:p-8"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{viewer.item.note_text}</p></div>}
          {viewer.mode === "unsupported" && <div className="grid min-h-64 place-items-center p-8 text-center"><div><span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${materialKind(viewer.item.attachment_name).tone}`}>{(() => { const KindIcon = materialKind(viewer.item.attachment_name).icon; return <KindIcon className="h-8 w-8" />; })()}</span><p className="mt-4 font-black text-slate-900">Preview is not available for {materialKind(viewer.item.attachment_name).label} files</p><p className="mt-1 text-sm text-slate-500">Browsers cannot display this file type. Use Download to open it on your device.</p></div></div>}
          {viewer.mode !== "loading" && viewer.mode !== "note" && viewer.item.note_text && <div className="border-t border-slate-200 bg-white p-4 sm:px-6"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Note</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{viewer.item.note_text}</p></div>}
        </div>
      </div>
    </div>, document.body)}
  </section>;
}

function CheckedWorkFileLink({ classId, submissionId, fileName, userId }: { classId: number; submissionId: number; fileName: string; userId: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const openFile = async () => {
    setLoading(true);
    setError("");
    try {
      const accessToken = JSON.parse(localStorage.getItem("khanmigo_user") || "{}").access_token || "";
      const response = await fetch(`${API_BASE}/api/classes/${classId}/my-work/assignment/${submissionId}/file?user_id=${userId}`, { headers: accessToken ? { Authorization: "Bearer " + accessToken } : {} });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail || "The file could not be opened.");
      }
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause: any) {
      setError(cause?.message || "The file could not be opened.");
    } finally {
      setLoading(false);
    }
  };
  return <div>
    <button onClick={() => void openFile()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60"><FileText className="h-4 w-4" />{loading ? "Opening…" : `Open your uploaded file: ${fileName}`}</button>
    {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
  </div>;
}

function AuthenticatedProfileImage({ userId, requesterId, revision, alt, className, fallback }: {
  userId: number;
  requesterId: number;
  revision?: string | null;
  alt: string;
  className: string;
  fallback: string;
}) {
  const [loadedImage, setLoadedImage] = useState<{ key: string; src: string } | null>(null);
  const directSrc = revision && (/^data:/i.test(revision) || (/^https?:\/\//i.test(revision) && !revision.includes(".private.blob.vercel-storage.com")))
    ? revision
    : "";
  const imageKey = `${userId}:${requesterId}:${revision || ""}`;
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    if (!userId || !requesterId || !revision) return;
    if (/^data:/i.test(revision) || (/^https?:\/\//i.test(revision) && !revision.includes(".private.blob.vercel-storage.com"))) return;

    const token = JSON.parse(localStorage.getItem("khanmigo_user") || "{}").access_token || "";
    fetch(`${API_BASE}/api/users/${userId}/avatar?requester_id=${requesterId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status !== 404) throw new Error("Profile photo could not be loaded.");
          return null;
        }
        return response.blob();
      })
      .then((blob) => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setLoadedImage({ key: imageKey, src: objectUrl });
      })
      .catch((error) => console.error("Profile photo could not be loaded:", error));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, requesterId, revision, imageKey]);

  const src = directSrc || (loadedImage?.key === imageKey ? loadedImage.src : "");
  return src
    ? <img src={src} alt={alt} loading="lazy" className={className} />
    : <span className="flex h-full w-full items-center justify-center">{fallback}</span>;
}

function TeacherSubmissionFile({ submissionId, teacherId, fileName, isPdf }: {
  submissionId: number;
  teacherId: number;
  fileName: string;
  isPdf: boolean;
}) {
  const [fileUrl, setFileUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  const loadFile = async () => {
    if (fileUrl) return fileUrl;
    setLoading(true);
    setError("");
    try {
      const token = JSON.parse(localStorage.getItem("khanmigo_user") || "{}").access_token || "";
      const response = await fetch(
        `${API_BASE}/api/teacher/assignments/submissions/${submissionId}/file?teacher_id=${teacherId}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail || "The submission file could not be opened.");
      }
      const url = URL.createObjectURL(await response.blob());
      setFileUrl(url);
      return url;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The submission file could not be opened.");
      return "";
    } finally {
      setLoading(false);
    }
  };

  const openFile = async () => {
    const url = await loadFile();
    if (url) window.open(url, "_blank", "noopener");
  };

  const togglePreview = async () => {
    if (previewOpen) {
      setPreviewOpen(false);
      return;
    }
    if (await loadFile()) setPreviewOpen(true);
  };

  return <>
    <div className="flex flex-wrap gap-2">
      {isPdf && <Button variant="ghost" onClick={() => void togglePreview()} disabled={loading}><FileText className="w-4 h-4" />{loading ? "Loading file..." : previewOpen ? "Close PDF preview" : "Open PDF preview"}</Button>}
      <Button variant="ghost" onClick={() => void openFile()} disabled={loading}><Download className="w-4 h-4" />{loading ? "Loading file..." : `Open / Download ${isPdf ? "PDF" : "document"}`}</Button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
    {isPdf && previewOpen && fileUrl && <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <iframe title={`Student submission ${submissionId} PDF`} src={fileUrl} className="h-[70vh] min-h-[480px] w-full" />
    </div>}
    {!isPdf && fileName && <span className="sr-only">{fileName}</span>}
  </>;
}

function ClassroomAttachmentPreview({ classId, conversationId, message, userId }: { classId?: number; conversationId?: number; message: any; userId: number }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const previewTriggerRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const open = async () => {
    if (previewUrl || loading) return;
    setLoading(true);
    setError("");
    try {
      const accessToken = JSON.parse(localStorage.getItem("khanmigo_user") || "{}").access_token || "";
      const attachmentEndpoint = conversationId
        ? `/api/communications/conversations/${conversationId}/messages/${message.id}/attachment?user_id=${userId}`
        : `/api/classes/${classId}/chat/messages/${message.id}/attachment?user_id=${userId}`;
      const response = await fetch(`${API_BASE}${attachmentEndpoint}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail || "The attachment could not be opened.");
      }
      setPreviewUrl(URL.createObjectURL(await response.blob()));
    } catch (cause: any) {
      setError(cause?.message || "The attachment could not be opened.");
    } finally {
      setLoading(false);
    }
  };

  const mime = String(message.attachment_mime || "").toLowerCase();
  useEffect(() => {
    if (!mime.startsWith("image/") && !mime.startsWith("video/") && !mime.startsWith("audio/")) return;
    const node = previewTriggerRef.current;
    if (!node || !("IntersectionObserver" in window)) { void open(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { void open(); observer.disconnect(); }
    }, { rootMargin: "180px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [classId, conversationId, message.id, userId, mime]);
  return <div className="mt-3 min-w-0">
    {!previewUrl && (mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/")) && <div ref={previewTriggerRef} className="flex min-h-12 min-w-40 items-center justify-center rounded-xl bg-slate-100/80 px-3 text-xs text-slate-500">{loading ? "Loading media…" : error ? <button onClick={() => void open()} className="font-semibold text-emerald-800 underline">Retry media</button> : "Media preview"}</div>}
    {!previewUrl && !mime.startsWith("image/") && !mime.startsWith("video/") && !mime.startsWith("audio/") && <button onClick={() => void open()} disabled={loading} className="flex min-h-10 max-w-full items-center gap-2 rounded-xl border border-emerald-200 bg-white/80 px-3 py-2 text-left text-xs font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{loading ? "Loading attachment…" : `Open ${message.attachment_name}`}</span></button>}
    {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
    {previewUrl && mime.startsWith("image/") && <button onClick={() => setExpanded(true)} aria-label="Open image full screen" className="mt-2 block max-w-full"><img src={previewUrl} alt={message.attachment_name || "Classroom image"} loading="lazy" className="max-h-80 w-auto max-w-full rounded-xl border border-slate-200 object-contain" /><span className="mt-1 block text-left text-[11px] font-semibold text-emerald-800">Tap to open full image</span></button>}
    {previewUrl && mime.startsWith("audio/") && <audio src={previewUrl} controls preload="metadata" className="mt-2 w-full max-w-sm" aria-label={`Voice note from ${message.sender_name || "class member"}`} />}
    {previewUrl && mime.startsWith("video/") && <div className="mt-2 max-w-xl"><video src={previewUrl} controls playsInline preload="metadata" className="max-h-80 w-full rounded-xl bg-black" aria-label={message.attachment_name || "Classroom video"} /><button onClick={() => setExpanded(true)} className="mt-1 text-left text-[11px] font-semibold text-emerald-800 underline">Open full video</button></div>}
    {previewUrl && mime === "application/pdf" && <iframe src={previewUrl} title={message.attachment_name || "Classroom PDF"} className="mt-2 h-80 w-full max-w-xl rounded-xl border border-slate-200 bg-white" />}
    {expanded && <MediaLightbox src={previewUrl} type={mime} name={message.attachment_name || "Shared media"} onClose={() => setExpanded(false)} />}
    {previewUrl && !mime.startsWith("image/") && !mime.startsWith("audio/") && !mime.startsWith("video/") && mime !== "application/pdf" && <a href={previewUrl} download={message.attachment_name || "classroom-attachment"} className="mt-2 inline-flex rounded-lg px-2 py-1 text-xs font-bold text-emerald-800 underline">Download attachment</a>}
  </div>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
      if (new URLSearchParams(window.location.search).has("reset_token")) return null;
    try {
      const raw = localStorage.getItem("khanmigo_user");
      const storedUser = raw ? JSON.parse(raw) as User : null;
      return storedUser?.access_token && ["student", "teacher", "staff"].includes(storedUser.role) ? storedUser : null;
    } catch {
      return null;
    }
  });

  const [teacherAttendance, setTeacherAttendance] = useState<any[]>([]);
  const [, setIsAttachmentOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("student");
  const [selectedInstitution, setSelectedInstitution] = useState<Institution>("University");
  const [qualification, setQualification] = useState("");
  const [teachingSubject, setTeachingSubject] = useState("");
  const [designation, setDesignation] = useState("");
  const [staffRegistrationCode, setStaffRegistrationCode] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [curriculumStage, setCurriculumStage] = useState("All levels");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedCurriculumGrade, setSelectedCurriculumGrade] = useState("1");
  const [curriculumBooks, setCurriculumBooks] = useState<CurriculumBook[]>([]);
  const [curriculumBooksLoading, setCurriculumBooksLoading] = useState(false);
  const [curriculumBooksError, setCurriculumBooksError] = useState("");
  const [selectedCurriculumBook, setSelectedCurriculumBook] = useState<CurriculumBook | null>(null);
  const [curriculumPdfLoading, setCurriculumPdfLoading] = useState(false);
  const [curriculumPdfError, setCurriculumPdfError] = useState("");
  const [curriculumChapters, setCurriculumChapters] = useState<CurriculumChapter[]>([]);
  const [universityDepartments, setUniversityDepartments] = useState<UniversityDepartment[]>([]);
  const [universityCatalogLoading, setUniversityCatalogLoading] = useState(false);
  const [universityCatalogError, setUniversityCatalogError] = useState("");
  const [selectedUniversityDepartment, setSelectedUniversityDepartment] = useState("");
  const [selectedUniversityProgram, setSelectedUniversityProgram] = useState("");
  const [universityOutline, setUniversityOutline] = useState<UniversityOutline | null>(null);
  const [universityOutlineLoading, setUniversityOutlineLoading] = useState(false);
  const [universityOutlineError, setUniversityOutlineError] = useState("");
  const [selectedUniversityTrack, setSelectedUniversityTrack] = useState("");
  const [selectedUniversitySemester, setSelectedUniversitySemester] = useState("");
  const [selectedUniversityCourse, setSelectedUniversityCourse] = useState<UniversityCourse | null>(null);
  const universityCourseDetailRef = useRef<HTMLElement>(null);
  const universityTopRef = useRef<HTMLDivElement>(null);
  const [curriculumOutlineLoaded, setCurriculumOutlineLoaded] = useState(false);
  const [selectedCurriculumTopic, setSelectedCurriculumTopic] = useState("");
  const [curriculumOutlineLoading, setCurriculumOutlineLoading] = useState(false);
  const [curriculumOutlineError, setCurriculumOutlineError] = useState("");
  const [curriculumClassId, setCurriculumClassId] = useState("");
  const [curriculumActionLoading, setCurriculumActionLoading] = useState(false);
  const [curriculumActionError, setCurriculumActionError] = useState("");
  const [curriculumSummary, setCurriculumSummary] = useState("");
  const [curriculumSummaryError, setCurriculumSummaryError] = useState("");
  const [summarizingBookId, setSummarizingBookId] = useState<number | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolConfig | null>(null);
  const [curriculumSubjectSearch, setCurriculumSubjectSearch] = useState("");
  const [curriculumSubjectSearchInput, setCurriculumSubjectSearchInput] = useState("");
  const curriculumReaderRef = useRef<HTMLElement>(null);
  const curriculumOpenRequestRef = useRef(0);
  const pathwayStages = user?.institution_mode
    ? institutionCurriculumStages(user.institution_mode)
    : CURRICULUM_STAGES.map((stage) => stage.name);
  const availableBookGrades = user?.institution_mode
    ? institutionBookGrades(user.institution_mode)
    : null;
  const bookGradeOptions = availableBookGrades ?? ALL_BOOK_GRADES;

  useEffect(() => {
    if (selectedCurriculumBook) {
      curriculumReaderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedCurriculumBook]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [convSearch, setConvSearch] = useState("");
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true);
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [speechLanguage, setSpeechLanguage] = useState("en-US");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");

  const [teacherSummary, setTeacherSummary] = useState<any>(null);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [staffClasses, setStaffClasses] = useState<any[]>([]);
  const [staffClassSearch, setStaffClassSearch] = useState("");
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingContacts, setMeetingContacts] = useState<any[]>([]);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingError, setMeetingError] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingStartsAt, setMeetingStartsAt] = useState("");
  const [meetingDuration, setMeetingDuration] = useState("45");
  const [meetingClassId, setMeetingClassId] = useState("");
  const [meetingOtherUserId, setMeetingOtherUserId] = useState("");
  const [meetingAudience, setMeetingAudience] = useState("class");
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [directorySearchDraft, setDirectorySearchDraft] = useState("");
  const [directorySearchApplied, setDirectorySearchApplied] = useState("");
  const [staffAnnouncements, setStaffAnnouncements] = useState<any[]>([]);
  const [staffReport, setStaffReport] = useState<any>(null);
  const [staffAttendance, setStaffAttendance] = useState<any[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<any[]>([]);
  const [managedAccount, setManagedAccount] = useState<any>(null);
  const [accountDraft, setAccountDraft] = useState<any>({});
  const [accountManagementSaving, setAccountManagementSaving] = useState(false);
  const [accountManagementError, setAccountManagementError] = useState("");
  const [accountManagementNotice, setAccountManagementNotice] = useState("");
  const [communicationContacts, setCommunicationContacts] = useState<any[]>([]);
  const [communicationConversations, setCommunicationConversations] = useState<any[]>([]);
  const [communicationMessages, setCommunicationMessages] = useState<any[]>([]);
  const [selectedCommunication, setSelectedCommunication] = useState<any>(null);
  const [communicationDraft, setCommunicationDraft] = useState("");
  const [communicationError, setCommunicationError] = useState("");
  const [communicationLoading, setCommunicationLoading] = useState(false);
  const [communicationSending, setCommunicationSending] = useState(false);
  const [communicationAttachment, setCommunicationAttachment] = useState<File | null>(null);
  const [communicationRecording, setCommunicationRecording] = useState(false);
  const [communicationSelectedIds, setCommunicationSelectedIds] = useState<number[]>([]);
  const [communicationReplyTarget, setCommunicationReplyTarget] = useState<any>(null);
  const [communicationEditingId, setCommunicationEditingId] = useState<number | null>(null);
  const [communicationTranslations, setCommunicationTranslations] = useState<Record<string, string>>({});
  const [communicationTranslating, setCommunicationTranslating] = useState<string | null>(null);
  const communicationFileRef = useRef<HTMLInputElement>(null);
  const communicationRecorderRef = useRef<MediaRecorder | null>(null);
  const communicationRecorderChunksRef = useRef<Blob[]>([]);
  const [classStaffGrants, setClassStaffGrants] = useState<any[]>([]);
  const [grantStaffByStudent, setGrantStaffByStudent] = useState<Record<string, string>>({});
  const [staffDepartments, setStaffDepartments] = useState<any[]>([]);
  const [staffError, setStaffError] = useState("");
  const [staffAttendanceMonth, setStaffAttendanceMonth] = useState(localDateKey().slice(0, 7));
  const [staffAnnouncementTitle, setStaffAnnouncementTitle] = useState("");
  const [staffAnnouncementBody, setStaffAnnouncementBody] = useState("");
  const [staffAnnouncementError, setStaffAnnouncementError] = useState("");
  const [staffAnnouncementSaving, setStaffAnnouncementSaving] = useState(false);
  const [teacherAssignments, setTeacherAssignments] = useState<Assignment[]>([]);
  const [quizSubmissions, setQuizSubmissions] = useState<any[]>([]);

  const [selectedQuizAttempt, setSelectedQuizAttempt] = useState<any>(null);
  const [quizManualScore, setQuizManualScore] = useState("");
  const [quizManualFeedback, setQuizManualFeedback] = useState("");
  const [isSubmittingQuizGrade, setIsSubmittingQuizGrade] = useState(false);
  const [quizAIOutput, setQuizAIOutput] = useState<any>(null);

  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);
  const assignmentFileInputRef = useRef<HTMLInputElement>(null);


  const [selectedTeacherQuiz, setSelectedTeacherQuiz] = useState<any>(null);
  const [teacherQuizzes, setTeacherQuizzes] = useState<Quiz[]>([]);
  const [teacherResources, setTeacherResources] = useState<any[]>([]);
  const [resourceSearch, setResourceSearch] = useState("");
  const [resourceSearchInput, setResourceSearchInput] = useState("");
  const [resourceFormOpen, setResourceFormOpen] = useState(false);
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceType, setResourceType] = useState("Lesson notes");
  const [resourceContent, setResourceContent] = useState("");
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceClassId, setResourceClassId] = useState("");
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [resourceNotice, setResourceNotice] = useState("");
  const [resourcePreview, setResourcePreview] = useState<{ resource: any; url: string } | null>(null);
  const [teacherStudents, setTeacherStudents] = useState<any[]>([]);
  const [selectedTeacherClass, setSelectedTeacherClass] = useState<TeacherClass | null>(null);
  const [teacherClassStudents, setTeacherClassStudents] = useState<any[]>([]);
  const [classChatMessages, setClassChatMessages] = useState<any[]>([]);
  const [classChatDraft, setClassChatDraft] = useState("");
  const [classChatAttachment, setClassChatAttachment] = useState<File | null>(null);
  const [classChatSelectedIds, setClassChatSelectedIds] = useState<number[]>([]);
  const [classChatReplyTarget, setClassChatReplyTarget] = useState<any>(null);
  const [classChatEditingId, setClassChatEditingId] = useState<number | null>(null);
  const [classChatError, setClassChatError] = useState("");
  const [classChatSending, setClassChatSending] = useState(false);
  const [classChatRecording, setClassChatRecording] = useState(false);
  const [classChatTranslations, setClassChatTranslations] = useState<Record<string, string>>({});
  const [classChatTranslating, setClassChatTranslating] = useState<string | null>(null);
  const [classChatLanguage, setClassChatLanguage] = useState("Urdu");
  const classChatFileRef = useRef<HTMLInputElement>(null);
  const classChatRecorderRef = useRef<MediaRecorder | null>(null);
  const classChatRecorderChunksRef = useRef<Blob[]>([]);
  const classChatEndRef = useRef<HTMLDivElement>(null);
  const lastClassChatMessageIdRef = useRef<number | null>(null);
  const classChatLastFetchedIdRef = useRef(0);
  const [teacherPortalLoading, setTeacherPortalLoading] = useState(false);
  const [teacherPortalError, setTeacherPortalError] = useState("");
  const [teacherOutput, setTeacherOutput] = useState<any>(null);
  const [submissionAIEvaluations, setSubmissionAIEvaluations] = useState<Record<string, any>>({});
  const [checkingSubmissionId, setCheckingSubmissionId] = useState<number | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isCreatingClass, setIsCreatingClass] = useState(false);
  const [newClass, setNewClass] = useState({ name: "", subject: "", grade_level: "", section: "", course_code: "", description: "" });
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [newAssignment, setNewAssignment] = useState({ class_id: "", title: "", description: "", due_date: "", total_marks: "100" });

  const [gradingSubmission, setgradingSubmission] = useState<any | null>(null);
  const [manualScore, setManualScore] = useState<string>("");
  const [manualFeedback, setManualFeedback] = useState<string>("");
  const [isSubmittingGrade, setIsSubmittingGrade] = useState<boolean>(false);

  const [studentClasses, setStudentClasses] = useState<any[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<any[]>([]);
  const [studentQuizzes, setStudentQuizzes] = useState<any[]>([]);
  const [studentAttendance, setStudentAttendance] = useState<any[]>([]);
  const [studentResults, setStudentResults] = useState<any[]>([]);
  const [studentAnnouncements, setStudentAnnouncements] = useState<any[]>([]);
  const [studentTimetable, setStudentTimetable] = useState<any[]>([]);
  const [studentSelectedClass, setStudentSelectedClass] = useState<any>(null);
  const [studentClassWork, setStudentClassWork] = useState<any[]>([]);
  const [classAnnouncementTitle, setClassAnnouncementTitle] = useState("");
  const [classAnnouncementBody, setClassAnnouncementBody] = useState("");
  const [classAnnouncementError, setClassAnnouncementError] = useState("");
  const [classAnnouncementSaving, setClassAnnouncementSaving] = useState(false);
  const [studentSelectedAssignment, setStudentSelectedAssignment] = useState<any>(null);
  const [studentSelectedQuiz, setStudentSelectedQuiz] = useState<any>(null);
  const [studentQuizAnswers, setStudentQuizAnswers] = useState<string[]>([]);
  const [studentAssignmentText, setStudentAssignmentText] = useState("");
  const [studentJoinCode, setStudentJoinCode] = useState("");
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [studentSuccess, setStudentSuccess] = useState("");

  const [toolSubject, setToolSubject] = useState("");
  const [toolTopic, setToolTopic] = useState("");
  const [lessonDuration, setLessonDuration] = useState("45");
  const [lessonFormat, setLessonFormat] = useState("5-Part");
  const [lessonDetail, setLessonDetail] = useState("High Detail");
  const [quizCount, setQuizCount] = useState("10");
  const [quizDifficulty, setQuizDifficulty] = useState("Medium");
  const [quizSource, setQuizSource] = useState<"ai" | "curriculum">("ai");
  const [quizCurriculumBookId, setQuizCurriculumBookId] = useState("");
  const [quizCurriculumChapter, setQuizCurriculumChapter] = useState("");
  const [quizCurriculumTopic, setQuizCurriculumTopic] = useState("");
  const [quizCurriculumLoading, setQuizCurriculumLoading] = useState(false);
  const [quizCurriculumError, setQuizCurriculumError] = useState("");
  const [quizPortalNotice, setQuizPortalNotice] = useState("");
  const [rubricTitle, setRubricTitle] = useState("");
  const [rubricCriteria, setRubricCriteria] = useState("");
  const [activityType, setActivityType] = useState("Interactive Activity");
  const [studentLevel, setStudentLevel] = useState("Mixed Ability");
  const [groupStrategy, setGroupStrategy] = useState("Balanced Groups");
  const [groupCount, setGroupCount] = useState("3");
  const [learningObjective, setLearningObjective] = useState("");
  const [exitCount, setExitCount] = useState("3");
  const [messageType, setMessageType] = useState("General Update");
  const [parentStudentName, setParentStudentName] = useState("");
  const [parentContext, setParentContext] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [toolText, setToolText] = useState("");


  const [profileData, setProfileData] = useState<any>(null);
  const profilePicture = profileData?.profile_pic || user?.profile_pic;
  const [profileName, setProfileName] = useState("");
  const [profileInstitution, setProfileInstitution] = useState<Institution>("University");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const avatarCameraInputRef = useRef<HTMLInputElement>(null);
  const avatarGalleryInputRef = useRef<HTMLInputElement>(null);
  const [avatarSourceChooser, setAvatarSourceChooser] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (resourcePreview?.url) URL.revokeObjectURL(resourcePreview.url);
  }, [resourcePreview?.url]);

  const api = async (endpoint: string, options: RequestInit = {}) => {
    if (!API_BASE) throw new Error(API_CONFIG_ERROR);
    let accessToken = "";
    try {
      accessToken = JSON.parse(localStorage.getItem("khanmigo_user") || "{}").access_token || "";
    } catch {
      accessToken = "";
    }
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.detail ?? data.message;
      const message = Array.isArray(detail)
        ? detail.map((item) => typeof item === "string" ? item : item && typeof item.msg === "string" ? item.msg : "").filter(Boolean).join(" ")
        : typeof detail === "string" ? detail : "";
      throw new Error(message || "Request failed.");
    }
    return data;
  };

  const classChatClassId = activeTab === "class-detail"
    ? selectedTeacherClass?.id
    : activeTab === "student-class-detail" ? studentSelectedClass?.id : null;

  useEffect(() => {
    if (!user || !classChatClassId) {
      setClassChatMessages([]);
      classChatLastFetchedIdRef.current = 0;
      return;
    }
    setClassChatMessages([]);
    setClassChatError("");
    classChatLastFetchedIdRef.current = 0;
    let active = true;
    const refreshMessages = async () => {
      try {
        const rows = await api(`/api/classes/${classChatClassId}/chat/messages?user_id=${user.user_id}`);
        if (active) {
          const incoming = Array.isArray(rows) ? rows : [];
          setClassChatMessages(incoming);
          if (incoming.length) classChatLastFetchedIdRef.current = Number(incoming[incoming.length - 1].id) || 0;
          setClassChatError("");
        }
      } catch (error: any) {
        if (active) setClassChatError(error?.message || "Classroom messages could not be loaded.");
      }
    };
    void refreshMessages();
    const timer = window.setInterval(() => void refreshMessages(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [activeTab, classChatClassId, user?.user_id]);

  useEffect(() => {
    const latestId = classChatMessages.at(-1)?.id ?? null;
    if (latestId && latestId !== lastClassChatMessageIdRef.current) {
      classChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      lastClassChatMessageIdRef.current = latestId;
    }
  }, [classChatMessages]);

  const sendClassChatMessage = async () => {
    if (!user || !classChatClassId || (!classChatDraft.trim() && !classChatAttachment) || classChatSending) return;
    setClassChatSending(true);
    setClassChatError("");
    if (classChatEditingId) {
      try {
        const result = await api(`/api/classes/${classChatClassId}/chat/messages/${classChatEditingId}?user_id=${user.user_id}`, { method: "PATCH", body: JSON.stringify({ body: classChatDraft.trim() }) });
        setClassChatMessages((current) => current.map((message) => message.id === classChatEditingId ? { ...message, body: result.body, translation_ur: null } : message));
        setClassChatDraft("");
        setClassChatEditingId(null);
      } catch (error: any) { setClassChatError(error?.message || "The message could not be edited."); }
      finally { setClassChatSending(false); }
      return;
    }
    const formData = new FormData();
    formData.append("user_id", String(user.user_id));
    formData.append("body", classChatDraft.trim());
    if (classChatAttachment) formData.append("attachment", classChatAttachment);
    if (classChatReplyTarget) formData.append("reply_to_id", String(classChatReplyTarget.id));
    try {
      const accessToken = JSON.parse(localStorage.getItem("khanmigo_user") || "{}").access_token || "";
      const response = await fetch(`${API_BASE}/api/classes/${classChatClassId}/chat/messages`, {
        method: "POST",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || result.message || "The classroom message could not be sent.");
      setClassChatMessages((current) => current.some((message) => message.id === result.id) ? current : [...current, result]);
      classChatLastFetchedIdRef.current = Math.max(classChatLastFetchedIdRef.current, Number(result.id) || 0);
      setClassChatDraft("");
      setClassChatAttachment(null);
      setClassChatReplyTarget(null);
      if (classChatFileRef.current) classChatFileRef.current.value = "";
    } catch (error: any) {
      setClassChatError(error?.message || "The message could not be sent.");
    } finally {
      setClassChatSending(false);
    }
  };

  const toggleClassChatSelection = (id: number) => setClassChatSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const actOnSelectedClassMessages = async (action: "reply" | "copy" | "edit" | "delete") => {
    if (!user || !classChatClassId || !classChatSelectedIds.length) return;
    const chosen = classChatMessages.filter((message: any) => classChatSelectedIds.includes(Number(message.id)));
    const first = chosen[0];
    if (action === "reply" && first) { setClassChatReplyTarget(first); setClassChatSelectedIds([]); return; }
    if (action === "copy" && first) {
      const text = first.body || first.attachment_name || "";
      try { await navigator.clipboard.writeText(text); setClassChatError("Message copied to clipboard."); }
      catch { setClassChatError("Clipboard access is unavailable in this browser."); }
      setClassChatSelectedIds([]); return;
    }
    if (action === "edit" && first && Number(first.sender_id) === Number(user.user_id) && first.body) {
      setClassChatDraft(first.body); setClassChatEditingId(Number(first.id)); setClassChatAttachment(null); setClassChatReplyTarget(null); setClassChatSelectedIds([]); return;
    }
    if (action === "delete") {
      const deletable = user.role === "teacher" ? chosen : chosen.filter((message: any) => Number(message.sender_id) === Number(user.user_id));
      if (!deletable.length) { setClassChatError("Students can delete only their own messages."); return; }
      if (!window.confirm(`Delete ${deletable.length} selected message${deletable.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
      try {
        await Promise.all(deletable.map((message: any) => api(`/api/classes/${classChatClassId}/chat/messages/${message.id}?user_id=${user.user_id}`, { method: "DELETE" })));
        const removed = new Set(deletable.map((message: any) => Number(message.id)));
        setClassChatMessages((current) => current.filter((message: any) => !removed.has(Number(message.id))));
        setClassChatSelectedIds([]); setClassChatError("");
      } catch (error: any) { setClassChatError(error?.message || "Some messages could not be deleted."); }
    }
  };

  const startClassChatRecording = async () => {
    if (classChatRecording) {
      classChatRecorderRef.current?.stop();
      setClassChatRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      classChatRecorderChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) classChatRecorderChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = (recorder.mimeType || "audio/webm").split(";")[0];
        const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
        const audio = new Blob(classChatRecorderChunksRef.current, { type: mimeType });
        if (audio.size) setClassChatAttachment(new File([audio], `class-voice-${Date.now()}.${extension}`, { type: mimeType }));
      };
      classChatRecorderRef.current = recorder;
      recorder.start();
      setClassChatRecording(true);
      setClassChatError("");
    } catch (error: any) {
      setClassChatError(error?.message || "Microphone permission is required to record a voice message.");
    }
  };

  const translateClassChatMessage = async (message: any) => {
    const translationKey = `${message.id}:${classChatLanguage}`;
    if (!user || !classChatClassId || classChatTranslating === translationKey) return;
    const existingValue = classChatTranslations[translationKey];
    const isVisible = existingValue !== undefined ? Boolean(existingValue) : classChatLanguage === "Urdu" && Boolean(message.translation_ur);
    if (isVisible) {
      setClassChatTranslations((current) => ({ ...current, [translationKey]: "" }));
      return;
    }
    if (classChatLanguage === "Urdu" && message.translation_ur) {
      setClassChatTranslations((current) => ({ ...current, [translationKey]: message.translation_ur }));
      return;
    }
    setClassChatTranslating(translationKey);
    setClassChatError("");
    try {
      const language = encodeURIComponent(classChatLanguage);
      const result = await api(`/api/classes/${classChatClassId}/chat/messages/${message.id}/translation?user_id=${user.user_id}&language=${language}`, { method: "POST" });
      setClassChatTranslations((current) => ({ ...current, [translationKey]: result.translation || "" }));
    } catch (error: any) {
      setClassChatError(error?.message || "AI translation could not be prepared.");
    } finally {
      setClassChatTranslating(null);
    }
  };

  const loadCurriculumBooks = async (grade: number | string) => {
    const gradeValue = String(grade);
    setSelectedCurriculumGrade(gradeValue);
    setCurriculumBooksLoading(true);
    setCurriculumBooksError("");
    setCurriculumBooks([]);
    setSelectedCurriculumBook(null);
    setCurriculumPdfError("");
    setCurriculumChapters([]);
    setSelectedCurriculumTopic("");
    setCurriculumSummary("");
    setCurriculumSummaryError("");
    try {
      const gradeQuery = gradeValue ? `?grade=${encodeURIComponent(gradeValue)}` : "";
      const books = await api(`/api/curriculum/books${gradeQuery}`);
      const allowedGrades = user?.institution_mode ? institutionBookGrades(user.institution_mode) : null;
      setCurriculumBooks(Array.isArray(books)
        ? books.filter((book: CurriculumBook) => !allowedGrades || allowedGrades.some((allowedGrade) => String(allowedGrade).toLowerCase() === String(book.grade).toLowerCase()))
        : []);
    } catch (error: any) {
      setCurriculumBooksError(error?.message || "Could not load BTBB textbooks.");
    } finally {
      setCurriculumBooksLoading(false);
    }
  };

  const loadUniversityCurriculumDepartments = useCallback(async () => {
    setUniversityCatalogLoading(true);
    setUniversityCatalogError("");
    try {
      const result = await api("/api/curriculum/luawms/programs");
      setUniversityDepartments(Array.isArray(result.departments) ? result.departments : []);
    } catch (error: any) {
      setUniversityCatalogError(error?.message || "Could not load the LUAWMS curriculum catalogue.");
    } finally {
      setUniversityCatalogLoading(false);
    }
  }, []);

  const loadUniversityProgramOutline = async (programId: string) => {
    setSelectedUniversityProgram(programId);
    setSelectedUniversityTrack("");
    setSelectedUniversitySemester("");
    setSelectedUniversityCourse(null);
    setUniversityOutline(null);
    if (!programId) return;
    setUniversityOutlineLoading(true);
    setUniversityOutlineError("");
    try {
      const result = await api(`/api/curriculum/luawms/programs/${encodeURIComponent(programId)}`);
      const tracks = Array.isArray(result.tracks) ? result.tracks : [];
      setUniversityOutline({ ...result, tracks });
      if (tracks.length === 1) setSelectedUniversityTrack(tracks[0].name);
    } catch (error: any) {
      setUniversityOutlineError(error?.message || "Could not load this official semester outline.");
    } finally {
      setUniversityOutlineLoading(false);
    }
  };

  const startUniversityLesson = () => {
    if (!selectedUniversityCourse || !universityOutline || !selectedUniversitySemester) return;
    setSelectedTool(null);
    const course = `${universityOutline.program} ke ${selectedUniversitySemester} semester ke course ${selectedUniversityCourse.title} (${selectedUniversityCourse.code})`;
    setChatInput(
      user?.role === "student"
        ? `Mujhe ${course} ko samajhna hai. Agar maine files attach ki hain to unhein primary source samajh kar follow karo. Is course ke main topics asaan zubaan mein samjhao, har topic ka ek chhota example do, mujhe kya aana chahiye (learning outcomes) batao, aur aakhir mein practice ke liye kuch sawal do. Jawab seedha de dene ke bajaye pehle hint do taake main khud sochun. Is ko official LUAWMS syllabus mat kaho.`
        : `${course} ke liye teacher-ready learning material banao. Agar maine files attach ki hain to unhein primary source samajh kar follow karo, unka meaning barqarar rakho aur unke khilaf baat add na karo. Agar koi file attach nahi hai to reliable general subject knowledge se AI-generated draft banao; ise official LUAWMS syllabus mat kaho. Students ke liye asaan explanation, learning outcomes, step-by-step teaching plan, examples ya class activity, aur answers ke saath chhota assessment do. Aakhir mein woh points batao jinhein teacher ko department syllabus se verify karna chahiye.`,
    );
    setActiveTab("chat");
    setMobileSidebar(false);
  };

  useEffect(() => {
    requestAnimationFrame(() => universityTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [selectedUniversityDepartment, selectedUniversityProgram, selectedUniversityTrack, selectedUniversitySemester, selectedUniversityCourse]);

  useEffect(() => {
    if (activeTab === "browse-subjects" && user?.institution_mode === "University" && universityDepartments.length === 0 && !universityCatalogLoading && !universityCatalogError) {
      void loadUniversityCurriculumDepartments();
    }
  }, [activeTab, user?.institution_mode, universityDepartments.length, universityCatalogLoading, universityCatalogError, loadUniversityCurriculumDepartments]);

  const openCurriculumBook = async (book: CurriculumBook) => {
    const requestId = ++curriculumOpenRequestRef.current;
    setSelectedCurriculumBook({ ...book });
    setCurriculumPdfLoading(true);
    setCurriculumPdfError("");
    setSelectedSubject(book.subject);
    setCurriculumChapters([]);
    setCurriculumOutlineLoaded(false);
    setSelectedCurriculumTopic("");
    setCurriculumOutlineError("");
    setCurriculumActionError("");
    try {
      await api(`/api/curriculum/books/${book.id}/prepare`);
      if (requestId === curriculumOpenRequestRef.current) setCurriculumPdfLoading(false);
    } catch (error: any) {
      if (requestId === curriculumOpenRequestRef.current) {
        setCurriculumPdfLoading(false);
        setCurriculumPdfError(error?.message || "Could not prepare this textbook for reading.");
      }
    }
  };

  const loadCurriculumChapters = async (book: CurriculumBook) => {
    if (!user || user.role !== "teacher") return;
    setCurriculumOutlineLoading(true);
    setCurriculumOutlineError("");
    try {
      const result = await api(`/api/curriculum/books/${book.id}/chapters`, {
        method: "POST",
        body: JSON.stringify({ teacher_id: user.user_id }),
      });
      const chapters = (Array.isArray(result.chapters) ? result.chapters : [])
        .map((chapter: any) => ({
          title: String(chapter.title || "Chapter"),
          topics: Array.isArray(chapter.topics) ? chapter.topics.map(String) : [],
        }))
        .filter((chapter: CurriculumChapter) => chapter.title || chapter.topics.length);
      setCurriculumChapters(chapters);
      setCurriculumOutlineLoaded(true);
      setSelectedCurriculumTopic(chapters[0]?.topics[0] || chapters[0]?.title || "");
    } catch (error: any) {
      setCurriculumOutlineError(error?.message || "Could not read this textbook outline.");
    } finally {
      setCurriculumOutlineLoading(false);
    }
  };

  const generateCurriculumQuiz = async () => {
    if (!user || !selectedCurriculumBook || !selectedCurriculumTopic) return;
    if (!curriculumClassId) {
      setCurriculumActionError("Select a classroom before generating a quiz.");
      return;
    }
    const classroom = teacherClasses.find((item) => String(item.id) === curriculumClassId);
    if (!classroom) return;
    setCurriculumActionLoading(true);
    setCurriculumActionError("");
    try {
      setSelectedTeacherClass(classroom);
      const result = await api("/api/teacher/quizzes/generate-and-save", {
        method: "POST",
        body: JSON.stringify({
          teacher_id: user.user_id,
          class_id: classroom.id,
          book_id: selectedCurriculumBook.id,
          subject: selectedCurriculumBook.subject,
          topic: selectedCurriculumTopic,
          grade_level: String(selectedCurriculumBook.grade),
          question_count: Number(quizCount),
          difficulty: quizDifficulty,
        }),
      });
      await loadTeacherPortal();
      setCurriculumActionError("");
      alert(`Quiz created: ${result.title}`);
    } catch (error: any) {
      setCurriculumActionError(error?.message || "Could not generate this quiz.");
    } finally {
      setCurriculumActionLoading(false);
    }
  };

  const draftCurriculumAssignment = async () => {
    if (!user || !selectedCurriculumBook || !selectedCurriculumTopic) return;
    if (!curriculumClassId) {
      setCurriculumActionError("Select a classroom before drafting an assignment.");
      return;
    }
    const classroom = teacherClasses.find((item) => String(item.id) === curriculumClassId);
    if (!classroom) return;
    setCurriculumActionLoading(true);
    setCurriculumActionError("");
    try {
      const draft = await api(`/api/curriculum/books/${selectedCurriculumBook.id}/assignment-draft`, {
        method: "POST",
        body: JSON.stringify({
          teacher_id: user.user_id,
          class_id: classroom.id,
          chapter: curriculumChapters.find((chapter) => chapter.topics.includes(selectedCurriculumTopic))?.title || selectedCurriculumTopic,
          topic: selectedCurriculumTopic,
        }),
      });
      setSelectedTeacherClass(classroom);
      setNewAssignment({
        class_id: String(classroom.id),
        title: draft.title,
        description: draft.description,
        due_date: "",
        total_marks: "100",
      });
      setIsCreatingAssignment(true);
      nav("assignments");
    } catch (error: any) {
      setCurriculumActionError(error?.message || "Could not draft this assignment.");
    } finally {
      setCurriculumActionLoading(false);
    }
  };

  const summarizeCurriculumBook = async (book: CurriculumBook) => {
    if (!user) return;
    setSummarizingBookId(book.id);
    setCurriculumSummary("");
    setCurriculumSummaryError("");
    try {
      const result = await api(`/api/curriculum/books/${book.id}/summary`, {
        method: "POST",
        body: JSON.stringify({ user_id: user.user_id }),
      });
      setCurriculumSummary(result.summary || "The AI did not return a summary.");
    } catch (error: any) {
      setCurriculumSummaryError(error?.message || "Could not summarize this textbook.");
    } finally {
      setSummarizingBookId(null);
    }
  };

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("reset_token");
    if (!token) return;
    localStorage.removeItem("khanmigo_user");
    setResetToken(token);
    setAuthMode("reset");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
  }, []);

  const loadFullProfile = async () => {
    if (!user) return;
    try {
      const data = await api(`/api/users/${user.user_id}/profile-full?requester_id=${user.user_id}`);
      setProfileData(data || {});
      setProfileName(user.full_name || "");
      setProfileInstitution((data?.institution_mode || user.institution_mode || "University") as Institution);
    } catch {
      setProfileData({});
      setProfileName(user.full_name || "");
      setProfileInstitution(user.institution_mode || "University");
    }
  };

  const loadConversations = async () => {
    if (!user) return;
    try {
      const data = await api(`/api/conversations/${user.user_id}`);
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      setConversations([]);
    }
  };

  const loadTeacherPortal = async () => {
    if (!user || user.role !== "teacher") return;
    setTeacherPortalLoading(true);
    setTeacherPortalError("");
    try {
      const [summary, classes, assignments, quizzes, resources, attendance] = await Promise.all([
        api(`/api/teacher/portal-summary/${user.user_id}`),
        api(`/api/classes/teacher/${user.user_id}`),
        api(`/api/assignments/teacher/${user.user_id}`),
        api(`/api/quizzes/teacher/${user.user_id}`),
        api(`/api/teacher/resources/${user.user_id}`),
        api(`/api/attendance/teacher/${user.user_id}`),
      ]);
      setTeacherSummary(summary || {});
      setTeacherClasses(Array.isArray(classes) ? classes : []);
      setTeacherAssignments(Array.isArray(assignments) ? assignments : []);
      setTeacherQuizzes(Array.isArray(quizzes) ? quizzes : []);
      setTeacherResources(Array.isArray(resources) ? resources : []);
      setTeacherAttendance(Array.isArray(attendance) ? attendance : []);

      const allStudents: any[] = [];
      for (const cls of Array.isArray(classes) ? classes : []) {
        try {
          const data = await api(`/api/classes/${cls.id}/students?user_id=${user.user_id}`);
          if (Array.isArray(data)) allStudents.push(...data.map((x: any) => ({ ...x, id: x.student_id || x.id })));
        } catch {}
      }
      const unique = new Map<number, any>();
      allStudents.forEach((s) => { if (s.id) unique.set(s.id, s); });
      setTeacherStudents(Array.from(unique.values()));
    } catch (e: any) {
      setTeacherPortalError(e?.message || "Unable to load Teacher Portal.");
    } finally {
      setTeacherPortalLoading(false);
    }
  };

  const loadStudentPortal = async () => {
    if (!user || user.role !== "student") return;
    setStudentLoading(true);
    setStudentError("");
    try {
      const results = await Promise.allSettled([
        api(`/api/classes/student/${user.user_id}`),
        api(`/api/assignments/student/${user.user_id}`),
        api(`/api/quizzes/student/${user.user_id}`),
        api(`/api/attendance/student/${user.user_id}`),
        api(`/api/results/student/${user.user_id}`),
        api(`/api/announcements/user/${user.user_id}`),
        api(`/api/timetable/student/${user.user_id}`),
      ]);

      const val = (index: number, fallback: any) =>
        results[index].status === "fulfilled" && Array.isArray(results[index].value)
          ? results[index].value
          : fallback;

      setStudentClasses(val(0, []));
      setStudentAssignments(val(1, []));
      setStudentQuizzes(val(2, []));
      setStudentAttendance(val(3, []));
      setStudentResults(val(4, []));
      setStudentAnnouncements(val(5, []));
      setStudentTimetable(val(6, []));
    } catch (e: any) {
      setStudentError(e?.message || "Unable to load Student Portal.");
    } finally {
      setStudentLoading(false);
    }
  };

  const loadStaffClasses = async () => {
    if (!user || user.role !== "staff") return;
    try {
      const classes = await api(`/api/classes/all?requester_id=${user.user_id}`);
      setStaffClasses(Array.isArray(classes) ? classes : []);
    } catch (error: any) {
      setStaffError(error?.message || "Unable to load classroom overview.");
    }
  };

  const loadStaffAnnouncements = async () => {
    if (!user || user.role !== "staff") return;
    try {
      const announcements = await api(`/api/announcements/user/${user.user_id}`);
      setStaffAnnouncements(Array.isArray(announcements) ? announcements : []);
    } catch (error: any) {
      setStaffAnnouncementError(error?.message || "Unable to load institutional notices.");
    }
  };

  const loadStaffReport = async () => {
    if (!user || user.role !== "staff") return;
    try { setStaffReport(await api(`/api/reports/overview?requester_id=${user.user_id}`)); }
    catch (error: any) { setStaffError(error?.message || "Unable to load institution report."); }
  };

  const loadStaffAttendance = async () => {
    if (!user || user.role !== "staff") return;
    try {
      const rows = await api(`/api/attendance/staff?requester_id=${user.user_id}`);
      setStaffAttendance(Array.isArray(rows) ? rows : []);
    } catch (error: any) { setStaffError(error?.message || "Unable to load attendance records."); }
  };

  const loadStaffDirectory = async (roleFilter: string) => {
    if (!user || user.role !== "staff") return;
    try {
      const apiRole = roleFilter === "students" ? "student" : roleFilter === "teachers" ? "teacher" : "staff";
      const rows = await api(`/api/users?requester_id=${user.user_id}&role_filter=${encodeURIComponent(apiRole)}`);
      setStaffDirectory(Array.isArray(rows) ? rows : []);
    } catch (error: any) { setStaffError(error?.message || "Unable to load the directory."); }
  };

  const openAccountManager = (person: any) => {
    setManagedAccount(person);
    setAccountDraft({
      full_name: person.full_name || "",
      institution_mode: person.institution_mode || "University",
      qualification: person.qualification || "",
      teaching_subject: person.teaching_subject || "",
      designation: person.designation || "",
    });
    setAccountManagementError("");
    setAccountManagementNotice("");
  };

  const saveManagedAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !managedAccount) return;
    setAccountManagementSaving(true);
    setAccountManagementError("");
    try {
      await api(`/api/users/${managedAccount.id}/manage?requester_id=${user.user_id}`, {
        method: "PATCH",
        body: JSON.stringify(accountDraft),
      });
      await loadStaffDirectory(managedAccount.role === "student" ? "students" : "teachers");
      setManagedAccount(null);
      setAccountManagementNotice("Account details updated.");
    } catch (error: any) {
      setAccountManagementError(error?.message || "Unable to update this account.");
    } finally {
      setAccountManagementSaving(false);
    }
  };

  const setManagedAccountActive = async (person: any, isActive: boolean) => {
    if (!user) return;
    const action = isActive ? "restore" : "disable";
    if (!window.confirm(`${isActive ? "Restore" : "Disable"} ${person.full_name}'s account? ${isActive ? "They will be able to sign in again." : "They will lose portal access; class and academic history will be kept."}`)) return;
    setAccountManagementError("");
    try {
      await api(`/api/users/${person.id}/manage?requester_id=${user.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: isActive }),
      });
      await loadStaffDirectory(person.role === "student" ? "students" : "teachers");
      setAccountManagementNotice(`${person.full_name}'s account access ${action === "restore" ? "restored" : "disabled"}.`);
    } catch (error: any) {
      setAccountManagementError(error?.message || `Unable to ${action} this account.`);
    }
  };

  const loadMeetings = async () => {
    if (!user) return;
    setMeetingLoading(true);
    setMeetingError("");
    try {
      const [rows, contacts] = await Promise.all([
        api(`/api/meetings?user_id=${user.user_id}`),
        user.role === "student" ? Promise.resolve([]) : api(`/api/communications/contacts?user_id=${user.user_id}`),
      ]);
      setMeetings(Array.isArray(rows) ? rows : []);
      setMeetingContacts(Array.isArray(contacts) ? contacts : []);
    } catch (error: any) {
      setMeetingError(error?.message || "Meetings could not be loaded.");
    } finally {
      setMeetingLoading(false);
    }
  };

  const createMeeting = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setMeetingLoading(true);
    setMeetingError("");
    try {
      const payload: any = {
        user_id: user.user_id,
        title: meetingTitle.trim(),
        starts_at: new Date(meetingStartsAt).toISOString(),
        duration_minutes: Number(meetingDuration),
      };
      if (user.role === "teacher" && meetingAudience === "class" && meetingClassId) payload.class_id = Number(meetingClassId);
      else if (user.role === "staff" && meetingOtherUserId === "all") payload.all_participants = true;
      else payload.other_user_id = Number(meetingOtherUserId);
      await api("/api/meetings", { method: "POST", body: JSON.stringify(payload) });
      setMeetingTitle("");
      setMeetingStartsAt("");
      setMeetingClassId("");
      setMeetingOtherUserId("");
      await loadMeetings();
    } catch (error: any) {
      setMeetingError(error?.message || "Meeting could not be scheduled.");
    } finally {
      setMeetingLoading(false);
    }
  };

  const joinScheduledMeeting = async (meeting: any) => {
    if (!user) return;
    setMeetingLoading(true);
    setMeetingError("");
    try {
      const room = await api(`/api/meetings/${meeting.id}/join?user_id=${user.user_id}`, { method: "POST" });
      setActiveMeeting({ ...meeting, ...room });
    } catch (error: any) {
      setMeetingError(error?.message || "This meeting could not be joined.");
    } finally {
      setMeetingLoading(false);
    }
  };

  const cancelScheduledMeeting = async (meeting: any) => {
    if (!user || !window.confirm(`Cancel “${meeting.title}”?`)) return;
    setMeetingLoading(true);
    setMeetingError("");
    try {
      await api(`/api/meetings/${meeting.id}/cancel?user_id=${user.user_id}`, { method: "POST" });
      await loadMeetings();
    } catch (error: any) {
      setMeetingError(error?.message || "Meeting could not be cancelled.");
    } finally {
      setMeetingLoading(false);
    }
  };

  const loadCommunications = async () => {
    if (!user) return;
    setCommunicationLoading(true);
    setCommunicationError("");
    try {
      const [contacts, rows] = await Promise.all([
        api(`/api/communications/contacts?user_id=${user.user_id}`),
        api(`/api/communications/conversations?user_id=${user.user_id}`),
      ]);
      setCommunicationContacts(Array.isArray(contacts) ? contacts : []);
      setCommunicationConversations(Array.isArray(rows) ? rows : []);
      if (selectedCommunication) {
        const refreshed = (Array.isArray(rows) ? rows : []).find((row: any) => row.id === selectedCommunication.id);
        if (refreshed) setSelectedCommunication(refreshed);
      }
    } catch (error: any) {
      setCommunicationError(error?.message || "Could not load messages.");
    } finally {
      setCommunicationLoading(false);
    }
  };

  const startCommunication = async (contact: any) => {
    if (!user) return;
    setCommunicationError("");
    try {
      const created = await api("/api/communications/conversations", {
        method: "POST",
        body: JSON.stringify({ user_id: user.user_id, other_id: contact.id, class_id: contact.class_id || null }),
      });
      const conversation = { ...created, other_id: contact.id, other_name: contact.full_name, other_role: contact.role, class_id: contact.class_id, class_name: contact.class_name };
      setSelectedCommunication(conversation);
      setCommunicationMessages([]);
      setCommunicationSelectedIds([]);
      setCommunicationAttachment(null);
      setCommunicationReplyTarget(null);
      setCommunicationEditingId(null);
      nav("communications");
      await loadCommunications();
      setSelectedCommunication(conversation);
    } catch (error: any) {
      setCommunicationError(error?.message || "Could not open this conversation.");
    }
  };

  const sendCommunicationMessage = async () => {
    if (!user || !selectedCommunication || (!communicationDraft.trim() && !communicationAttachment) || communicationSending) return;
    setCommunicationSending(true);
    setCommunicationError("");
    try {
      if (communicationEditingId) {
        await api(`/api/communications/conversations/${selectedCommunication.id}/messages/${communicationEditingId}?user_id=${user.user_id}`, { method: "PATCH", body: JSON.stringify({ body: communicationDraft.trim() }) });
        setCommunicationEditingId(null);
      } else {
        const form = new FormData();
        form.append("user_id", String(user.user_id));
        form.append("body", communicationDraft.trim());
        if (communicationAttachment) form.append("attachment", communicationAttachment);
        if (communicationReplyTarget) form.append("reply_to_id", String(communicationReplyTarget.id));
        const token = JSON.parse(localStorage.getItem("khanmigo_user") || "{}").access_token || "";
        const response = await fetch(`${API_BASE}/api/communications/conversations/${selectedCommunication.id}/messages`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.detail || "Message could not be sent.");
      }
      setCommunicationDraft("");
      setCommunicationAttachment(null);
      setCommunicationReplyTarget(null);
      if (communicationFileRef.current) communicationFileRef.current.value = "";
      const rows = await api(`/api/communications/conversations/${selectedCommunication.id}/messages?user_id=${user.user_id}`);
      setCommunicationMessages(Array.isArray(rows) ? rows : []);
      void loadCommunications();
    } catch (error: any) {
      setCommunicationError(error?.message || "Message could not be sent.");
    } finally {
      setCommunicationSending(false);
    }
  };

  const startCommunicationRecording = async () => {
    if (communicationRecording) { communicationRecorderRef.current?.stop(); setCommunicationRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      communicationRecorderChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) communicationRecorderChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const mime = (recorder.mimeType || "audio/webm").split(";")[0];
        const extension = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(communicationRecorderChunksRef.current, { type: mime });
        if (blob.size) setCommunicationAttachment(new File([blob], `voice-${Date.now()}.${extension}`, { type: mime }));
      };
      communicationRecorderRef.current = recorder;
      recorder.start();
      setCommunicationRecording(true);
      setCommunicationError("");
    } catch (error: any) { setCommunicationError(error?.message || "Allow microphone access to record a voice note."); }
  };

  const actOnCommunicationMessages = async (action: "reply" | "copy" | "edit" | "delete") => {
    if (!user || !selectedCommunication || !communicationSelectedIds.length) return;
    const chosen = communicationMessages.filter((message: any) => communicationSelectedIds.includes(Number(message.id)));
    const first = chosen[0];
    if (action === "reply" && first) { setCommunicationReplyTarget(first); setCommunicationSelectedIds([]); return; }
    if (action === "copy" && first) {
      try { await navigator.clipboard.writeText(first.body || first.attachment_name || ""); setCommunicationError("Message copied to clipboard."); }
      catch { setCommunicationError("Clipboard access is unavailable in this browser."); }
      setCommunicationSelectedIds([]); return;
    }
    if (action === "edit" && first && Number(first.sender_id) === Number(user.user_id) && first.body) {
      setCommunicationDraft(first.body); setCommunicationEditingId(Number(first.id)); setCommunicationAttachment(null); setCommunicationReplyTarget(null); setCommunicationSelectedIds([]); return;
    }
    if (action === "delete") {
      const deletable = chosen.filter((message: any) => Number(message.sender_id) === Number(user.user_id));
      if (!deletable.length) { setCommunicationError("You can delete only your own messages."); return; }
      if (!window.confirm(`Delete ${deletable.length} selected message${deletable.length === 1 ? "" : "s"}?`)) return;
      try {
        await Promise.all(deletable.map((message: any) => api(`/api/communications/conversations/${selectedCommunication.id}/messages/${message.id}?user_id=${user.user_id}`, { method: "DELETE" })));
        const removed = new Set(deletable.map((message: any) => Number(message.id)));
        setCommunicationMessages((current) => current.filter((message: any) => !removed.has(Number(message.id))));
        setCommunicationSelectedIds([]); setCommunicationError("");
      } catch (error: any) { setCommunicationError(error?.message || "Messages could not be deleted."); }
    }
  };

  const translateCommunicationMessage = async (message: any) => {
    if (!user || !selectedCommunication) return;
    const key = `${message.id}:${classChatLanguage}`;
    const current = communicationTranslations[key];
    if (current) { setCommunicationTranslations((values) => ({ ...values, [key]: "" })); return; }
    setCommunicationTranslating(key);
    try {
      const response = await api(`/api/communications/conversations/${selectedCommunication.id}/messages/${message.id}/translation?user_id=${user.user_id}&language=${encodeURIComponent(classChatLanguage)}`, { method: "POST" });
      setCommunicationTranslations((values) => ({ ...values, [key]: response.translation || "" }));
    } catch (error: any) { setCommunicationError(error?.message || "AI translation could not be prepared."); }
    finally { setCommunicationTranslating(null); }
  };

  const loadClassStaffAccess = async (classId: number) => {
    if (!user || user.role !== "teacher") return;
    try {
      const rows = await api(`/api/classes/${classId}/staff-access?teacher_id=${user.user_id}`);
      setClassStaffGrants(Array.isArray(rows) ? rows : []);
    } catch (error: any) {
      setTeacherPortalError(error?.message || "Unable to load student staff permissions.");
    }
  };

  const updateStaffAccess = async (studentId: number, staffId: number, isActive: boolean) => {
    if (!user || !selectedTeacherClass) return;
    try {
      await api(`/api/classes/${selectedTeacherClass.id}/staff-access`, {
        method: "POST",
        body: JSON.stringify({ teacher_id: user.user_id, student_id: studentId, staff_id: staffId, is_active: isActive }),
      });
      await loadClassStaffAccess(selectedTeacherClass.id);
    } catch (error: any) {
      setTeacherPortalError(error?.message || "Could not update staff contact access.");
    }
  };

  const loadStaffDepartments = async () => {
    if (!user || user.role !== "staff") return;
    try {
      const rows = await api(`/api/departments?requester_id=${user.user_id}`);
      setStaffDepartments(Array.isArray(rows) ? rows : []);
    } catch (error: any) { setStaffError(error?.message || "Unable to load departments."); }
  };

  useEffect(() => {
    if (!user) return;
    localStorage.setItem("khanmigo_user", JSON.stringify(user));
    loadConversations();
    loadFullProfile();
    if (user.role === "teacher") loadTeacherPortal();
    if (user.role === "student") loadStudentPortal();
    if (user.role === "staff") loadStaffClasses();
    if (user.role === "staff") loadStaffAnnouncements();
    if (user.role === "staff") loadStaffReport();
    if (user.role === "staff") loadStaffAttendance();
  }, [user]);

  useEffect(() => {
    if (user?.role !== "staff") return;
    if (activeTab === "students" || activeTab === "teachers" || activeTab === "staff") void loadStaffDirectory(activeTab);
    if (activeTab === "departments") void loadStaffDepartments();
  }, [activeTab, user?.role, user?.user_id]);

  useEffect(() => {
    if (activeTab === "communications") void loadCommunications();
    if (activeTab === "meetings") void loadMeetings();
  }, [activeTab, user?.user_id]);

  useEffect(() => {
    setSelectedCommunication(null);
    setCommunicationMessages([]);
    setCommunicationContacts([]);
    setCommunicationConversations([]);
    setCommunicationDraft("");
    setCommunicationError("");
  }, [user?.user_id]);

  useEffect(() => {
    if (activeTab !== "communications" || !selectedCommunication?.id || !user) return;
    let live = true;
    const refresh = async () => {
      try {
        const rows = await api(`/api/communications/conversations/${selectedCommunication.id}/messages?user_id=${user.user_id}`);
        if (live) setCommunicationMessages(Array.isArray(rows) ? rows : []);
      } catch (error: any) { if (live) setCommunicationError(error?.message || "Conversation is no longer available."); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => { live = false; window.clearInterval(timer); };
  }, [activeTab, selectedCommunication?.id, user?.user_id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      try { recognitionRef.current?.stop(); } catch {}
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);
    try {
      if (authMode === "forgot") {
        if (!email.trim()) throw new Error("Enter the email address for your account.");
        const data = await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
        setAuthSuccess(data.message || "If an account exists for that email, password reset instructions will be sent.");
        return;
      }
      if (authMode === "reset") {
        if (password !== resetConfirmPassword) throw new Error("The passwords do not match.");
        const data = await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token: resetToken, password }) });
        setPassword("");
        setResetConfirmPassword("");
        setResetToken("");
        setAuthMode("login");
        setAuthSuccess(data.message || "Password updated. Sign in with your new password.");
        return;
      }
      if (authMode === "register" && !termsAccepted) throw new Error("Please accept the terms.");
      if (authMode === "register" && !fullName.trim()) throw new Error("Enter your full name.");
      if (authMode === "register" && selectedRole === "teacher" && (!qualification.trim() || !teachingSubject.trim())) {
        throw new Error("Enter your teaching qualification and subject.");
      }
      if (authMode === "register" && selectedRole === "staff" && (!qualification.trim() || !designation.trim())) {
        throw new Error("Enter your qualification and designation.");
      }
      if (authMode === "register" && selectedRole === "staff" && !staffRegistrationCode.trim()) {
        throw new Error("Enter the staff registration code provided by your administrator.");
      }
      if (!email.trim() || !password) throw new Error("Email and password are required.");
      const payload = authMode === "login"
        ? { email: email.trim(), password }
        : {
            full_name: fullName.trim(),
            email: email.trim(),
            password,
            role: selectedRole,
            institution_mode: selectedInstitution,
            qualification: selectedRole === "student" ? "" : qualification.trim(),
            teaching_subject: selectedRole === "teacher" ? teachingSubject.trim() : "",
            designation: selectedRole === "staff" ? designation.trim() : "",
            staff_registration_code: selectedRole === "staff" ? staffRegistrationCode.trim() : "",
          };
      const data = await api(authMode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify(payload) });
      if (authMode === "login") {
        const nextUser: User = { ...data, access_token: data.access_token, role: normalizeRole(data.role) };
        setUser(nextUser);
      } else {
        setAuthMode("login");
        setPassword("");
        setQualification("");
        setTeachingSubject("");
        setDesignation("");
        setStaffRegistrationCode("");
        setSelectedRole("student");
        setAuthSuccess("Registration complete. Sign in to continue.");
      }
    } catch (e: any) {
      setAuthError(e?.message === "Failed to fetch" ? "Backend server is offline. Start FastAPI first." : e?.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    abortRef.current?.abort();
    try { recognitionRef.current?.stop(); } catch {}
    localStorage.removeItem("khanmigo_user");
    setUser(null);
    setMessages([]);
    setConversations([]);
    setCurrentConvId(null);
    setSelectedFiles([]);
    setActiveTab("dashboard");
  };

  useEffect(() => {
    setDirectorySearchDraft("");
    setDirectorySearchApplied("");
    setAccountManagementError("");
    setAccountManagementNotice("");
  }, [activeTab]);

  useEffect(() => {
    if (user?.institution_mode === "University" && quizSource === "curriculum") setQuizSource("ai");
  }, [user?.institution_mode, quizSource]);

  useEffect(() => {
    if (!user || user.role !== "student" || activeTab !== "student-class-detail" || !studentSelectedClass?.id) return;
    const classId = studentSelectedClass.id;
    const refresh = async () => {
      try {
        setStudentClassWork(await api(`/api/classes/${classId}/my-work?user_id=${user.user_id}`));
      } catch {
        // keep the last loaded list
      }
    };
    const timer = window.setInterval(refresh, 20000);
    return () => window.clearInterval(timer);
  }, [user?.user_id, user?.role, activeTab, studentSelectedClass?.id]);

  const openStudentClass = async (cls: any) => {
    if (!user) return;
    try {
      const data = await api(`/api/classes/${cls.id}?user_id=${user.user_id}`);
      setStudentSelectedClass(data);
      try {
        setStudentClassWork(await api(`/api/classes/${cls.id}/my-work?user_id=${user.user_id}`));
      } catch {
        setStudentClassWork([]);
      }
      setActiveTab("student-class-detail");
    } catch (e: any) {
      setStudentError(e?.message || "Unable to open classroom.");
    }
  };

  const joinStudentClass = async () => {
    if (!user || !studentJoinCode.trim()) return;
    try {
      setStudentLoading(true);
      setStudentError("");
      await api("/api/classes/join", { method: "POST", body: JSON.stringify({ student_id: user.user_id, join_code: studentJoinCode.trim() }) });
      setStudentJoinCode("");
      setStudentSuccess("Classroom joined successfully.");
      await loadStudentPortal();
    } catch (e: any) {
      setStudentError(e?.message || "Unable to join classroom.");
    } finally {
      setStudentLoading(false);
    }
  };

  const postClassAnnouncement = async () => {
    if (!user || user.role !== "teacher" || !selectedTeacherClass) return;
    if (!classAnnouncementTitle.trim() || !classAnnouncementBody.trim()) {
      setClassAnnouncementError("Add a title and message before posting.");
      return;
    }
    setClassAnnouncementSaving(true);
    setClassAnnouncementError("");
    try {
      await api("/api/announcements", {
        method: "POST",
        body: JSON.stringify({
          author_id: user.user_id,
          class_id: selectedTeacherClass.id,
          title: classAnnouncementTitle.trim(),
          body: classAnnouncementBody.trim(),
        }),
      });
      const updatedClass = await api(`/api/classes/${selectedTeacherClass.id}?user_id=${user.user_id}`);
      setSelectedTeacherClass(updatedClass);
      setClassAnnouncementTitle("");
      setClassAnnouncementBody("");
    } catch (error: any) {
      setClassAnnouncementError(error?.message || "Could not post this class announcement.");
    } finally {
      setClassAnnouncementSaving(false);
    }
  };

  const updateJoinAccess = async (classroom: TeacherClass) => {
    if (!user || user.role !== "teacher") return;
    try {
      await api(`/api/classes/${classroom.id}/join-access`, {
        method: "POST",
        body: JSON.stringify({ teacher_id: user.user_id, is_active: !classroom.is_active }),
      });
      await loadTeacherPortal();
      if (selectedTeacherClass?.id === classroom.id) {
        setSelectedTeacherClass({ ...selectedTeacherClass, is_active: !classroom.is_active });
      }
    } catch (error: any) {
      setTeacherPortalError(error?.message || "Could not update class join access.");
    }
  };

  const postStaffAnnouncement = async () => {
    if (!user || user.role !== "staff") return;
    if (!staffAnnouncementTitle.trim() || !staffAnnouncementBody.trim()) {
      setStaffAnnouncementError("Add a title and message before posting.");
      return;
    }
    setStaffAnnouncementSaving(true);
    setStaffAnnouncementError("");
    try {
      await api("/api/announcements", {
        method: "POST",
        body: JSON.stringify({
          author_id: user.user_id,
          title: staffAnnouncementTitle.trim(),
          body: staffAnnouncementBody.trim(),
        }),
      });
      setStaffAnnouncementTitle("");
      setStaffAnnouncementBody("");
      await loadStaffAnnouncements();
    } catch (error: any) {
      setStaffAnnouncementError(error?.message || "Could not post this notice.");
    } finally {
      setStaffAnnouncementSaving(false);
    }
  };

  const submitStudentAssignment = async () => {
    if (!user || user.role !== "student" || !studentSelectedAssignment) return;

    const answer = studentAssignmentText.trim();
    if (!answer && !assignmentFile) {
      return setStudentError("Please write an answer or upload a file before submitting.");
    }

    try {
      setStudentLoading(true);
      setStudentError("");
      setStudentSuccess("");

      const fd = new FormData();
      fd.append("student_id", String(user.user_id));
      fd.append("text_content", answer);
      if (assignmentFile) {
        fd.append("file", assignmentFile);
      }

      // We bypass the global api() here because we are sending FormData, not JSON
      const response = await fetch(`${API_BASE}/api/assignments/${studentSelectedAssignment.id}/submit-file`, {
        method: "POST",
        headers: user.access_token ? { Authorization: `Bearer ${user.access_token}` } : {},
        body: fd,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Submission failed.");

      setStudentAssignmentText("");
      setAssignmentFile(null);
      setStudentSuccess(data.message || "Assignment submitted successfully.");
      await loadStudentPortal();

      try {
        const assignments = await api(`/api/assignments/student/${user.user_id}`);
        if (Array.isArray(assignments)) {
          const updatedAssignment = assignments.find((item: any) => Number(item.id) === Number(studentSelectedAssignment.id));
          if (updatedAssignment) setStudentSelectedAssignment(updatedAssignment);
        }
      } catch (refreshError) {
        console.error("Assignment refresh error:", refreshError);
      }
    } catch (e: any) {
      setStudentError(e?.message || "Unable to submit assignment.");
    } finally {
      setStudentLoading(false);
    }
  };

  const openStudentQuiz = async (quiz: any) => {
    if (!user) return;
    try {
      const data = await api(`/api/quizzes/${quiz.id}?student_id=${user.user_id}`);
      let questions = data.questions;
      if (!Array.isArray(questions) && data.questions_json) {
        try { questions = JSON.parse(data.questions_json); } catch { questions = []; }
      }
      setStudentSelectedQuiz({ ...data, questions: Array.isArray(questions) ? questions : [] });
      setStudentQuizAnswers(new Array(Array.isArray(questions) ? questions.length : 0).fill(""));
      setActiveTab("student-quiz");
    } catch (e: any) {
      setStudentError(e?.message || "Unable to open quiz.");
    }
  };

 const submitStudentQuiz = async () => {
    if (!user || !studentSelectedQuiz) return;

    try {
      setStudentLoading(true);
      setStudentError("");
      setStudentSuccess("");

      const payload = {
        student_id: user.user_id,
        answers: studentQuizAnswers, // Yeh array of answers hai
      };

      const response = await api(`/api/quizzes/${studentSelectedQuiz.id}/submit`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setStudentSuccess(`Quiz submitted successfully! Score: ${response.score}/${response.total} (${response.percentage}%).`);
      await loadStudentPortal();

      // Submit hone ke baad quizzes tab par wapas le aayein
      setTimeout(() => {
        nav("quizzes");
      }, 1500);

    } catch (e: any) {
      console.error("QUIZ SUBMISSION ERROR:", e);
      setStudentError(e?.message || "Unable to submit quiz. Please check backend.");
    } finally {
      setStudentLoading(false);
    }
  };

  const deleteConversation = async (convId: string) => {
    if (!user) return;
    try {
      await api(`/api/conversations/${user.user_id}/${convId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => (c.conversation_id || c.id) !== convId));
      if (currentConvId === convId) {
        setCurrentConvId(null);
        setMessages([]);
      }
      setDeletingConvId(null);
    } catch {
      setConversations((prev) => prev.filter((c) => (c.conversation_id || c.id) !== convId));
      if (currentConvId === convId) {
        setCurrentConvId(null);
        setMessages([]);
      }
      setDeletingConvId(null);
    }
  };

  const createTeacherClass = async () => {
    if (!user || !newClass.name.trim()) return setTeacherPortalError("Class name is required.");
    try {
      setTeacherPortalLoading(true);
      await api("/api/classes", {
        method: "POST",
        body: JSON.stringify({
          teacher_id: user.user_id,
          name: newClass.name.trim(),
          subject: newClass.subject,
          institution_mode: user.institution_mode || "University",
          grade_level: newClass.grade_level,
          section: newClass.section,
          course_code: newClass.course_code,
          description: newClass.description,
        }),
      });
      setNewClass({ name: "", subject: "", grade_level: "", section: "", course_code: "", description: "" });
      setIsCreatingClass(false);
      await loadTeacherPortal();
    } catch (e: any) {
      setTeacherPortalError(e?.message || "Unable to create classroom.");
    } finally {
      setTeacherPortalLoading(false);
    }
  };

  const loadClassStudents = async (classId: number) => {
    if (!user) return;
    try {
      const data = await api(`/api/classes/${classId}/students?user_id=${user.user_id}`);
      setTeacherClassStudents(Array.isArray(data) ? data.map((x: any) => ({ ...x, id: x.student_id || x.id })) : []);
    } catch (e: any) {
      setTeacherPortalError(e?.message || "Unable to load students.");
    }
  };

  const openTeacherClass = async (classroom: TeacherClass) => {
    if (!user) return;
    try {
      const detail = await api(`/api/classes/${classroom.id}?user_id=${user.user_id}`);
      setSelectedTeacherClass(detail);
      await loadClassStudents(classroom.id);
      await loadClassStaffAccess(classroom.id);
      const contacts = await api(`/api/communications/contacts?user_id=${user.user_id}`);
      setCommunicationContacts(Array.isArray(contacts) ? contacts : []);
      nav("class-detail");
    } catch (error: any) {
      setTeacherPortalError(error?.message || "Unable to open classroom.");
    }
  };

  const openCommunication = async (conversation: any) => {
    setSelectedCommunication(conversation);
    setCommunicationMessages([]);
    setCommunicationSelectedIds([]);
    setCommunicationAttachment(null);
    setCommunicationReplyTarget(null);
    setCommunicationEditingId(null);
    setCommunicationError("");
    if (!user) return;
    try {
      const rows = await api(`/api/communications/conversations/${conversation.id}/messages?user_id=${user.user_id}`);
      setCommunicationMessages(Array.isArray(rows) ? rows : []);
    } catch (error: any) {
      setCommunicationError(error?.message || "Could not open this conversation.");
    }
  };

  const removeStudent = async (classId: number, studentId: number) => {
    if (!user || !confirm("Remove this student from the class?")) return;
    try {
      await api(`/api/classes/${classId}/students/${studentId}?teacher_id=${user.user_id}`, { method: "DELETE" });
      await loadClassStudents(classId);
      await loadTeacherPortal();
    } catch (e: any) {
      alert(e?.message || "Unable to remove student.");
    }
  };

  const createAssignment = async () => {
    if (!user) return;
    if (!newAssignment.class_id || !newAssignment.title.trim()) return setTeacherPortalError("Select a classroom and assignment title.");
    try {
      setTeacherPortalLoading(true);
      await api("/api/assignments", {
        method: "POST",
        body: JSON.stringify({
          teacher_id: user.user_id,
          class_id: Number(newAssignment.class_id),
          title: newAssignment.title.trim(),
          description: newAssignment.description,
          due_date: newAssignment.due_date,
          total_marks: Number(newAssignment.total_marks) || 100,
        }),
      });
      setNewAssignment({ class_id: "", title: "", description: "", due_date: "", total_marks: "100" });
      setIsCreatingAssignment(false);
      await loadTeacherPortal();
    } catch (e: any) {
      setTeacherPortalError(e?.message || "Unable to create assignment.");
    } finally {
      setTeacherPortalLoading(false);
    }
  };

  const publishAssignment = async (assignment: any) => {
    if (!user || user.role !== "teacher") return;
    try {
      setTeacherPortalLoading(true);
      await api(`/api/assignments/${assignment.id}/publish?teacher_id=${user.user_id}`, { method: "POST" });
      await loadTeacherPortal();
    } catch (error: any) {
      setTeacherPortalError(error?.message || "Could not publish assignment.");
    } finally {
      setTeacherPortalLoading(false);
    }
  };

  const loadSubmissions = async (assignment: Assignment) => {
    if (!user || user.role !== "teacher") return;
    try {
      setTeacherPortalLoading(true);
      setTeacherPortalError("");
      const assignmentId = Number(assignment?.id);
      if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
        throw new Error("Invalid assignment ID.");
      }
      const data = await api(`/api/assignments/${assignmentId}/submissions?teacher_id=${user.user_id}`);
      setSelectedAssignment(assignment);
      setSubmissions(Array.isArray(data) ? data : []);
      setActiveTab("submissions");
    } catch (e: any) {
      console.error("LOAD SUBMISSIONS ERROR:", e);
      setTeacherPortalError(e?.message || `Unable to load submissions for assignment #${assignment?.id}.`);
    } finally {
      setTeacherPortalLoading(false);
    }
  };

  const checkSubmissionDocumentWithAI = async (submission: any) => {
    if (!user || !submission?.id) return;
    setCheckingSubmissionId(Number(submission.id));
    setTeacherPortalError("");
    try {
      const result = await api("/api/teacher/assignments/check", {
        method: "POST",
        body: JSON.stringify({ teacher_id: user.user_id, submission_id: submission.id, max_marks: submission.total_marks || selectedAssignment?.total_marks || 100 }),
      });
      setSubmissionAIEvaluations((current) => ({ ...current, [submission.id]: result }));
    } catch (error: any) {
      setTeacherPortalError(error?.message || "AI could not read this submission.");
    } finally {
      setCheckingSubmissionId(null);
    }
  };

  const publishSubmissionAIEvaluation = async (submission: any) => {
    if (!user) return;
    const result = submissionAIEvaluations[submission.id];
    const evaluation = result?.evaluation;
    if (!evaluation) return;
    setTeacherPortalLoading(true);
    setTeacherPortalError("");
    try {
      await api(`/api/assignments/submissions/${submission.id}/grade`, {
        method: "POST",
        body: JSON.stringify({ teacher_id: user.user_id, score: evaluation.suggested_score, feedback: evaluation.detailed_feedback || evaluation.overall_summary || "", evaluation_source: "ai" }),
      });
      setSubmissions((items: any[]) => items.map((item) => Number(item.id) === Number(submission.id) ? { ...item, score: evaluation.suggested_score, feedback: evaluation.detailed_feedback || evaluation.overall_summary, status: "graded" } : item));
      setSubmissionAIEvaluations((current) => ({ ...current, [submission.id]: { ...current[submission.id], published: true } }));
      await loadTeacherPortal();
    } catch (error: any) {
      setTeacherPortalError(error?.message || "Could not publish this grade.");
    } finally {
      setTeacherPortalLoading(false);
    }
  };

  const openGradeModal = (sub: any) => {
    setgradingSubmission(sub);
    setManualScore(sub.score !== null && sub.score !== undefined ? String(sub.score) : "");
    setManualFeedback(sub.feedback || "");
    setTeacherPortalError("");
  };

  const handleSaveManualGrade = async () => {
    if (!gradingSubmission) return;
    const totalPossible = gradingSubmission.total_marks ?? selectedAssignment?.total_marks ?? 100;
    const numericScore = parseFloat(manualScore);

    if (isNaN(numericScore) || numericScore < 0 || numericScore > totalPossible) {
      setTeacherPortalError(`Obtained marks must be a valid number between 0 and ${totalPossible}.`);
      return;
    }

    try {
      setIsSubmittingGrade(true);
      setTeacherPortalError("");
      const teacherId = Number(user?.user_id || 2);
      const payload = {
        teacher_id: teacherId,
        score: numericScore,
        feedback: manualFeedback.trim(),
        evaluation_source: "manual",
      };

      const response = await fetch(
        `${API_BASE}/api/assignments/submissions/${gradingSubmission.id}/grade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(user?.access_token ? { Authorization: "Bearer " + user.access_token } : {}) },
          body: JSON.stringify(payload),
        }
      );

      const textData = await response.text();
      let result: any = {};
      if (textData) {
        try { result = JSON.parse(textData); } catch { throw new Error(`Server returned non-JSON: ${textData}`); }
      }

      if (!response.ok) {
        throw new Error(result.detail || result.error || result.message || `Server Error ${response.status}`);
      }

      setSubmissions((prev: any[]) =>
        prev.map((item) =>
          item.id === gradingSubmission.id
            ? { ...item, score: numericScore, feedback: manualFeedback.trim(), status: "graded" }
            : item
        )
      );
      setgradingSubmission(null);
      alert("Grade saved and published successfully!");
    } catch (err: any) {
      setTeacherPortalError(err.message || "An error occurred while grading.");
    } finally {
      setIsSubmittingGrade(false);
    }
  };

  const resetTool = () => {
    setTeacherOutput(null);
    setTeacherPortalError("");
    setToolSubject("");
    setToolTopic("");
    setRubricTitle("");
    setRubricCriteria("");
    setLearningObjective("");
    setParentStudentName("");
    setParentContext("");
    setSubmissionId("");
    setToolText("");
  };

  const openTeacherTool = (tool: ToolConfig) => {
    resetTool();
    setSelectedTool(tool);
    if (tool.id === "chat-gpt") {
      setActiveTab("chat");
      setMessages([{ sender: "assistant", content: "Hello! I am your Teacher AI Assistant. Tell me what you want to prepare." }]);
    } else {
      setActiveTab("tool-form");
    }
  };

  const loadQuizCurriculum = async () => {
    setQuizCurriculumLoading(true);
    setQuizCurriculumError("");
    try {
      await loadCurriculumBooks("");
    } catch (error: any) {
      setQuizCurriculumError(error?.message || "Could not load the official textbook catalogue.");
    } finally {
      setQuizCurriculumLoading(false);
    }
  };

  const selectQuizCurriculumBook = async (bookId: string) => {
    setQuizCurriculumBookId(bookId);
    setQuizCurriculumChapter("");
    setQuizCurriculumTopic("");
    setCurriculumChapters([]);
    if (!bookId || !user) return;
    const book = curriculumBooks.find((item) => String(item.id) === bookId);
    if (!book) return;
    setQuizCurriculumLoading(true);
    setQuizCurriculumError("");
    try {
      const result = await api(`/api/curriculum/books/${book.id}/chapters`, {
        method: "POST",
        body: JSON.stringify({ teacher_id: user.user_id }),
      });
      const chapters = (Array.isArray(result.chapters) ? result.chapters : [])
        .map((chapter: any) => ({ title: String(chapter.title || "Chapter"), topics: Array.isArray(chapter.topics) ? chapter.topics.map(String) : [] }))
        .filter((chapter: CurriculumChapter) => chapter.title || chapter.topics.length);
      setCurriculumChapters(chapters);
    } catch (error: any) {
      setQuizCurriculumError(error?.message || "Could not read this textbook outline.");
    } finally {
      setQuizCurriculumLoading(false);
    }
  };

  const generateQuizFromPortal = async () => {
    if (!user || user.role !== "teacher") return;
    const classId = selectedTeacherClass?.id;
    if (!classId) {
      setTeacherPortalError("Select a classroom for this quiz.");
      return;
    }
    let payload: Record<string, unknown>;
    if (quizSource === "curriculum") {
      const book = curriculumBooks.find((item) => String(item.id) === quizCurriculumBookId);
      if (!book) { setTeacherPortalError("Select an official textbook."); return; }
      if (!quizCurriculumChapter || !quizCurriculumTopic) { setTeacherPortalError("Select a chapter and topic from the textbook."); return; }
      payload = { teacher_id: user.user_id, class_id: classId, book_id: book.id, subject: book.subject, chapter: quizCurriculumChapter, topic: quizCurriculumTopic, grade_level: String(book.grade), question_count: Number(quizCount), difficulty: quizDifficulty };
    } else {
      if (!toolTopic.trim()) { setTeacherPortalError("Enter a topic for the AI generated quiz."); return; }
      payload = { teacher_id: user.user_id, class_id: classId, subject: toolSubject, topic: toolTopic.trim(), grade_level: selectedTeacherClass?.grade_level || "", question_count: Number(quizCount), difficulty: quizDifficulty };
    }
    setTeacherPortalLoading(true);
    setTeacherPortalError("");
    setQuizPortalNotice("");
    try {
      const result = await api("/api/teacher/quizzes/generate-and-save", { method: "POST", body: JSON.stringify(payload) });
      await loadTeacherPortal();
      setQuizPortalNotice(`Quiz created: ${result.title || "Your quiz is ready."}`);
    } catch (error: any) {
      setTeacherPortalError(error?.message || "Could not generate this quiz.");
    } finally {
      setTeacherPortalLoading(false);
    }
  };

  const runTeacherTool = async () => {
    if (!user || user.role !== "teacher" || !selectedTool) return;
    const classId = selectedTeacherClass?.id || (newAssignment.class_id ? Number(newAssignment.class_id) : null);
    setTeacherPortalLoading(true);
    setTeacherPortalError("");
    setTeacherOutput(null);
    try {
      let result: any;
      switch (selectedTool.id) {
        case "lesson-plan":
          if (!toolTopic.trim()) throw new Error("Topic is required.");
          result = await api("/api/teacher/lesson-plans/generate", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, subject: toolSubject, grade_level: selectedTeacherClass?.grade_level || "", topic: toolTopic, duration_minutes: Number(lessonDuration), format: lessonFormat, detail_level: lessonDetail, objectives: learningObjective }) });
          break;
        case "quiz-generator":
          if (!classId) throw new Error("Select a classroom to save and share the quiz.");
          if (quizSource === "curriculum") {
            const book = curriculumBooks.find((item) => String(item.id) === quizCurriculumBookId);
            if (!book) throw new Error("Select an official textbook.");
            if (!quizCurriculumChapter || !quizCurriculumTopic) throw new Error("Select a chapter and topic from the textbook.");
            result = await api("/api/teacher/quizzes/generate-and-save", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, book_id: book.id, subject: book.subject, chapter: quizCurriculumChapter, topic: quizCurriculumTopic, grade_level: String(book.grade), question_count: Number(quizCount), difficulty: quizDifficulty }) });
          } else {
            if (!toolTopic.trim()) throw new Error("Quiz topic is required.");
            result = await api("/api/teacher/quizzes/generate-and-save", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, subject: toolSubject, topic: toolTopic, grade_level: selectedTeacherClass?.grade_level || "", question_count: Number(quizCount), difficulty: quizDifficulty }) });
          }
          await loadTeacherPortal();
          break;
        case "rubric-generator":
          if (!rubricTitle.trim()) throw new Error("Rubric title is required.");
          result = await api("/api/teacher/rubrics/generate", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, title: rubricTitle, criteria: rubricCriteria, subject: toolSubject, grade_level: selectedTeacherClass?.grade_level || "", assignment_type: rubricTitle }) });
          break;
        case "activity-generator":
          if (!toolTopic.trim()) throw new Error("Activity topic is required.");
          result = await api("/api/teacher/activities/generate", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, topic: toolTopic, activity_type: activityType, duration_minutes: Number(lessonDuration), student_level: studentLevel }) });
          break;
        case "group-generator":
          if (!classId) throw new Error("Select a classroom first.");
          result = await api("/api/teacher/student-groups/generate", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, strategy: groupStrategy, group_count: Number(groupCount) }) });
          break;
        case "differentiation":
          if (!toolTopic.trim()) throw new Error("Topic is required.");
          result = await api("/api/teacher/differentiation/generate", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, topic: toolTopic, student_level: studentLevel, learning_objective: learningObjective }) });
          break;
        case "exit-ticket":
          if (!toolTopic.trim()) throw new Error("Topic is required.");
          result = await api("/api/teacher/exit-tickets/generate", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, topic: toolTopic, question_count: Number(exitCount), difficulty: quizDifficulty }) });
          break;
        case "progress-report":
          if (!classId) throw new Error("Select a classroom first.");
          result = await api("/api/teacher/progress/generate-report", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, title: `${selectedTeacherClass?.name || "Class"} Progress Report` }) });
          break;
        case "parent-message": {
          const student = teacherClassStudents.find((x: any) => x.full_name === parentStudentName);
          result = await api("/api/teacher/parent-messages/generate", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, student_id: student?.id || null, message_type: messageType, student_name: parentStudentName, context: parentContext }) });
          break;
        }
        case "assignment-checker":
          if (!submissionId) throw new Error("Submission ID is required.");
          result = await api("/api/teacher/assignments/check", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, submission_id: Number(submissionId), max_marks: Number(maxMarks) }) });
          break;
        default:
          const promptText = toolText.trim() || `Help me with the teacher tool: ${selectedTool.title}.`;
          launchAIChat(promptText, selectedTool.title);
          return;
      }
      setTeacherOutput(result || { message: "Generated successfully." });
    } catch (e: any) {
      setTeacherPortalError(e?.message || "Tool request failed.");
    } finally {
      setTeacherPortalLoading(false);
    }
  };

  const launchAIChat = (promptText?: string, agentName?: string) => {
    setSelectedTool(agentName ? { id: "quick", title: agentName, description: "", category: "AI", subtitle: "" } : null);
    setCurrentConvId(null);
    setActiveTab("chat");
    setTimeout(() => {
      if (promptText) {
        setMessages([{ sender: "user", content: promptText }, { sender: "assistant", content: "" }]);
        processAIRequest(promptText, [], true);
      }
    }, 0);
  };

  const loadConversation = async (id: string) => {
    if (!user) return;
    try {
      const data = await api(`/api/conversations/${user.user_id}/${id}`);
      setCurrentConvId(id);
      setMessages(Array.isArray(data) ? data.map((m: any) => ({ sender: m.role, content: m.content, input_type: m.input_type, transcription: m.transcription })) : []);
      setActiveTab("chat");
    } catch (e) {
      console.error(e);
    }
  };

  const processAIRequest = async (query: string, files: File[], startNewConversation = false) => {
    if (!user) return;
    setIsLoading(true);
    setFileError("");
    const controller = new AbortController();
    abortRef.current = controller;
    const fd = new FormData();
    fd.append("user_id", String(user.user_id));
    fd.append("user_message", query);
    fd.append("user_role", user.role);
    if (currentConvId && !startNewConversation) fd.append("conversation_id", currentConvId);
    fd.append("agent_name", selectedTool?.title || "Balochistan Acadmy Assistant");
    const textbookContext = selectedCurriculumBook
      ? `Selected textbook: ${selectedCurriculumBook.title}; Grade ${selectedCurriculumBook.grade}; Subject: ${selectedCurriculumBook.subject}; Topic: ${selectedCurriculumTopic || "not selected"}`
      : "";
    const universityCourseContext = selectedUniversityCourse && universityOutline
      ? `Selected LUAWMS course: ${universityOutline.program}, ${selectedUniversitySemester} semester, ${selectedUniversityCourse.title} (${selectedUniversityCourse.code}). If files are attached, treat them as the primary course source, follow their scope and terminology, and do not contradict them. If no files are attached, create an AI-generated draft from reliable general subject knowledge and clearly state it is not verified against the official detailed LUAWMS syllabus. Do not claim to have accessed external books or documents.`
      : "";
    fd.append("workspace_context", [selectedSubject ? `Subject: ${selectedSubject}` : "", textbookContext, universityCourseContext].filter(Boolean).join(" | "));
    if (selectedCurriculumBook) {
      fd.append("curriculum_book_id", String(selectedCurriculumBook.id));
      fd.append("curriculum_topic", selectedCurriculumTopic);
    }
    files.forEach((file) => fd.append("files", file));
    try {
      const response = await fetch(`${API_BASE}/api/agent/chat_multimodal`, { method: "POST", body: fd, signal: controller.signal, headers: user?.access_token ? { Authorization: "Bearer " + user.access_token } : {} });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "AI request failed.");
      if (data.conversation_id) setCurrentConvId(data.conversation_id);
      setMessages((prev) => {
        const next = [...prev];
        if (next.length && next[next.length - 1].sender === "assistant") next[next.length - 1] = { sender: "assistant", content: data.response || "No response returned." };
        else next.push({ sender: "assistant", content: data.response || "No response returned." });
        return next;
      });
      loadConversations();
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          if (next.length && next[next.length - 1].sender === "assistant") next[next.length - 1] = { sender: "assistant", content: `⚠️ ${e?.message || "AI request failed."}` };
          return next;
        });
      }
    } finally {
      setIsLoading(false);
      setSelectedFiles([]);
      abortRef.current = null;
    }
  };

  const sendChat = () => {
    if (isLoading || (!chatInput.trim() && selectedFiles.length === 0)) return;
    const text = chatInput.trim();
    const files = [...selectedFiles];
    const labels = files.map((f) => f.name).join(", ");
    setChatInput("");
    setSelectedFiles([]);
    setIsAttachmentOpen(false);
    setMessages((prev) => [...prev, { sender: "user", content: text || `Attached: ${labels}`, input_type: files.length ? "document" : "text" }, { sender: "assistant", content: "" }]);
    processAIRequest(text, files);
  };

  const addFiles = (incoming: File[]) => {
    const next = [...selectedFiles];
    for (const file of incoming) {
      if (next.length >= MAX_FILES) break;
      if (file.size > MAX_FILE_SIZE) {
        setFileError(`${file.name} exceeds 20 MB.`);
        continue;
      }
      if (!next.some((x) => x.name === file.name && x.size === file.size)) next.push(file);
    }
    setSelectedFiles(next);
  };

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return setFileError("Speech recognition is not supported in this browser. Use Chrome or Edge.");
    if (isRecording) return;
    const recognition = new SpeechRecognition();
    recognition.lang = speechLanguage;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    };
    recognition.onresult = (event: any) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript + " ";
        else interim += transcript;
      }
      if (finalText) setChatInput((prev) => `${prev}${prev ? " " : ""}${finalText}`.trim());
      setInterimTranscript(interim);
    };
    recognition.onerror = () => stopRecording();
    recognition.onend = () => stopRecording();
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setIsRecording(false);
    setInterimTranscript("");
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const attendancePercentage = useMemo(() => {
    if (!studentAttendance.length) return 0;
    const month = localDateKey().slice(0, 7);
    const currentMonth = studentAttendance.filter((x) => String(x.attendance_date || "").startsWith(month));
    const presentDays = new Set(currentMonth.filter((x) => x.status === "present").map((x) => x.attendance_date));
    return Math.min(100, presentDays.size * 5);
  }, [studentAttendance]);

  const nav = (id: Tab) => { setActiveTab(id); setMobileSidebar(false); };

  const NavButton = ({ id, label, icon: Icon }: { id: Tab; label: string; icon: any }) => (
    <button onClick={() => nav(id)} className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold transition ${activeTab === id ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-100"}`}>
      <Icon className="w-4.5 h-4.5" />{label}
    </button>
  );

  const renderClassChat = () => (
    <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 px-4 py-4 text-white sm:px-6">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/10"><MessageSquare className="h-5 w-5" /></span><div><h2 className="font-black">Classroom chat</h2><p className="text-xs text-emerald-100">Messages shared with this class</p></div></div>
        <label className="flex items-center gap-2 text-xs font-bold text-emerald-50"><Languages className="h-4 w-4" /><span className="hidden sm:inline">Translate to</span><select value={classChatLanguage} onChange={(event) => setClassChatLanguage(event.target.value)} aria-label="Choose message translation language" className="max-w-40 rounded-lg border border-white/20 bg-white/10 px-2.5 py-2 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-white/50">{CLASS_CHAT_TRANSLATION_LANGUAGES.map((language) => <option key={language} value={language} className="bg-white text-slate-900">{language}</option>)}</select></label>
      </header>
      {classChatSelectedIds.length > 0 && <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-emerald-100 bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-5"><span className="mr-auto text-xs font-bold text-slate-600">{classChatSelectedIds.length} selected</span><button onClick={() => void actOnSelectedClassMessages("reply")} disabled={classChatSelectedIds.length !== 1} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"><Reply className="h-4 w-4" />Reply</button><button onClick={() => void actOnSelectedClassMessages("copy")} disabled={classChatSelectedIds.length !== 1} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"><Copy className="h-4 w-4" />Copy</button>{classChatSelectedIds.length === 1 && classChatMessages.find((m: any) => Number(m.id) === classChatSelectedIds[0] && Number(m.sender_id) === Number(user?.user_id) && m.body) && <button onClick={() => void actOnSelectedClassMessages("edit")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Pencil className="h-4 w-4" />Edit</button>}<button onClick={() => void actOnSelectedClassMessages("delete")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" />{user?.role === "teacher" ? "Delete selected" : "Delete mine"}</button><button onClick={() => setClassChatSelectedIds([])} className="rounded-lg px-2 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button></div>}
      <div className="class-chat-messages max-h-[58vh] min-h-72 space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50 to-white p-4 sm:min-h-96 sm:p-6">
        {classChatMessages.length === 0 && <div className="flex min-h-64 flex-col items-center justify-center text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><MessageSquare className="h-6 w-6" /></span><h3 className="mt-4 font-black text-slate-800">Start the class conversation</h3><p className="mt-1 max-w-sm text-sm text-slate-500">Ask questions, share voice notes, or attach a study image, video, or PDF.</p></div>}
        {classChatMessages.map((message: any) => {
          const mine = Number(message.sender_id) === Number(user?.user_id);
          const translationKey = `${message.id}:${classChatLanguage}`;
          const translated = classChatTranslations[translationKey] !== undefined ? classChatTranslations[translationKey] : classChatLanguage === "Urdu" ? message.translation_ur : "";
          return <article key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <button onClick={() => toggleClassChatSelection(Number(message.id))} aria-label={classChatSelectedIds.includes(Number(message.id)) ? "Deselect message" : "Select message"} className={`mr-1 mt-3 h-8 shrink-0 rounded-full px-2 text-[10px] font-bold ${classChatSelectedIds.includes(Number(message.id)) ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-emerald-100"}`}>{classChatSelectedIds.includes(Number(message.id)) ? "Selected" : "Select"}</button>
            <div className={`max-w-[92%] min-w-0 rounded-2xl border p-3 shadow-sm sm:max-w-[78%] sm:p-4 ${classChatSelectedIds.includes(Number(message.id)) ? "ring-2 ring-emerald-500" : ""} ${mine ? "rounded-br-md border-emerald-200 bg-emerald-50" : "rounded-bl-md border-slate-200 bg-white"}`}>
              <div className="mb-2 flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-emerald-100 text-xs font-black text-emerald-900">{message.sender_pic ? <AuthenticatedProfileImage userId={Number(message.sender_id)} requesterId={Number(user?.user_id)} revision={message.sender_pic} alt="" className="h-full w-full object-cover" fallback={(message.sender_name || "?").trim().slice(0, 1).toUpperCase()} /> : (message.sender_name || "?").trim().slice(0, 1).toUpperCase()}</span><span className="min-w-0 truncate text-xs font-black text-slate-800">{message.sender_name || "Class member"}{mine ? " · You" : ""}</span><Badge>{message.sender_role}</Badge><time className="ml-auto shrink-0 text-[10px] text-slate-400">{prettyDate(message.created_at)}</time></div>
              {message.reply_to_id && <div className="mb-2 rounded-lg border-l-2 border-emerald-500 bg-white/70 px-2.5 py-1.5"><p className="text-[10px] font-bold text-emerald-800">Reply to {message.reply_sender || "message"}</p><p className="line-clamp-2 break-words text-xs text-slate-500">{message.reply_body || "Original message"}</p></div>}
              {message.body && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{message.body}</p>}
              {message.attachment_name && classChatClassId && user && <ClassroomAttachmentPreview classId={Number(classChatClassId)} message={message} userId={Number(user.user_id)} />}
              <div className="mt-3 border-t border-slate-200/80 pt-2"><button onClick={() => void translateClassChatMessage(message)} disabled={classChatTranslating === translationKey} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50"><Languages className="h-3.5 w-3.5" />{classChatTranslating === translationKey ? "Translating…" : translated ? `Hide ${classChatLanguage}` : `Translate to ${classChatLanguage}`}</button>{translated && <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/80 p-3"><p className="mb-1 text-[10px] font-black uppercase tracking-wide text-indigo-700">{classChatLanguage} translation</p><p dir={CLASS_CHAT_RTL_LANGUAGES.has(classChatLanguage) ? "rtl" : "ltr"} className={`whitespace-pre-wrap text-sm leading-7 text-slate-800 ${CLASS_CHAT_RTL_LANGUAGES.has(classChatLanguage) ? "text-right" : "text-left"}`}>{translated}</p></div>}</div>
            </div>
          </article>;
        })}
        <div ref={classChatEndRef} />
      </div>
      <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
        {classChatError && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{classChatError}</div>}
        {(classChatReplyTarget || classChatEditingId) && <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">{classChatEditingId ? "Editing your message" : `Replying to ${classChatReplyTarget?.sender_name || "class member"}`}</p><p className="truncate text-xs text-slate-600">{classChatEditingId ? "Update the text and save." : classChatReplyTarget?.body || classChatReplyTarget?.attachment_name || "Attachment"}</p></div><button aria-label="Cancel reply or edit" onClick={() => { setClassChatReplyTarget(null); setClassChatEditingId(null); setClassChatDraft(""); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button></div>}
        {classChatAttachment && <ClassChatDraftPreview file={classChatAttachment} onRemove={() => { setClassChatAttachment(null); if (classChatFileRef.current) classChatFileRef.current.value = ""; }} />}
        <textarea value={classChatDraft} onChange={(event) => setClassChatDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendClassChatMessage(); } }} rows={2} maxLength={4000} placeholder={classChatEditingId ? "Edit your message…" : "Write a message or ask a question… (Enter to send)"} className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2"><input ref={classChatFileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/*,application/pdf" onChange={(event) => setClassChatAttachment(event.target.files?.[0] || null)} /><Button variant="ghost" onClick={() => classChatFileRef.current?.click()}><Paperclip className="h-4 w-4" />Attach</Button><Button variant={classChatRecording ? "dark" : "ghost"} onClick={() => void startClassChatRecording()}>{classChatRecording ? <StopCircle className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{classChatRecording ? "Stop voice" : "Record voice"}</Button></div>
          <Button onClick={() => void sendClassChatMessage()} disabled={classChatSending || (!classChatDraft.trim() && !classChatAttachment)}>{classChatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{classChatSending ? "Sending…" : classChatEditingId ? "Save edit" : "Send message"}</Button>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-400">Uploads up to 15 MB. Only teachers and students in this classroom can access its messages and attachments.</p>
      </div>
    </section>
  );

  /* ================= STUDENT RENDER FUNCTIONS ================= */

  const renderStudentDashboard = () => {
    const classesList = Array.isArray(studentClasses) ? studentClasses : [];
    const assignmentsList = Array.isArray(studentAssignments) ? studentAssignments : [];
    const quizzesList = Array.isArray(studentQuizzes) ? studentQuizzes : [];

    return (
      <Page>
        <Header title={`Welcome back, ${user?.full_name || "Student"}`} subtitle="Your learning, books, and classroom work in one place." />
        <section className="dashboard-hero mb-6 overflow-hidden rounded-[1.75rem] bg-[#124b39] text-white shadow-lg shadow-emerald-950/10">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
            <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
              <span className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Keep learning</span>
              <h2 className="max-w-xl text-3xl font-black leading-tight sm:text-4xl">Small steps today. Big possibilities tomorrow.</h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-emerald-50/85">Open your textbooks, ask Khanmigo for a hint, or pick up your classwork whenever you are ready.</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => nav("browse-subjects")} className="bg-white text-emerald-950 hover:bg-emerald-50">Explore textbooks</Button>
                <Button onClick={() => nav("chat")} variant="secondary" className="border-white/30 bg-white/10 text-white hover:bg-white/20">Ask AI to help</Button>
              </div>
            </div>
            <div className="dashboard-hero-image min-h-56 sm:min-h-72 lg:min-h-[340px]">
              <img src={DASHBOARD_IMAGES.student} alt="Students sharing books and learning together" loading="lazy" />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5 mb-6">
          <StatCard label="Roll Number" value={user?.roll_number || profileData?.roll_number || "Assigning…"} icon={Users} />
          <StatCard label="Enrolled Classes" value={classesList.length} icon={BookOpen} />
          <StatCard label="Assignments" value={assignmentsList.length} icon={ClipboardList} />
          <StatCard label="Attendance" value={`${attendancePercentage}%`} icon={Clock} />
          <StatCard label="Quizzes" value={quizzesList.length} icon={CheckSquare} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["My classrooms", "See your classes and teacher updates", "classes", BookOpen], ["Assignments", `${assignmentsList.filter((item: any) => !item.submission_id).length} waiting for you`, "assignments", ClipboardList], ["My quizzes", "Practice what you have learned", "quizzes", CheckSquare], ["My results", "Review marks and teacher feedback", "results", BarChart3]].map(([title, description, tab, Icon]: any) => <button key={tab} onClick={() => nav(tab)} className="group flex min-h-36 flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"><span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 group-hover:bg-emerald-100"><Icon className="h-5 w-5" /></span><span className="font-black text-slate-900">{title}</span><span className="mt-1 text-sm leading-5 text-slate-500">{description}</span></button>)}
        </div>
        <DashboardConnect />
      </Page>
    );
  };

  const renderStudentClasses = () => {
    const list = Array.isArray(studentClasses) ? studentClasses : [];
    return (
      <Page>
        <Header title="My Classrooms" subtitle="Join your teacher’s class with its 8-character invite code. Your classes, assignments and notices stay together here." />
        <div className="bg-white border border-slate-200 rounded-3xl p-6 mb-6 shadow-sm">
          <h3 className="text-sm font-black uppercase text-slate-700 mb-1">Join a classroom</h3>
          <p className="text-sm text-slate-500 mb-3">Ask your teacher for the classroom invite code. It is different from a student ID.</p>
          <div className="flex gap-3">
            <input type="text" maxLength={8} autoCapitalize="characters" autoComplete="off" value={studentJoinCode} onChange={(e) => setStudentJoinCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ""))} placeholder="8-character invite code" aria-label="Classroom invite code" className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm uppercase tracking-[0.2em] outline-none focus:border-blue-500 font-bold" />
            <Button onClick={joinStudentClass} disabled={studentLoading || studentJoinCode.length !== 8}>{studentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join Class"}</Button>
          </div>
          {studentError && <p className="text-xs text-rose-600 font-bold mt-2">{studentError}</p>}
          {studentSuccess && <p className="text-xs text-emerald-600 font-bold mt-2">{studentSuccess}</p>}
        </div>
        {list.length === 0 ? (
          <Empty title="No classrooms joined" text="Join using your teacher's code." />
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            {list.map((cls: any) => (
              <div key={cls.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <h3 className="text-xl font-black text-slate-900">{cls.name}</h3>
                <p className="text-sm text-slate-500 mt-1">{cls.subject || "General"} · {cls.grade_level || cls.institution_mode || "Class"} · Teacher: {cls.teacher_name || "Instructor"}</p>
                <p className="mt-3 text-xs font-semibold text-slate-500">{cls.student_count || 0} classmates</p>
                <Button className="w-full mt-5" onClick={() => openStudentClass(cls)}>Open Classroom</Button>
              </div>
            ))}
          </div>
        )}
      </Page>
    );
  };

  const renderStudentClassDetail = () => {
    if (!studentSelectedClass) return <Empty title="No classroom selected" text="Please choose a classroom first." />;
    return (
      <Page>
        <button onClick={() => nav("classes")} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 mb-5"><ArrowLeft className="w-4 h-4" />Back to Classrooms</button>
        <Header title={studentSelectedClass.name} subtitle={`${studentSelectedClass.subject || "General"} · ${studentSelectedClass.grade_level || studentSelectedClass.institution_mode || "Class"} · Teacher: ${studentSelectedClass.teacher_name || "Instructor"} · ${studentSelectedClass.student_count || 0} classmates`} />
        <SectionCard title="Classroom Overview">
          <p className="text-sm text-slate-600 leading-relaxed">{studentSelectedClass.description || "No description provided."}</p>
        </SectionCard>
        {renderClassChat()}
        <div className="mt-6">
          <SectionCard title="Checked work from your teacher">
            {studentClassWork.length === 0
              ? <Empty title="No checked work yet" text="After your teacher checks your quiz or assignment, your answers and the teacher's feedback will appear here." />
              : <div className="space-y-4">{studentClassWork.map((w: any) => (
                <details key={`${w.kind}-${w.id}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-bold text-slate-900">
                    <span>{w.title} <span className="text-xs font-semibold text-slate-500">({w.kind === "quiz" ? "Quiz" : "Assignment"} · {prettyDate(w.submitted_at)})</span></span>
                    <Badge>{`Marks: ${w.score}/${w.total_marks}`}</Badge>
                  </summary>
                  <div className="mt-4 space-y-3 text-sm">
                    {w.kind === "assignment" && (
                      <>
                        <div><p className="text-xs font-black uppercase text-slate-500">What you wrote</p><p className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-slate-800">{w.answer_text || "No text answer."}</p></div>
                        {w.file_name && <CheckedWorkFileLink classId={Number(studentSelectedClass.id)} submissionId={Number(w.id)} fileName={w.file_name} userId={Number(user?.user_id)} />}
                      </>
                    )}
                    {w.kind === "quiz" && (w.answers || []).map((a: any, i: number) => {
                      const right = String(a.your_answer || "").trim().toLowerCase() === String(a.correct_answer || "").trim().toLowerCase();
                      return <div key={i} className={`rounded-xl border p-3 ${right ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                        <p className="font-bold text-slate-900">{i + 1}. {a.question}</p>
                        <p className="mt-1 text-slate-700">Your answer: <b>{a.your_answer || "No answer"}</b></p>
                        {!right && <p className="text-slate-700">Correct answer: <b>{a.correct_answer}</b></p>}
                        {a.explanation && <p className="mt-1 text-xs text-slate-500">{a.explanation}</p>}
                      </div>;
                    })}
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3"><p className="text-xs font-black uppercase text-indigo-700">Teacher feedback</p><p className="mt-1 whitespace-pre-wrap text-slate-800">{w.feedback || "No written feedback."}</p></div>
                  </div>
                </details>
              ))}</div>}
          </SectionCard>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <SectionCard title="Class announcements">
            {studentSelectedClass.announcements?.length
              ? <div className="space-y-3">{studentSelectedClass.announcements.map((announcement: any) => (
                <article key={announcement.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3"><h3 className="font-bold text-slate-900">{announcement.title}</h3><span className="shrink-0 text-xs text-slate-400">{prettyDate(announcement.created_at)}</span></div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>
                  <p className="mt-3 text-xs font-semibold text-slate-500">Posted by {announcement.author_name}</p>
                </article>
              ))}</div>
              : <Empty title="No class announcements" text="Your teacher’s classroom notices will appear here." />}
          </SectionCard>
          <SectionCard title="Assignments for this class">
            {studentSelectedClass.assignments?.length
              ? <div className="space-y-3">{studentSelectedClass.assignments.map((assignment: any) => (
                <article key={assignment.id} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{assignment.title}</h3><p className="mt-1 text-xs text-slate-500">{assignment.total_marks || 100} marks · Due {assignment.due_date || "date not set"}</p></div><Badge>{assignment.score !== null && assignment.score !== undefined ? "Graded" : assignment.submission_status || "Pending"}</Badge></div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{assignment.description || "No extra instructions."}</p>
                  <Button className="mt-3" onClick={() => { setStudentSelectedAssignment(assignment); setStudentAssignmentText(""); nav("student-assignment"); }}>
                    {assignment.submission_id ? "Open assignment" : "Start assignment"}
                  </Button>
                </article>
              ))}</div>
              : <Empty title="No assignments yet" text="When your teacher shares classwork, it will appear here." />}
          </SectionCard>
        </div>
      </Page>
    );
  };

  const renderStudentAssignments = () => {
    const list = Array.isArray(studentAssignments) ? studentAssignments : [];
    return (
      <Page>
        <Header title="My Assignments" subtitle="Complete and submit your classroom work." />
        {list.length === 0 ? (
          <Empty title="No assignments" text="Assignments will appear when teachers publish them." />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
            {list.map((a: any) => (
              <div key={a.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <Badge>{a.score !== null && a.score !== undefined ? "Graded" : a.submission_status || "Pending"}</Badge>
                </div>
                <h2 className="font-black text-lg mt-5">{a.title}</h2>
                <p className="text-sm text-slate-500 mt-1">{a.class_name}</p>
                <p className="text-sm text-slate-600 mt-3 line-clamp-3">{a.description || "No description."}</p>
                <Button className="w-full mt-5" onClick={() => { setStudentSelectedAssignment(a); setStudentAssignmentText(""); nav("student-assignment"); }}>
                  {a.submission_id ? "View / Resubmit" : "Start Assignment"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Page>
    );
  };

  const renderStudentAssignment = () => {
    if (!studentSelectedAssignment) return <Empty title="No assignment selected" text="Please choose an assignment." />;
    return (
      <Page>
        <button onClick={() => nav("assignments")} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 mb-5"><ArrowLeft className="w-4 h-4" />Back to Assignments</button>
        <Header title={studentSelectedAssignment.title} subtitle={`Total Marks: ${studentSelectedAssignment.total_marks || 100}`} />
        <SectionCard title="Instructions">
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{studentSelectedAssignment.description || "No instructions provided."}</p>
        </SectionCard>

        <SectionCard title="Your Submission" className="mt-6">
          {studentSuccess && <AlertBox tone="success">{studentSuccess}</AlertBox>}
          {studentError && <AlertBox tone="error">{studentError}</AlertBox>}

          <textarea rows={6} value={studentAssignmentText} onChange={(e) => setStudentAssignmentText(e.target.value)} placeholder="Type your answer or solution here..." className="w-full border border-slate-200 rounded-2xl p-4 text-sm text-slate-900 outline-none focus:border-blue-500 mb-4 resize-none" />

          {/* New File Upload UI */}
          <div className="flex items-center gap-4 mb-5 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <input
              type="file"
              className="hidden"
              ref={assignmentFileInputRef}
              accept="image/*,.pdf,.doc,.docx"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setAssignmentFile(e.target.files[0]);
                }
              }}
            />
            <Button variant="ghost" onClick={() => assignmentFileInputRef.current?.click()} disabled={studentLoading}>
              <Paperclip className="w-4 h-4" /> Attach File
            </Button>

            {assignmentFile && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="max-w-[200px] truncate">{assignmentFile.name}</span>
                <button onClick={() => setAssignmentFile(null)} className="text-slate-400 hover:text-rose-600 ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {studentSelectedAssignment.file_name && !assignmentFile && (
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
                <CheckCircle2 className="w-4 h-4" /> Previous file attached
              </div>
            )}
          </div>

          <Button onClick={submitStudentAssignment} disabled={studentLoading}>
            {studentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit Assignment
          </Button>
        </SectionCard>
      </Page>
    );
  };
  const renderStudentQuizzes = () => {
    const list = Array.isArray(studentQuizzes) ? studentQuizzes : [];
    return (
      <Page>
        <Header title="My Quizzes" subtitle="Take self-assessment and assigned quizzes." />
        {list.length === 0 ? (
          <Empty title="No quizzes" text="Assigned quizzes will appear here." />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
            {list.map((q: any) => (
              <div key={q.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center mb-4"><CheckSquare className="w-5 h-5" /></div>
                <h3 className="text-xl font-black text-slate-900">{q.title}</h3>
                <p className="text-sm text-slate-500 mt-1">{q.topic || q.class_name}</p>
                {q.attempt_id
                  ? <><Badge>Submitted</Badge><Button className="w-full mt-4" variant="ghost" disabled>Already submitted</Button></>
                  : <Button className="w-full mt-6" onClick={() => openStudentQuiz(q)}>Start Quiz</Button>}
              </div>
            ))}
          </div>
        )}
      </Page>
    );
  };

  const renderStudentQuiz = () => {
    if (!studentSelectedQuiz) return <Empty title="No quiz selected" text="Please choose a quiz first." />;
    return (
      <Page>
        <button onClick={() => nav("quizzes")} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 mb-5"><ArrowLeft className="w-4 h-4" />Back to Quizzes</button>
        <Header title={studentSelectedQuiz.title} subtitle={`Topic: ${studentSelectedQuiz.topic || "Assessment"}`} />
        <div className="space-y-6">
          {Array.isArray(studentSelectedQuiz.questions) && studentSelectedQuiz.questions.map((q: any, idx: number) => (
            <SectionCard key={idx} title={`Question ${idx + 1}`}>
              <p className="font-bold text-slate-900 text-base mb-4">{q.question || q.text}</p>
              <div className="space-y-2">
                {Array.isArray(q.options) && q.options.map((opt: string, optIdx: number) => (
                  <label key={optIdx} className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm font-bold cursor-pointer transition ${studentQuizAnswers[idx] === opt ? "bg-blue-50 border-blue-600 text-blue-900" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                    <input type="radio" name={`quiz-q-${idx}`} checked={studentQuizAnswers[idx] === opt} onChange={() => {
                      const next = [...studentQuizAnswers];
                      next[idx] = opt;
                      setStudentQuizAnswers(next);
                    }} />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </SectionCard>
          ))}
          <Button onClick={submitStudentQuiz} disabled={studentLoading} className="w-full py-4 text-base">
            {studentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Quiz"}
          </Button>
        </div>
      </Page>
    );
  };

  const renderStudentAttendance = () => {
    const list = Array.isArray(studentAttendance) ? studentAttendance : [];
    const percentage = attendancePercentage;
    return (
      <Page>
        <Header title="My Attendance Records" subtitle={`Monthly report · ${new Date().toLocaleString(undefined, { month: "long", year: "numeric" })} · each present day adds 5% (maximum 100%).`} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">Total Classes Logged</p>
            <p className="text-3xl font-black text-slate-900 mt-2">{list.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">Overall Percentage</p>
            <p className={`text-3xl font-black mt-2 ${percentage >= 75 ? "text-emerald-600" : "text-amber-600"}`}>{percentage}%</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">Required Threshold</p>
            <p className="text-3xl font-black text-blue-600 mt-2">75%</p>
          </div>
        </div>
        <SectionCard title="Attendance History">
          {list.length === 0 ? <Empty title="No attendance records found" text="Your attendance has not been marked yet." /> : (
            <div className="divide-y divide-slate-100">
              {list.map((att: any, i: number) => (
                <div key={i} className="py-4 flex items-center justify-between">
                  <div><p className="font-bold text-slate-900">{att.class_name || "Classroom"}</p><p className="text-xs text-slate-400 mt-0.5">Date: {att.attendance_date}</p></div>
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${att.status === 'present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : att.status === 'late' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                    {att.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </Page>
    );
  };
const renderStudentResults = () => {
    const totalPossible = studentResults.reduce(
      (acc, curr) => acc + Number(curr.total_marks || 100),
      0
    );
    const totalObtained = studentResults.reduce(
      (acc, curr) => acc + Number(curr.marks || 0),
      0
    );
    const overallPercentage = totalPossible
      ? Math.round((totalObtained / totalPossible) * 100)
      : 0;

    return (
      <Page>
        <Header
          title="Results & Performance"
          subtitle="Official academic performance evaluations and published result records."
          action={
            <Button onClick={loadStudentPortal} variant="dark">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          }
        />

        {/* Top Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Total Assessments"
            value={studentResults.length}
            icon={FileText}
          />
          <StatCard
            label="Aggregated Marks"
            value={`${totalObtained} / ${totalPossible}`}
            icon={Target}
          />
          <StatCard
            label="Overall Grade Average"
            value={`${overallPercentage}%`}
            icon={BarChart3}
          />
        </div>

        {/* Professional Academic Result Cards */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">
              Published Academic Evaluations
            </h3>
            <span className="text-xs font-bold text-slate-400">
              Showing {studentResults.length} records
            </span>
          </div>

          {studentResults.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-7 h-7" />
              </div>
              <h4 className="text-lg font-black text-slate-900">No published results available yet</h4>
              <p className="text-slate-500 text-sm mt-1">
                Your examination and assignment evaluations will show up here once graded by instructors.
              </p>
            </div>
          ) : (
            studentResults.map((res: any) => {
              const maxMarks = Number(res.total_marks || 100);
              const scoredMarks = Number(res.marks || 0);
              const percentage = Math.round((scoredMarks / (maxMarks > 0 ? maxMarks : 100)) * 100);

              const computedGrade =
                res.grade ||
                (percentage >= 80 ? "A" : percentage >= 70 ? "B" : percentage >= 60 ? "C" : percentage >= 50 ? "D" : "F");

              return (
                <div
                  key={res.id || `${res.student_id}-${res.assessment_name}`}
                  className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition"
                >
                  {/* Top Banner */}
                  <div className="bg-slate-900 text-white p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          Assignment Evaluation
                        </span>
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                            res.source === "ai"
                              ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          }`}
                        >
                          {res.source === "ai" ? "Evaluated via Balochistan Acadmy" : "Teacher Verified"}
                        </span>
                      </div>

                      <h2 className="text-2xl font-black">{res.assessment_name || "Academic Assessment"}</h2>
                      <p className="text-xs text-slate-400 mt-1">
                        {res.class_name || "Enrolled Class"} • {res.subject || "Computer Science"} • Student ID: #{res.student_id || user?.user_id}
                      </p>
                    </div>

                    {/* Score & Grade Badge */}
                    <div className="flex items-center gap-4 bg-slate-800/90 border border-slate-700 px-5 py-3 rounded-2xl self-start md:self-auto">
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Marks Obtained
                        </p>
                        <p className="text-2xl font-black text-white leading-none mt-1">
                          {scoredMarks}{" "}
                          <span className="text-sm font-bold text-slate-400">
                            / {maxMarks}
                          </span>
                        </p>
                      </div>
                      <div className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xl font-black shadow-sm min-w-[42px] text-center">
                        {computedGrade}
                      </div>
                    </div>
                  </div>

                  {/* Performance Metrics & Feedback */}
                  <div className="p-6 space-y-5">
                    {/* Percentage Progress */}
                    <div>
                      <div className="flex justify-between text-xs font-black uppercase tracking-wider mb-1.5">
                        <span className="text-slate-400">Performance Percentage</span>
                        <span className="text-slate-800 font-bold">{percentage}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            percentage >= 80
                              ? "bg-emerald-500"
                              : percentage >= 60
                              ? "bg-blue-600"
                              : percentage >= 50
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Teacher Feedback Box */}
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                        Teacher Feedback & Observations
                      </p>
                      <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                        {res.feedback ? res.feedback : "Graded successfully. Keep up the good effort!"}
                      </p>
                    </div>

                    {/* Footer Reference Info */}
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-100">
                      <span>
                        Published on:{" "}
                        {res.created_at
                          ? new Date(res.created_at).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "Recently"}
                      </span>
                      {res.submission_id && (
                        <span className="font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          Submission ID: #{res.submission_id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Page>
    );
  };

  const renderStudentAnnouncements = () => {
    const list = Array.isArray(studentAnnouncements) ? studentAnnouncements : [];
    return (
      <Page>
        <Header title="Institutional Announcements" subtitle="Stay updated with notices from your teachers and administration." />
        {list.length === 0 ? <Empty title="No announcements" text="There are no active announcements right now." /> : (
          <div className="space-y-4">
            {list.map((ann: any) => (
              <div key={ann.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-black uppercase">{ann.class_name || "General Notice"}</span>
                  <span className="text-xs text-slate-400 font-bold">{prettyDate(ann.created_at)}</span>
                </div>
                <h3 className="text-xl font-black text-slate-900">{ann.title}</h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-wrap">{ann.body || ann.message}</p>
                <p className="text-xs text-slate-400 mt-4 pt-4 border-t border-slate-100">Posted by: <b>{ann.author_name || "Administration"}</b></p>
              </div>
            ))}
          </div>
        )}
      </Page>
    );
  };

  const renderStudentTimetable = () => {
    const list = Array.isArray(studentTimetable) ? studentTimetable : [];
    return (
      <Page>
        <Header title="My Timetable" subtitle="View your schedule." />
        {list.length === 0 ? <Empty title="No timetable" text="Timetable is not published yet." /> : (
          <div className="space-y-3">
            {list.map((t: any, i: number) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                <div><h3 className="font-black text-slate-900">{t.class_name || t.subject}</h3><p className="text-xs text-slate-500 mt-0.5">{t.day_of_week || t.day || "Schedule"} • {t.start_time} - {t.end_time}</p></div>
                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">{t.room || "Room 101"}</span>
              </div>
            ))}
          </div>
        )}
      </Page>
    );
  };

  const renderUniversityCurriculum = () => {
    const department = universityDepartments.find((item) => item.name === selectedUniversityDepartment);
    const program = department?.programs.find((item) => item.id === selectedUniversityProgram);
    const track = universityOutline?.tracks.find((item) => item.name === selectedUniversityTrack);
    const semester = track?.semesters.find((item) => String(item.semester) === selectedUniversitySemester);
    const multiTrack = (universityOutline?.tracks.length || 0) > 1;
    const step = !selectedUniversityDepartment ? "department"
      : !selectedUniversityProgram ? "program"
      : !universityOutline ? "outline"
      : multiTrack && !selectedUniversityTrack ? "track"
      : !selectedUniversitySemester ? "semester"
      : !selectedUniversityCourse ? "course"
      : "detail";
    const goBack = () => {
      if (selectedUniversityCourse) setSelectedUniversityCourse(null);
      else if (selectedUniversitySemester) setSelectedUniversitySemester("");
      else if (selectedUniversityTrack && multiTrack) setSelectedUniversityTrack("");
      else if (selectedUniversityProgram) void loadUniversityProgramOutline("");
      else setSelectedUniversityDepartment("");
    };
    const crumbs: { label: string; onClick?: () => void }[] = [{ label: "Departments", onClick: () => { void loadUniversityProgramOutline(""); setSelectedUniversityDepartment(""); } }];
    if (selectedUniversityDepartment) crumbs.push({ label: selectedUniversityDepartment, onClick: () => void loadUniversityProgramOutline("") });
    if (program) crumbs.push({ label: program.name, onClick: () => { setSelectedUniversityTrack(multiTrack ? "" : universityOutline?.tracks[0]?.name || ""); setSelectedUniversitySemester(""); setSelectedUniversityCourse(null); } });
    if (track && multiTrack) crumbs.push({ label: track.name, onClick: () => { setSelectedUniversitySemester(""); setSelectedUniversityCourse(null); } });
    if (semester) crumbs.push({ label: semester.name, onClick: () => setSelectedUniversityCourse(null) });
    if (selectedUniversityCourse) crumbs.push({ label: selectedUniversityCourse.title });
    const stepTitle = ({ department: "Choose your department", program: "Choose your program", outline: "Loading program", track: "Choose your major", semester: "Choose your semester", course: "Choose your course", detail: selectedUniversityCourse?.title || "Course" } as Record<string, string>)[step];
    return <Page>
      <div ref={universityTopRef} className="scroll-mt-4" />
      <Header title="LUAWMS University Curriculum" subtitle="Follow your department's official program outline, semester by semester." />
      {step === "department" && <section className="mb-6 rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 p-5 text-white shadow-lg sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">Official scheme of studies</p>
        <h2 className="mt-2 text-2xl font-black">Select your department, program, and semester</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/85">{user?.role === "student" ? "Select your LUAWMS course and ask AI to explain it step by step. Upload your notes or book in the AI chat to make them the primary source." : "Select a LUAWMS course and ask AI to create an easy-to-teach learning module. Upload your syllabus, book, or notes in the AI chat to make them the primary source."}</p>
              </section>}
      {universityCatalogError && <AlertBox tone="error">{universityCatalogError}</AlertBox>}
      {universityCatalogError && <Button variant="secondary" className="mb-4" onClick={() => void loadUniversityCurriculumDepartments()}><RefreshCw className="h-4 w-4" />Reload departments</Button>}
      {universityCatalogLoading && universityDepartments.length === 0 && <InfoStrip>Loading LUAWMS departments...</InfoStrip>}
      {step !== "department" && <nav aria-label="Curriculum path" className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button type="button" onClick={goBack} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-900"><ArrowLeft className="h-4 w-4" />Back</button>
        <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs font-bold text-slate-500">{crumbs.map((crumb, index) => <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
          {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
          {crumb.onClick && index < crumbs.length - 1 ? <button type="button" onClick={crumb.onClick} className="max-w-[12rem] truncate rounded-lg px-2 py-1 text-emerald-800 hover:bg-emerald-50">{crumb.label}</button> : <span className="max-w-[16rem] truncate px-2 py-1 text-slate-900">{crumb.label}</span>}
        </li>)}</ol>
      </nav>}
      {step !== "detail" && step !== "course" && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">{step === "department" ? <Building2 className="h-5 w-5" /> : step === "semester" ? <Layers className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}</span><div><p className="text-xs font-black uppercase tracking-wider text-emerald-800">Step {({ department: 1, program: 2, outline: 2, track: 3, semester: multiTrack ? 4 : 3 } as Record<string, number>)[step]}</p><h2 className="text-xl font-black text-slate-950">{stepTitle}</h2></div></div>
        {step === "department" && <PickerCards items={universityDepartments.map((item) => ({ value: item.name, title: item.name, subtitle: `${item.programs.length} program${item.programs.length === 1 ? "" : "s"}`, icon: Building2 }))} onSelect={(value: string) => { setSelectedUniversityDepartment(value); setSelectedUniversityProgram(""); setUniversityOutline(null); setSelectedUniversityTrack(""); setSelectedUniversitySemester(""); setSelectedUniversityCourse(null); }} />}
        {step === "program" && department && <PickerCards items={department.programs.map((item) => ({ value: item.id, title: item.name, subtitle: "Open scheme of studies", icon: GraduationCap }))} onSelect={(value: string) => void loadUniversityProgramOutline(value)} />}
        {step === "track" && universityOutline && <PickerCards items={universityOutline.tracks.map((item) => ({ value: item.name, title: item.name, subtitle: `${item.semesters.length} semesters`, icon: FolderOpen }))} onSelect={(value: string) => { setSelectedUniversityTrack(value); setSelectedUniversitySemester(""); setSelectedUniversityCourse(null); }} />}
        {step === "semester" && track && <PickerCards items={track.semesters.map((item) => ({ value: String(item.semester), title: item.name, subtitle: `${item.courses.length} courses`, icon: Layers }))} onSelect={(value: string) => { setSelectedUniversitySemester(value); setSelectedUniversityCourse(null); }} />}
        {universityOutlineLoading && <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading the official semester outline...</div>}
        {universityOutlineError && <div className="mt-5"><AlertBox tone="error">{universityOutlineError}</AlertBox><Button variant="secondary" onClick={() => void loadUniversityProgramOutline(selectedUniversityProgram)}><RefreshCw className="h-4 w-4" />Try again</Button></div>}
      </section>}
      {step === "course" && semester && <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">{program?.name}{track && track.name !== "Core" ? ` · ${track.name}` : ""}</p><h2 className="mt-1 text-2xl font-black text-slate-950">{semester.name}</h2><p className="mt-1 text-sm text-slate-500">{semester.courses.length} courses · Choose a course to open its page</p></div></div>
        {!semester.courses.length ? <Empty title="No listed courses for this semester" text="Ask the department to confirm the latest scheme of studies." /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{semester.courses.map((course, index) => <button key={`${course.code}-${index}`} type="button" onClick={() => setSelectedUniversityCourse(course)} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selectedUniversityCourse?.code === course.code ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-emerald-300"}`}><div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-xs font-black text-emerald-900">{String(index + 1).padStart(2, "0")}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{course.credit_hours || "Credit hours n/a"}</span></div><h3 className="mt-3 font-black leading-5 text-slate-900">{course.title}</h3><p className="mt-1 text-xs font-bold text-emerald-800">{course.code || "Course code not listed"}</p><span className="mt-3 inline-block text-xs font-black text-emerald-800">Open course details →</span></button>)}</div>}
      </section>}
      {step === "detail" && selectedUniversityCourse && <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-6 text-white shadow-lg sm:p-8">
        <span className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border border-white/10" />
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">{program?.name}{track && track.name !== "Core" ? ` · ${track.name}` : ""} · {semester?.name}</p>
        <h2 className="mt-2 text-2xl font-black sm:text-3xl">{selectedUniversityCourse.title}</h2>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{selectedUniversityCourse.code || "Code not listed"}</span><span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{selectedUniversityCourse.credit_hours || "Credit hours n/a"} credit hours</span></div>
      </section>}
      {selectedUniversityCourse && <section className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-sky-800">{user?.role === "student" ? "AI study help" : "AI course material"}</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{user?.role === "student" ? "Understand this subject" : "Create material for this subject"}</h3>
            <p className="mt-1 text-sm text-slate-600">{user?.role === "student" ? "AI can explain the main topics in simple words, give examples, and ask practice questions. Upload your notes or book in chat to keep the help aligned with your course." : "AI can prepare student-friendly explanations, a teaching plan, activities, and an assessment. Upload the approved syllabus, notes, or book in chat to keep the material aligned with your course."}</p>
          </div>
          <Button onClick={startUniversityLesson}><Sparkles className="h-4 w-4" />{user?.role === "student" ? "AI se samjhein" : "AI se material banwayein"}</Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-600">{user?.role === "student" ? "AI gives hints first so you can think for yourself. Generated content is not an official LUAWMS syllabus; confirm details with your teacher." : "No file attached: AI creates a general-knowledge draft and labels it for teacher review. With a file attached: AI follows your uploaded material as the primary source. Generated content is not an official LUAWMS syllabus."}</p>
      </section>}
      {selectedUniversityCourse && semester && <section ref={universityCourseDetailRef} className="mt-5 scroll-mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-black uppercase tracking-wider text-emerald-800">Course details</p><h3 className="mt-1 text-lg font-black text-slate-950">{selectedUniversityCourse.title}</h3><p className="mt-1 text-sm text-slate-700">{selectedUniversityCourse.code} · {selectedUniversityCourse.credit_hours || "Credit hours not listed"} · {semester.name} · {program?.name}{track && track.name !== "Core" ? ` · ${track.name}` : ""}</p>{user?.role === "teacher" && <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setToolSubject(`${program?.name || "LUAWMS"} · ${selectedUniversityCourse.title}`); setToolTopic(selectedUniversityCourse.title); setQuizSource("ai"); nav("quizzes"); }}><Sparkles className="h-4 w-4" />Create quiz for this course</Button><Button variant="secondary" onClick={() => { setNewAssignment((current) => ({ ...current, class_id: selectedTeacherClass?.id ? String(selectedTeacherClass.id) : current.class_id, title: `${selectedUniversityCourse.code} ${selectedUniversityCourse.title}`.trim(), description: `LUAWMS ${program?.name}, ${semester.name}. Course: ${selectedUniversityCourse.title} (${selectedUniversityCourse.code}). Add the assignment instructions and submission requirements for your class.` })); setIsCreatingAssignment(true); nav("assignments"); }}><ClipboardList className="h-4 w-4" />Create assignment</Button><Button variant="ghost" onClick={() => { setNewClass({ name: selectedUniversityCourse.title, subject: selectedUniversityCourse.title, grade_level: "University - Undergraduate", section: "", course_code: selectedUniversityCourse.code, description: `LUAWMS ${program?.name}, ${semester.name}. ${selectedUniversityCourse.title} (${selectedUniversityCourse.code}), ${selectedUniversityCourse.credit_hours} credit hours.` }); setIsCreatingClass(true); nav("classes"); }}><Plus className="h-4 w-4" />Create classroom for course</Button></div>}<p className="mt-3 text-xs leading-5 text-slate-500">AI-generated explanations and teaching materials are drafts. Verify them against the latest department-approved syllabus.</p></section>}
      {selectedUniversityCourse && semester && user && <CourseMaterialsPanel courseKey={`${selectedUniversityProgram}|${selectedUniversityTrack}|${selectedUniversitySemester}|${selectedUniversityCourse.code || selectedUniversityCourse.title}`} courseTitle={selectedUniversityCourse.title} userId={Number(user.user_id)} />}
    </Page>;
  };

  const renderBrowseSubjects = () => {
    if (user?.institution_mode === "University") return renderUniversityCurriculum();
    const availableStages = CURRICULUM_STAGES.filter((stage) => pathwayStages.includes(stage.name));
    const stages = (curriculumStage === "All levels"
      ? availableStages
      : availableStages.filter((stage) => stage.name === curriculumStage))
      .map((stage) => ({
        ...stage,
        subjects: stage.subjects.filter((subject) => subject.toLowerCase().includes(curriculumSubjectSearch.trim().toLowerCase())),
      }))
      .filter((stage) => stage.subjects.length > 0);

    return (
      <Page>
        <section className="relative mb-8 overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 px-6 py-8 text-white shadow-xl shadow-emerald-950/10 md:px-10 md:py-11">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-2 -top-10 h-52 w-52 rounded-full border border-white/10" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-100"><GraduationCap className="h-4 w-4" />Learning pathways</span>
            <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">Balochistan Curriculum</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/80 md:text-base">
              {user?.role === "student"
                ? `Explore subjects and textbooks for your ${user.institution_mode || "selected"} education level.`
                : "Explore subjects from primary school through university, then open official textbooks and study at your own pace."}
            </p>
          </div>
        </section>
        <button type="button" onClick={() => { setSelectedSubject(""); void loadCurriculumBooks(""); nav("subject-view"); }} className="group mb-6 flex w-full flex-col gap-4 overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-r from-white via-emerald-50 to-teal-50 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg sm:flex-row sm:items-center sm:justify-between md:p-6">
          <span><span className="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">Official BTBB e-library</span><span className="mt-1 block text-xl font-black text-slate-950 sm:text-2xl">Browse Balochistan textbooks</span><span className="mt-1 block max-w-2xl text-sm leading-6 text-slate-600">Open available official books and explore the textbook catalogue for your study level.</span></span>
          <span className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 text-sm font-bold text-white shadow-md transition group-hover:bg-emerald-900">Browse textbooks <ArrowLeft className="h-4 w-4 rotate-180"/></span>
        </button>
        <div className="mb-7 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <AlertCircle className="mt-1 h-4 w-4 shrink-0 text-amber-700" />
          <p>This guide is a learning overview. Subject availability and course requirements vary by institution; confirm the current syllabus with your school, board, college or university.</p>
        </div>
        {curriculumStage === "All levels" ? (
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-emerald-800">Learning pathways</p><h2 className="mt-1 text-2xl font-black text-slate-950">Choose an education level</h2></div><span className="text-sm font-semibold text-slate-500">{stages.length} levels available</span></div>
            {stages.length === 0 ? <Empty title="No matching subjects" text="Try another subject name or curriculum stage." /> : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{stages.map((stage, index) => {
              const color = ["from-emerald-950 via-emerald-800 to-teal-700", "from-blue-950 via-blue-800 to-indigo-700", "from-violet-950 via-violet-800 to-purple-700", "from-cyan-950 via-cyan-800 to-sky-700", "from-amber-950 via-orange-800 to-rose-700"][index % 5];
              return <button key={stage.name} type="button" onClick={() => { setCurriculumSubjectSearch(""); setCurriculumSubjectSearchInput(""); setCurriculumStage(stage.name); }} className="group relative min-h-64 overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-950/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200">
                <div className={`relative overflow-hidden bg-gradient-to-br ${color} p-5 text-white`}><span className="pointer-events-none absolute -right-5 -top-12 h-40 w-40 rounded-full border border-white/10"/><span className="pointer-events-none absolute -right-1 -top-7 h-28 w-28 rounded-full border border-white/10"/><div className="relative flex items-center justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10"><GraduationCap className="h-6 w-6 text-white"/></span><span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold">{stage.subjects.length} subjects</span></div><h3 className="relative mt-5 text-2xl font-black">{stage.name}</h3><p className="relative mt-1 text-sm font-semibold text-white/80">{stage.grades}</p></div>
                <div className="flex min-h-24 items-center justify-between gap-3 p-5"><p className="line-clamp-2 text-sm leading-6 text-slate-600">{stage.description}</p><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800 transition group-hover:bg-emerald-800 group-hover:text-white"><ArrowLeft className="h-5 w-5 rotate-180"/></span></div>
                <span className="sr-only">Explore subjects in {stage.name}</span>
              </button>;
            })}</div>}
          </section>
        ) : (
          <section>
            <form className="mb-5 flex max-w-2xl gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-emerald-300" onSubmit={(event) => { event.preventDefault(); setCurriculumSubjectSearch(curriculumSubjectSearchInput.trim()); }}>
              <label className="flex min-w-0 flex-1 items-center gap-3 px-2"><Search className="h-5 w-5 shrink-0 text-emerald-700"/><input type="search" value={curriculumSubjectSearchInput} onChange={(event) => setCurriculumSubjectSearchInput(event.target.value)} placeholder="Find a subject" aria-label="Find a subject" className="w-full bg-transparent py-3 text-sm font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"/></label>
              <Button type="submit"><Search className="h-4 w-4"/>Search</Button>
            </form>
            {stages.length === 0 ? <Empty title="No matching subjects" text="Try another subject name or choose another education level." /> : stages.map((stage) => <div key={stage.name}>
              <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-emerald-100 bg-gradient-to-r from-white to-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6"><div><button type="button" onClick={() => { setCurriculumSubjectSearch(""); setCurriculumSubjectSearchInput(""); setCurriculumStage("All levels"); }} className="mb-3 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100"><ArrowLeft className="h-4 w-4"/>All education levels</button><h2 className="text-2xl font-black text-slate-950">{stage.name}</h2><p className="mt-1 text-sm font-semibold text-slate-600">{stage.grades} <span className="mx-1 text-slate-300">·</span> Choose a subject to browse its textbooks.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white"><BookCopy className="h-4 w-4"/>{stage.subjects.length} subjects</span></div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{stage.subjects.map((subject, subjectIndex) => <button key={subject} type="button" onClick={() => {
                const grade = stage.name === "Middle" ? 6 : stage.name === "Secondary" ? 9 : stage.name === "Higher Secondary" ? 11 : stage.name === "University" ? "" : 1;
                setSelectedSubject(subject);
                setSelectedCurriculumGrade(String(grade));
                void loadCurriculumBooks(grade);
                nav("subject-view");
              }} className="group flex min-h-20 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/60 hover:shadow-md"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-sm font-black text-emerald-800 transition group-hover:bg-emerald-800 group-hover:text-white">{String(subjectIndex + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1"><span className="block font-black leading-5 text-slate-900">{subject}</span><span className="mt-1 block text-xs font-medium text-slate-500">Browse books and learning material</span></span><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-400 transition group-hover:bg-emerald-800 group-hover:text-white"><ArrowLeft className="h-4 w-4 rotate-180"/></span></button>)}</div>
            </div>)}
          </section>
        )}
      </Page>
    );
  };

  const renderSubjectView = () => {
    const normalizedSubject = selectedSubject.toLowerCase().replace(/[^a-z0-9]/g, "");
    const availableSubjects = [...new Set(curriculumBooks.map((book) => book.subject))].sort((left, right) => left.localeCompare(right));
    const gradeLabel = selectedCurriculumGrade === ""
      ? user?.role === "student" && user.institution_mode
        ? `${user.institution_mode} level`
        : "All grades"
      : selectedCurriculumGrade === "Primer" || selectedCurriculumGrade === "General"
        ? selectedCurriculumGrade
        : `Grade ${selectedCurriculumGrade}`;
    const matchingBooks = curriculumBooks.filter((book) => {
      const subject = book.subject.toLowerCase().replace(/[^a-z0-9]/g, "");
      return !normalizedSubject || normalizedSubject.includes(subject) || subject.includes(normalizedSubject) ||
        (normalizedSubject.startsWith("math") && /^(math|maths|mathematics)$/.test(subject)) ||
        (normalizedSubject.includes("computerstud") && subject === "computerscience");
    });
    const visibleBooks = matchingBooks;

    return (
      <Page>
        <button onClick={() => nav("browse-subjects")} className="mb-5 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-white hover:text-emerald-900"><ArrowLeft className="h-4 w-4" />Back to subjects</button>
        <div className="mb-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div><span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-800"><BookCopy className="h-4 w-4" />Official textbooks · BTBB</span><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">{selectedSubject || "All official textbooks"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Browse approved titles, open available e-books in this workspace, and ask AI to work from the selected book material.</p></div>
            <div className={`grid w-full gap-3 ${availableBookGrades?.length === 0 ? "sm:max-w-xs" : "sm:max-w-md sm:grid-cols-2"}`}>
              {availableBookGrades?.length !== 0 && (
              <label className="block text-sm font-bold text-slate-700">
                Grade
                <select
                  value={selectedCurriculumGrade}
                  onChange={(event) => void loadCurriculumBooks(event.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                >
                  <option value="">All grades</option>
                  {bookGradeOptions.map((grade) => <option key={grade} value={grade}>{grade === "Primer" || grade === "General" ? grade : `Grade ${grade}`}</option>)}
                </select>
              </label>
              )}
              <label className="block text-sm font-bold text-slate-700">
                Subject
                <select
                  value={selectedSubject}
                  onChange={(event) => setSelectedSubject(event.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                >
                  <option value="">All subjects</option>
                  {availableSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{curriculumBooksLoading ? "Loading catalogue…" : `${visibleBooks.length} ${visibleBooks.length === 1 ? "book" : "books"} · ${gradeLabel}`}</p>
          <p className="text-xs font-semibold text-slate-400">Textbooks open in this workspace</p>
        </div>
        {curriculumBooksLoading ? <div className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading the official BTBB book catalogue...</div> : null}
        {curriculumBooksError ? <div role="alert" className="border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900">{curriculumBooksError}</div> : null}
        {!curriculumBooksLoading && !curriculumBooksError && curriculumBooks.length === 0 ? (
          <Empty
            title={user?.role === "student" && user.institution_mode === "University" ? "No BTBB textbooks for university level" : "No books found"}
            text={user?.role === "student" && user.institution_mode === "University"
              ? "The official BTBB catalogue currently lists school and college textbooks. Your university learning pathway remains available above."
              : "The BTBB catalogue may be temporarily unavailable."}
          />
        ) : null}
        {!curriculumBooksLoading && !curriculumBooksError && curriculumBooks.length > 0 && visibleBooks.length === 0 ? <Empty title={`No ${selectedSubject} books for ${gradeLabel}`} text="Choose another grade or subject to see available textbooks." /> : null}

        {visibleBooks.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visibleBooks.map((book) => (
              <section key={book.id} className="flex flex-col justify-between gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-950/[0.06]">
                <div className="flex min-w-0 items-start gap-4">
                  {book.cover_url ? (
                    <img src={book.cover_url} alt="" loading="lazy" className="h-20 w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-50 object-cover shadow-sm" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800"><BookOpen className="h-5 w-5" /></span>
                  )}
                  <div className="min-w-0">
                    <h2 className="font-bold text-slate-900">{book.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{book.subject}{book.medium && book.medium !== "—" ? ` · ${book.medium} medium` : ""}</p>
                    <p className={`mt-2 text-xs font-bold ${book.ebook_available ? "text-emerald-700" : "text-amber-700"}`}>
                      {book.ebook_available ? "E-book · AI can use this book" : "Print catalogue title · No digital e-book"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  <Button disabled={!book.ebook_available} onClick={() => {
                    void openCurriculumBook(book);
                  }}>
                    <BookOpen className="h-4 w-4" />{book.ebook_available ? "Read textbook" : "Print only"}
                  </Button>
                  <Button variant="ghost" onClick={() => void summarizeCurriculumBook(book)} disabled={summarizingBookId !== null || !book.ebook_available}>
                    {summarizingBookId === book.id ? <><Loader2 className="h-4 w-4 animate-spin" />Reading PDF...</> : <><Sparkles className="h-4 w-4" />Summarize</>}
                  </Button>
                </div>
              </section>
            ))}
          </div>
        )}

        {selectedCurriculumBook && (
          <section ref={curriculumReaderRef} className="mt-9 scroll-mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/[0.06]">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">BALOCHISTAN ACADMY PDF reader</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">{selectedCurriculumBook.title}</h2>
                <p className="mt-1 text-sm text-slate-500">Grade {selectedCurriculumBook.grade} · {selectedCurriculumBook.subject}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`${API_BASE}/api/curriculum/books/${selectedCurriculumBook.id}/pdf?download=true`}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-900"
                >
                  <Download className="h-4 w-4" />Download PDF
                </a>
                {user?.role === "teacher" && (
                  <Button onClick={() => void loadCurriculumChapters(selectedCurriculumBook)} disabled={curriculumOutlineLoading}>
                    {curriculumOutlineLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Reading contents...</> : <><BookOpen className="h-4 w-4" />{curriculumChapters.length ? "Reload chapters" : "Load chapters & topics"}</>}
                  </Button>
                )}
                <button onClick={() => setSelectedCurriculumBook(null)} className="rounded-xl px-3 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-900">Close reader</button>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.8fr)]">
              <div className="relative min-h-[620px] overflow-hidden rounded-2xl bg-slate-800 xl:min-h-[760px]">
                {curriculumPdfLoading && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-900 text-white"><Loader2 className="h-7 w-7 animate-spin text-emerald-300" /><p className="text-sm font-semibold">Preparing the textbook for in-page reading…</p><p className="text-xs text-slate-400">The first open can take a few seconds.</p></div>}
                {!curriculumPdfError && (
                  <iframe
                    key={selectedCurriculumBook.id}
                    title={`${selectedCurriculumBook.title} PDF`}
                    src={`${API_BASE}/api/curriculum/books/${selectedCurriculumBook.id}/pdf`}
                    onLoad={() => setCurriculumPdfLoading(false)}
                    onError={() => {
                      setCurriculumPdfLoading(false);
                      setCurriculumPdfError("The prepared PDF could not be displayed. Please try again.");
                    }}
                    className="h-[620px] w-full border-0 xl:h-[760px]"
                  />
                )}
                {curriculumPdfError && <div role="alert" className="absolute inset-4 z-20 flex flex-col items-start justify-center rounded-2xl border border-rose-200 bg-white p-6 shadow-xl"><p className="font-bold text-rose-900">This textbook could not be loaded.</p><p className="mt-2 text-sm text-slate-600">{curriculumPdfError}</p><Button className="mt-4" onClick={() => void openCurriculumBook(selectedCurriculumBook)}><RefreshCw className="h-4 w-4" />Try again</Button></div>}
              </div>
              <aside className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
                  <h3 className="font-black text-slate-900">Chapters & topics</h3>
                  <p className="mt-1 text-xs text-slate-500">Extracted from the selected textbook</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {curriculumOutlineLoading && <div className="flex items-center gap-2 py-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Reading textbook contents...</div>}
                  {curriculumOutlineError && <div role="alert" className="border-l-4 border-rose-600 bg-rose-50 px-3 py-2 text-sm text-rose-900">{curriculumOutlineError}</div>}
                  {!curriculumOutlineLoading && !curriculumOutlineError && !curriculumOutlineLoaded && user?.role === "teacher" && <p className="py-3 text-sm text-slate-500">Load chapters and topics to choose a section from the textbook for AI.</p>}
                  {!curriculumOutlineLoading && !curriculumOutlineError && curriculumOutlineLoaded && curriculumChapters.length === 0 && user?.role === "teacher" && <p className="py-3 text-sm text-slate-500">No labeled chapters were found in this PDF.</p>}
                  {curriculumChapters.map((chapter, index) => (
                    <div key={`${chapter.title}-${index}`} className="border-b border-slate-100 py-2 last:border-0">
                      <h4 className="px-2 py-1 text-xs font-black uppercase text-slate-500">{chapter.title}</h4>
                      {(chapter.topics.length ? chapter.topics : [chapter.title]).map((topic) => (
                        <button
                          key={`${chapter.title}-${topic}`}
                          onClick={() => setSelectedCurriculumTopic(topic)}
                          className={`mt-1 block w-full px-2 py-2 text-left text-sm font-semibold transition ${selectedCurriculumTopic === topic ? "bg-emerald-50 text-emerald-900" : "text-slate-700 hover:bg-slate-50"}`}
                        >
                          {topic}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                {user?.role === "teacher" && (
                  <div className="space-y-3 border-t border-slate-200 p-3">
                    <label className="block text-xs font-bold text-slate-600">
                      Publish to classroom
                      <select value={curriculumClassId} onChange={(event) => setCurriculumClassId(event.target.value)} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800">
                        <option value="">Select classroom</option>
                        {teacherClasses.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
                      </select>
                    </label>
                    {curriculumActionError && <p role="alert" className="text-sm text-rose-700">{curriculumActionError}</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" onClick={() => launchAIChat(`Use the selected textbook as your source${selectedCurriculumTopic ? ` and focus on the topic "${selectedCurriculumTopic}"` : ""}. Help me prepare learning material for ${selectedCurriculumTopic || selectedCurriculumBook.title}.`, "Textbook Assistant")}>
                        <MessageSquare className="h-4 w-4" />Ask AI
                      </Button>
                      <Button disabled={curriculumActionLoading || !selectedCurriculumTopic} onClick={() => void generateCurriculumQuiz()}>
                        {curriculumActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate quiz
                      </Button>
                    </div>
                    <Button variant="secondary" className="w-full" disabled={curriculumActionLoading || !selectedCurriculumTopic} onClick={() => void draftCurriculumAssignment()}>
                      {curriculumActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}Draft assignment
                    </Button>
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}

        {curriculumSummaryError ? <div role="alert" className="mt-5 border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900">{curriculumSummaryError}</div> : null}
        {curriculumSummary ? <section className="mt-7 border-t-2 border-emerald-800 pt-5"><h2 className="text-lg font-black text-slate-900">Textbook summary</h2><div className="prose prose-slate mt-3 max-w-none text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{curriculumSummary}</ReactMarkdown></div></section> : null}
      </Page>
    );
  };

  const renderDirectoryTable = (type: string) => {
    const query = directorySearchApplied.trim().toLowerCase();
    const rows = staffDirectory.filter((person: any) => [person.full_name, person.email, person.roll_number, person.institution_mode, person.qualification, person.teaching_subject].some((value) => String(value || "").toLowerCase().includes(query)));
    const canManage = type === "students" || type === "teachers";
    return <Page>
      <Header title={`${type === "staff" ? "Staff" : type === "teachers" ? "Teacher" : "Student"} Directory`} subtitle={canManage ? "Update account details, restore access, or deactivate accounts while preserving academic history." : "Search registered staff accounts and view their institution level."} action={<Button variant="ghost" onClick={() => void loadStaffDirectory(type)}><RefreshCw className="h-4 w-4" />Refresh</Button>} />
      {staffError && <AlertBox tone="error">{staffError}</AlertBox>}
      {accountManagementError && <AlertBox tone="error">{accountManagementError}</AlertBox>}
      {accountManagementNotice && <AlertBox tone="success">{accountManagementNotice}</AlertBox>}
      <form className="my-5 max-w-4xl rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm sm:p-4" onSubmit={(event) => { event.preventDefault(); setDirectorySearchApplied(directorySearchDraft); }}>
        <label htmlFor="directory-search" className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Search {type}</label>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative min-w-0"><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="directory-search" type="search" value={directorySearchDraft} onChange={(event) => setDirectorySearchDraft(event.target.value)} placeholder="Name, email, roll number, or education" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" /></div>
          <Button type="submit"><Search className="h-4 w-4" />Search</Button>
          {directorySearchApplied && <Button type="button" variant="ghost" onClick={() => { setDirectorySearchDraft(""); setDirectorySearchApplied(""); }}>Clear</Button>}
        </div>
        {directorySearchApplied && <p className="mt-2 text-xs text-slate-500">Showing matches for “{directorySearchApplied}”</p>}
      </form>
      {!rows.length ? <Empty title={staffDirectory.length ? "No matching accounts" : `No ${type} found`} text={staffDirectory.length ? "Try changing your search." : "Accounts registered in this portal will appear here."} /> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{rows.map((person: any) => <article key={person.id} className="flex flex-col gap-3 border-b border-slate-100 p-4 last:border-0 sm:flex-row sm:items-center sm:gap-4"><div className="min-w-0 flex-1"><h3 className="truncate font-bold text-slate-900">{person.full_name}</h3><p className="truncate text-sm text-slate-500">{person.email}</p>{person.role === "student" && <p className="mt-1 text-xs font-black text-emerald-800">Roll No: {person.roll_number || "Not assigned"}</p>}<p className="mt-1 text-xs text-slate-500">{person.institution_mode || "Level not set"}{person.qualification ? ` · ${person.qualification}` : ""}{person.teaching_subject ? ` · ${person.teaching_subject}` : ""}</p></div><Badge>{person.role}</Badge><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-black ${person.is_active ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{person.is_active ? "Active" : "Disabled"}</span>{canManage && <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => openAccountManager(person)}><Pencil className="h-4 w-4" />Edit</Button><Button variant={person.is_active ? "ghost" : "secondary"} className={person.is_active ? "text-rose-700" : ""} onClick={() => void setManagedAccountActive(person, !person.is_active)}>{person.is_active ? <Trash2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{person.is_active ? "Disable" : "Restore"}</Button></div>}</article>)}</div>}
      {managedAccount && <Modal title={`Manage ${managedAccount.role} account`} onClose={() => { setManagedAccount(null); setAccountManagementError(""); }}>
        <form onSubmit={saveManagedAccount} className="space-y-4">
          <Field label="Full name" value={accountDraft.full_name} onChange={(value: string) => setAccountDraft((draft: any) => ({ ...draft, full_name: value }))} maxLength={120} required />
          <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Sign-in email</span><input readOnly value={managedAccount.email} className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" /></label>
          <SelectField label="Education system" value={accountDraft.institution_mode} onChange={(value: string) => setAccountDraft((draft: any) => ({ ...draft, institution_mode: value }))} options={["School", "College", "University"]} />
          {managedAccount.role === "teacher" && <><Field label="Qualification" value={accountDraft.qualification} onChange={(value: string) => setAccountDraft((draft: any) => ({ ...draft, qualification: value }))} placeholder="e.g. B.Ed, MSc" maxLength={120} /><Field label="Teaching subject" value={accountDraft.teaching_subject} onChange={(value: string) => setAccountDraft((draft: any) => ({ ...draft, teaching_subject: value }))} placeholder="Subject" maxLength={120} /></>}
          {accountManagementError && <AlertBox tone="error">{accountManagementError}</AlertBox>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setManagedAccount(null)}>Cancel</Button><Button type="submit" disabled={accountManagementSaving}>{accountManagementSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save changes</Button></div>
        </form>
      </Modal>}
    </Page>;
  };
  const renderDepartmentsView = () => <Page><Header title="Departments and subjects" subtitle="Academic areas represented by the classrooms." action={<Button variant="ghost" onClick={() => void loadStaffDepartments()}><RefreshCw className="h-4 w-4" />Refresh</Button>} />{staffError && <AlertBox tone="error">{staffError}</AlertBox>}{staffDepartments.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{staffDepartments.map((department: any) => <article key={department.department} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">{department.department}</h2><p className="mt-2 text-sm text-slate-600">{department.class_count} classroom{department.class_count === 1 ? "" : "s"}</p><p className="text-sm text-slate-600">{department.teacher_count} teacher{department.teacher_count === 1 ? "" : "s"}</p></article>)}</div> : <Empty title="No subjects yet" text="Subjects from teacher classrooms will appear here." />}</Page>;
  const renderAllClassesView = () => {
    const query = staffClassSearch.trim().toLowerCase();
    const visibleClasses = staffClasses.filter((classroom) =>
      [classroom.name, classroom.subject, classroom.teacher_name, classroom.institution_mode, classroom.grade_level]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
    return (
      <Page>
        <Header title="Classroom oversight" subtitle="Review active classrooms, their teachers, and enrollment. Invite codes are not shown in staff view." action={<Button variant="ghost" onClick={() => void loadStaffClasses()}><RefreshCw className="h-4 w-4" />Refresh</Button>} />
        {staffError && <div className="mb-4"><AlertBox tone="error">{staffError}</AlertBox></div>}
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <StatCard label="Classrooms" value={staffClasses.length} icon={BookOpen} />
          <StatCard label="Open for joining" value={staffClasses.filter((item) => item.is_active).length} icon={Users} />
          <StatCard label="Enrolled students" value={staffClasses.reduce((total, item) => total + Number(item.student_count || 0), 0)} icon={GraduationCap} />
        </div>
        <div className="mb-5 max-w-xl">
          <Field label="Find a classroom or teacher" value={staffClassSearch} onChange={setStaffClassSearch} placeholder="Search class, subject, teacher, or level" />
        </div>
        {visibleClasses.length === 0
          ? <Empty title={staffClasses.length ? "No matching classrooms" : "No classrooms yet"} text={staffClasses.length ? "Try a different search." : "Classrooms created by teachers will appear here for oversight."} />
          : <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500 md:grid">
              <span>Classroom</span><span>Teacher</span><span>Level</span><span>Enrollment</span>
            </div>
            {visibleClasses.map((classroom) => (
              <article key={classroom.id} className="grid gap-2 border-b border-slate-100 p-5 last:border-0 md:grid-cols-[2fr_1fr_1fr_1fr] md:items-center md:gap-4">
                <div><h2 className="font-bold text-slate-900">{classroom.name}</h2><p className="mt-1 text-sm text-slate-500">{classroom.subject || "General"}{classroom.section ? ` · Section ${classroom.section}` : ""}</p></div>
                <p className="text-sm text-slate-700">{classroom.teacher_name || "Teacher"}</p>
                <p className="text-sm text-slate-700">{classroom.grade_level || classroom.institution_mode || "Not specified"}</p>
                <div className="flex items-center gap-2"><span className="font-bold text-slate-800">{classroom.student_count || 0} students</span><Badge>{classroom.is_active ? "Open" : "Paused"}</Badge></div>
              </article>
            ))}
          </div>}
      </Page>
    );
  };

  const renderStaffAnnouncements = () => (
    <Page>
      <Header title="Institution notices" subtitle="Share official school-wide updates with students and teachers." action={<Button variant="ghost" onClick={() => void loadStaffAnnouncements()}><RefreshCw className="h-4 w-4" />Refresh notices</Button>} />
      <SectionCard title="Publish a notice">
        <div className="space-y-3">
          <Field label="Notice title" value={staffAnnouncementTitle} onChange={setStaffAnnouncementTitle} placeholder="e.g. Campus will close early on Friday" />
          <TextAreaField label="Message for the institution" value={staffAnnouncementBody} onChange={setStaffAnnouncementBody} rows={4} placeholder="Write the important details and who the notice applies to..." />
          {staffAnnouncementError && <AlertBox tone="error">{staffAnnouncementError}</AlertBox>}
          <Button onClick={postStaffAnnouncement} disabled={staffAnnouncementSaving}>
            {staffAnnouncementSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Publish institution-wide
          </Button>
        </div>
      </SectionCard>
      <SectionCard title="Recent notices" className="mt-6">
        {staffAnnouncements.length
          ? <div className="space-y-3">{staffAnnouncements.map((announcement: any) => (
            <article key={announcement.id} className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3"><h2 className="font-bold text-slate-900">{announcement.title}</h2><span className="shrink-0 text-xs text-slate-400">{prettyDate(announcement.created_at)}</span></div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">{announcement.class_name || "Institution-wide"} · {announcement.author_name}</p>
            </article>
          ))}</div>
          : <Empty title="No notices published" text="Published institution-wide notices will appear here and in student announcements." />}
      </SectionCard>
    </Page>
  );

  const renderStaffAttendance = () => {
    const months = Array.from(new Set([localDateKey().slice(0, 7), ...staffAttendance.map((row: any) => String(row.attendance_date || "").slice(0, 7)).filter(Boolean)])).sort().reverse();
    const monthRows = staffAttendance.filter((row: any) => String(row.attendance_date || "").startsWith(staffAttendanceMonth));
    const present = monthRows.filter((row: any) => row.status === "present").length;
    const classCount = new Set(monthRows.map((row: any) => row.class_id)).size;
    return <Page><Header title="Attendance overview" subtitle={`Read-only institution attendance · ${staffAttendanceMonth}`} action={<Button variant="ghost" onClick={() => void loadStaffAttendance()}><RefreshCw className="h-4 w-4" />Refresh</Button>} />{staffError && <AlertBox tone="error">{staffError}</AlertBox>}<label className="mb-4 block max-w-xs text-xs font-black uppercase text-slate-500">Report month<select value={staffAttendanceMonth} onChange={(event) => setStaffAttendanceMonth(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold normal-case text-slate-800">{months.map((month) => <option key={month} value={month}>{month}</option>)}</select></label>
      <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Attendance entries this month" value={monthRows.length} icon={ClipboardList} /><StatCard label="Marked present" value={present} icon={CheckCircle2} /><StatCard label="Active classes in report" value={classCount} icon={BookOpen} /></div>
      {staffAttendance.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="hidden grid-cols-[1fr_1fr_1fr_1fr] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-black uppercase text-slate-500 sm:grid"><span>Student</span><span>Class</span><span>Date</span><span>Status</span></div>{staffAttendance.filter((row: any) => String(row.attendance_date || "").startsWith(staffAttendanceMonth)).map((row: any) => <article key={row.id} className="grid gap-1 border-b border-slate-100 p-4 last:border-0 sm:grid-cols-[1fr_1fr_1fr_1fr] sm:items-center sm:gap-3"><span className="font-semibold text-slate-900">{row.student_name}</span><span className="text-sm text-slate-600">{row.class_name}</span><span className="text-sm text-slate-600">{row.attendance_date}</span><Badge>{row.status}</Badge></article>)}</div> : <Empty title="No attendance recorded" text="Teacher-marked attendance will appear here." />}
      {staffAttendance.length > 0 && monthRows.length === 0 && <Empty title="No entries this month" text="Choose another month to see its attendance records." />}
    </Page>;
  };

  const renderSidebar = () => {
    if (!user) return null;
    return (
      <>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm"><GraduationCap className="w-5 h-5" /></div>
            <div><h1 className="font-black text-lg text-slate-900">BALOCHISTAN ACADMY</h1><p className="text-[10px] uppercase font-black tracking-wider text-slate-400">{user.role} Portal</p></div>
          </div>
          <button className="md:hidden p-2 rounded-lg hover:bg-slate-100" onClick={() => setMobileSidebar(false)}><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 p-3 overflow-y-auto">
          {user.role === "teacher" && <div className="space-y-1">
            <NavButton id="dashboard" label="Dashboard" icon={LayoutGrid} />
            <NavButton id="classes" label="My Classrooms" icon={GraduationCap} />
            <NavButton id="attendance" label="Attendance" icon={Clock} />
            <NavButton id="assignments" label="Assignments" icon={ClipboardList} />
            <NavButton id="tools" label="Teacher Tools" icon={Sparkles} />
            <NavButton id="resources" label="Resources" icon={BookOpen} />
            <NavButton id="browse-subjects" label="Curriculum" icon={BookCopy} />
            <NavButton id="communications" label="Staff Messages" icon={MessageSquare} />
            <NavButton id="meetings" label="Online Classes" icon={Video} />
            <NavButton id="chat" label="AI Assistant" icon={MessageSquare} />
                <NavButton id="quizzes" label="Quizzes" icon={CheckSquare} />
          </div>}
          {user.role === "student" && <div className="space-y-1">
            <NavButton id="dashboard" label="My Dashboard" icon={LayoutGrid} />
            <NavButton id="classes" label="My Classrooms" icon={BookOpen} />
            <NavButton id="assignments" label="My Assignments" icon={ClipboardList} />
            <NavButton id="quizzes" label="My Quizzes" icon={CheckSquare} />
            <NavButton id="attendance" label="My Attendance" icon={Clock} />
            <NavButton id="results" label="My Results" icon={BarChart3} />
            <NavButton id="announcements" label="Announcements" icon={Megaphone} />
            <NavButton id="timetable" label="My Timetable" icon={Calendar} />
            <NavButton id="browse-subjects" label="Curriculum" icon={BookCopy} />
            <NavButton id="communications" label="Contact Staff" icon={MessageSquare} />
            <NavButton id="meetings" label="Online Classes" icon={Video} />
            <NavButton id="chat" label="AI Learning Assistant" icon={Sparkles} />
          </div>}
          {user.role === "staff" && <div className="space-y-1">
            <NavButton id="dashboard" label="Operations Hub" icon={LayoutGrid} />
            <NavButton id="classes" label="Classroom Oversight" icon={GraduationCap} />
            <NavButton id="students" label="Student Directory" icon={Users} />
            <NavButton id="teachers" label="Teacher Directory" icon={GraduationCap} />
            <NavButton id="departments" label="Subjects & Departments" icon={BookCopy} />
            <NavButton id="announcements" label="Institution Notices" icon={Megaphone} />
            <NavButton id="reports" label="Reports" icon={BarChart3} />
            <NavButton id="attendance" label="Attendance" icon={Clock} />
            <NavButton id="communications" label="Messages & Meetings" icon={MessageSquare} />
            <NavButton id="meetings" label="Meetings" icon={Video} />
            <NavButton id="chat" label="AI Assistant" icon={Sparkles} />
          </div>}
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black overflow-hidden shrink-0 border border-slate-200">
              {user.profile_pic ? <AuthenticatedProfileImage userId={Number(user.user_id)} requesterId={Number(user.user_id)} revision={profilePicture} alt={user.full_name} className="w-full h-full object-cover object-top" fallback={user.full_name?.[0]?.toUpperCase() || "U"} /> : user.full_name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { nav("profile"); loadFullProfile(); }}><p className="font-bold text-sm truncate text-slate-900">{user.full_name}</p><p className="text-xs text-slate-400 truncate">{user.email}</p></div>
            <button onClick={logout} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </>
    );
  };

  const renderTeacherDashboard = () => (
    <Page>
      <Header title={`Welcome back, ${user?.full_name || "Teacher"}`} subtitle="Plan lessons, manage classrooms, evaluate students and work with AI." action={<Button onClick={loadTeacherPortal} variant="dark"><RefreshCw className="w-4 h-4" />Refresh</Button>} />
      {teacherPortalError && <AlertBox tone="error">{teacherPortalError}</AlertBox>}
      {teacherPortalLoading && <InfoStrip>Loading Teacher Portal...</InfoStrip>}
      <section className="dashboard-hero mb-6 overflow-hidden rounded-[1.75rem] bg-[#124b39] text-white shadow-lg shadow-emerald-950/10">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
            <span className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Teaching workspace</span>
            <h2 className="max-w-xl text-3xl font-black leading-tight sm:text-4xl">Make room for better learning.</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-emerald-50/85">Bring your classroom together, prepare engaging work, and give every student thoughtful feedback.</p>
          </div>
          <div className="dashboard-hero-image min-h-56 sm:min-h-72 lg:min-h-[340px]">
            <img src={DASHBOARD_IMAGES.teacher} alt="Teacher guiding students during a classroom lesson" loading="lazy" />
          </div>
        </div>
      </section>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[["Students", teacherSummary?.students || teacherStudents.length, Users], ["Classes", teacherSummary?.classes || teacherClasses.length, GraduationCap], ["Assignments", teacherSummary?.assignments || teacherAssignments.length, ClipboardList], ["Pending", teacherSummary?.pending_submissions || 0, FileCheck2]].map(([label, value, Icon]: any) => <StatCard key={label} label={label} value={value} icon={Icon} />)}
      </div>
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <button onClick={() => nav("classes")} className="dashboard-entry-card group min-h-52 sm:min-h-60" style={{ backgroundImage: `url(${DASHBOARD_IMAGES.teacher})` }}>
          <span className="dashboard-entry-icon"><GraduationCap className="h-6 w-6" /></span>
          <span className="mt-auto pr-10"><span className="block text-xs font-black uppercase tracking-[0.16em] text-white/75">Teaching workspace</span><span className="mt-1 block text-2xl font-black">Classrooms</span><span className="mt-1 block text-sm text-white/85">Open classes and manage your students</span></span>
          <span className="dashboard-entry-arrow" aria-hidden="true">→</span>
        </button>
        <button onClick={() => nav("assignments")} className="dashboard-entry-card group min-h-52 sm:min-h-60" style={{ backgroundImage: `url(${DASHBOARD_IMAGES.student})` }}>
          <span className="dashboard-entry-icon"><ClipboardList className="h-6 w-6" /></span>
          <span className="mt-auto pr-10"><span className="block text-xs font-black uppercase tracking-[0.16em] text-white/75">Review and feedback</span><span className="mt-1 block text-2xl font-black">Assignments</span><span className="mt-1 block text-sm text-white/85">Review submissions and publish grades</span></span>
          <span className="dashboard-entry-arrow" aria-hidden="true">→</span>
        </button>
      </section>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
        {[["Lesson Plan", "lesson-plan", BookOpen], ["Generate Quiz", "quiz-generator", CheckSquare], ["Rubric", "rubric-generator", Target], ["AI Assistant", "chat-gpt", Sparkles]].map(([label, id, Icon]: any) => {
          const tool = TEACHER_TOOLS.find((x) => x.id === id)!;
          return <button key={id} onClick={() => openTeacherTool(tool)} className="bg-white border border-slate-200 rounded-2xl p-5 text-left shadow-sm hover:shadow-md hover:border-blue-200 transition"><Icon className="w-6 h-6 text-blue-600 mb-4" /><p className="font-black text-slate-900">{label}</p><p className="text-xs text-slate-400 mt-1">Open tool</p></button>;
        })}
      </div>
      <DashboardConnect />
    </Page>
  );


  const renderTeacherClasses = () => (
    <Page>
      <Header title="My Classrooms" subtitle="Create classes, copy join codes and manage connected students." />
      {teacherPortalError && <AlertBox tone="error">{teacherPortalError}</AlertBox>}
      <button onClick={() => setIsCreatingClass(true)} className="dashboard-entry-card mb-6 min-h-44 sm:min-h-48" style={{ backgroundImage: `url(${DASHBOARD_IMAGES.teacher})` }}>
        <span className="dashboard-entry-icon"><Plus className="h-6 w-6" /></span>
        <span className="mt-auto pr-10"><span className="block text-xs font-black uppercase tracking-[0.16em] text-white/75">Grow your teaching space</span><span className="mt-1 block text-2xl font-black">Create Classroom</span><span className="mt-1 block text-sm text-white/85">Set up a class and invite students to join</span></span>
        <span className="dashboard-entry-arrow" aria-hidden="true">→</span>
      </button>
      {isCreatingClass && <Modal title="Create Classroom" onClose={() => setIsCreatingClass(false)}>
        <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm leading-5 text-emerald-900">{user?.institution_mode === "School" ? "For school classes, choose the grade. Keep the class name and details simple; section is optional." : user?.institution_mode === "College" ? "Choose the college grade level. Add a section if your classes are divided into groups." : "Choose the university level. Course code and section can help students identify the right class."}</p>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Class Name" value={newClass.name} onChange={(v: string) => setNewClass({ ...newClass, name: v })} placeholder={user?.institution_mode === "School" ? "e.g. Grade 5 Science" : user?.institution_mode === "College" ? "e.g. Grade 11 Biology" : "e.g. Web Development"} />
          <SelectField label={user?.institution_mode === "University" ? "Study Level" : "Grade"} value={newClass.grade_level} onChange={(v: string) => setNewClass({ ...newClass, grade_level: v, subject: user?.institution_mode === "University" ? newClass.subject : "" })} options={["|Choose a grade or level", ...classGradeOptions(user?.institution_mode)]} />
          {user?.institution_mode === "University" ? <Field label="Course / Subject" value={newClass.subject} onChange={(v: string) => setNewClass({ ...newClass, subject: v })} placeholder={selectedUniversityCourse?.title || "Select a course from Curriculum"} /> : <SelectField label="Subject" value={newClass.subject} onChange={(v: string) => setNewClass({ ...newClass, subject: v })} options={["", ...curriculumClassSubjects(user?.institution_mode, newClass.grade_level, curriculumBooks)]} />}
          <Field label="Section" value={newClass.section} onChange={(v: string) => setNewClass({ ...newClass, section: v })} placeholder="A" />
          {user?.institution_mode !== "School" && <Field label="Course Code (optional)" value={newClass.course_code} onChange={(v: string) => setNewClass({ ...newClass, course_code: v })} placeholder={user?.institution_mode === "College" ? "e.g. BIO-101" : "e.g. CS-401"} />}
          <Field label="Description (optional)" value={newClass.description} onChange={(v: string) => setNewClass({ ...newClass, description: v })} placeholder="Short class description" />
        </div>
        <div className="flex justify-end gap-3 mt-6"><Button variant="ghost" onClick={() => setIsCreatingClass(false)}>Cancel</Button><Button onClick={createTeacherClass} disabled={teacherPortalLoading}>{teacherPortalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Create</Button></div>
      </Modal>}
      {teacherClasses.length === 0 ? <Empty title="No classrooms created" text="Create a classroom and share its join code with students." /> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{teacherClasses.map((cls) => <div key={cls.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm"><div className="flex items-start justify-between"><div><div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mb-4"><GraduationCap className="w-5 h-5" /></div><h2 className="text-xl font-black text-slate-900">{cls.name}</h2><p className="text-sm text-slate-500 mt-1">{cls.subject || "General Subject"}</p></div><span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-black">{cls.student_count || 0} students</span></div><div className="grid grid-cols-2 gap-3 mt-5 text-sm"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400 font-black">SECTION</p><p className="font-bold mt-1">{cls.section || "—"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400 font-black">COURSE CODE</p><p className="font-bold mt-1">{cls.course_code || "—"}</p></div></div><div className="mt-4 rounded-xl border border-dashed border-blue-200 bg-blue-50 p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] text-blue-500 font-black">CLASS INVITE CODE</p><p className="font-mono font-black text-blue-800 tracking-widest mt-1">{cls.join_code}</p></div><button aria-label={`Copy invite code for ${cls.name}`} onClick={() => { void navigator.clipboard?.writeText(cls.join_code).then(() => alert("Invite code copied.")); }} className="p-2 rounded-lg bg-white text-blue-700"><Copy className="w-4 h-4" /></button></div></div><div className="mt-4 flex gap-2"><Button className="flex-1" onClick={() => void openTeacherClass(cls)}>Manage classroom</Button><Button variant="ghost" onClick={() => void updateJoinAccess(cls)}>{cls.is_active ? "Pause joins" : "Reopen joins"}</Button></div></div>)}</div>}
    </Page>
  );

  const renderTeacherClassDetail = () => {
    if (!selectedTeacherClass) return <Empty title="No classroom selected" text="Choose a classroom first." />;
    const classAnnouncements = selectedTeacherClass.announcements || [];
    return <Page>
      <button onClick={() => nav("classes")} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 mb-5"><ArrowLeft className="w-4 h-4" />Back to classrooms</button>
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-7 text-white shadow-lg"><div className="flex flex-col lg:flex-row lg:justify-between gap-6"><div><div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-black uppercase"><GraduationCap className="w-3 h-3" />Classroom</div><h1 className="text-3xl font-black mt-4">{selectedTeacherClass.name}</h1><p className="text-blue-100 mt-2">{selectedTeacherClass.subject || "General Subject"}</p></div><div className="rounded-2xl bg-white/10 p-5 min-w-[240px]"><p className="text-xs uppercase font-bold text-blue-100">Join Code</p><p className="font-mono text-2xl font-black tracking-[0.2em] mt-2">{selectedTeacherClass.join_code}</p></div></div></div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <span className={`rounded-full px-3 py-1 text-xs font-black ${selectedTeacherClass.is_active ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {selectedTeacherClass.is_active ? "Join code active" : "New students cannot join"}
        </span>
        <Button variant="ghost" onClick={() => updateJoinAccess(selectedTeacherClass)}>
          {selectedTeacherClass.is_active ? "Pause new joins" : "Allow new joins"}
        </Button>
        <span className="text-xs text-slate-500">Pausing joins does not remove students already enrolled.</span>
      </div>
      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <SectionCard title="Class Information"><div className="space-y-3 text-sm">{[["Grade / Semester", selectedTeacherClass.grade_level], ["Section", selectedTeacherClass.section], ["Course Code", selectedTeacherClass.course_code], ["Students", selectedTeacherClass.student_count || teacherClassStudents.length]].map(([k, v]) => <div key={String(k)} className="flex justify-between gap-3 border-b border-slate-100 pb-3"><span className="text-slate-500">{k}</span><b>{v || "—"}</b></div>)}</div>{selectedTeacherClass.description && <p className="text-sm text-slate-600 leading-6 mt-4">{selectedTeacherClass.description}</p>}</SectionCard>
        <SectionCard title="Students & staff contact access" className="lg:col-span-2"><p className="mb-4 text-sm leading-6 text-slate-500">Enable a private staff contact for a student. The student will only see and message the staff member you select; you can revoke access any time.</p><div className="grid md:grid-cols-2 gap-3">{teacherClassStudents.length === 0 ? <Empty title="No connected students" text="Students can join using the classroom code." /> : teacherClassStudents.map((s: any) => { const grant = classStaffGrants.find((g: any) => Number(g.student_id) === Number(s.id) && g.is_active); const staffOptions = communicationContacts.filter((c: any) => c.role === "staff"); const selectedStaff = grantStaffByStudent[String(s.id)] || (grant ? String(grant.staff_id) : ""); return <div key={s.id} className="border border-slate-200 rounded-2xl p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-700">{s.full_name?.[0]?.toUpperCase() || "S"}</div><div className="min-w-0 flex-1"><p className="font-bold truncate">{s.full_name}</p><p className="text-xs text-slate-400 truncate">{s.email}</p><p className="mt-1 text-xs font-black text-emerald-800">Roll No: {s.roll_number || "Not assigned"}</p></div><button aria-label={`Remove ${s.full_name} from class`} onClick={() => removeStudent(selectedTeacherClass.id, s.id)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button></div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><select value={selectedStaff} onChange={(e) => setGrantStaffByStudent((prev) => ({ ...prev, [String(s.id)]: e.target.value }))} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Select staff contact</option>{staffOptions.map((contact: any) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}</select>{grant ? <Button variant="ghost" className="text-rose-700" onClick={() => void updateStaffAccess(s.id, grant.staff_id, false)}>Revoke</Button> : <Button disabled={!selectedStaff} onClick={() => void updateStaffAccess(s.id, Number(selectedStaff), true)}>Allow contact</Button>}</div>{grant && <p className="mt-2 text-xs font-semibold text-emerald-700">Enabled: {grant.staff_name}</p>}</div>; })}</div></SectionCard>
      </div>
      <SectionCard title="Class Assignments" className="mt-6"><div className="space-y-2">{teacherAssignments.filter((x) => Number(x.class_id) === Number(selectedTeacherClass.id)).map((a) => <div key={a.id} className="border border-slate-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"><div><p className="font-bold">{a.title}</p><p className="text-xs text-slate-400 mt-1">{a.submission_count || 0} submissions • {a.total_marks} marks</p></div><Button variant="ghost" onClick={() => loadSubmissions(a)}>View submissions</Button></div>)}{teacherAssignments.filter((x) => Number(x.class_id) === Number(selectedTeacherClass.id)).length === 0 && <p className="text-sm text-slate-500">No assignments for this classroom.</p>}</div></SectionCard>
      {renderClassChat()}
      <SectionCard title="Post a class announcement" className="mt-6">
        <div className="space-y-3">
          <Field label="Announcement title" value={classAnnouncementTitle} onChange={setClassAnnouncementTitle} placeholder="e.g. Bring your science notebook tomorrow" />
          <TextAreaField label="Message for enrolled students" value={classAnnouncementBody} onChange={setClassAnnouncementBody} rows={4} placeholder="Share a clear update with this class..." />
          {classAnnouncementError && <AlertBox tone="error">{classAnnouncementError}</AlertBox>}
          <Button onClick={postClassAnnouncement} disabled={classAnnouncementSaving}>
            {classAnnouncementSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Post to this class
          </Button>
        </div>
      </SectionCard>
      {classAnnouncements.length > 0 && <SectionCard title="Recent class announcements" className="mt-6">
        <div className="space-y-3">{classAnnouncements.map((announcement) => (
          <article key={announcement.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3"><h3 className="font-bold text-slate-900">{announcement.title}</h3><span className="shrink-0 text-xs text-slate-400">{prettyDate(announcement.created_at)}</span></div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{announcement.body}</p>
          </article>
        ))}</div>
      </SectionCard>}
    </Page>;
  };

  const renderMeetings = () => {
    const canSchedule = user?.role === "teacher" || user?.role === "staff";
    const participantOptions = meetingContacts.filter((contact: any) => contact.role === (user?.role === "staff" ? "teacher" : "staff"));
    const participantValues = user?.role === "staff" ? ["", "all", ...participantOptions.map((item: any) => String(item.id))] : ["", ...participantOptions.map((item: any) => String(item.id))];
    const participantLabels = user?.role === "staff" ? ["Choose a teacher", "All teachers", ...participantOptions.map((item: any) => item.full_name)] : ["Choose a participant", ...participantOptions.map((item: any) => item.full_name)];
    return <Page>
      <Header title={user?.role === "student" ? "Online classes" : user?.role === "teacher" ? "Online classes & meetings" : "Meetings"} subtitle={user?.role === "student" ? "Join online classes scheduled for your classrooms." : "Schedule an online class or a staff meeting. Join from this page on mobile or desktop."} action={<Button variant="ghost" onClick={() => void loadMeetings()} disabled={meetingLoading}><RefreshCw className={`h-4 w-4 ${meetingLoading ? "animate-spin" : ""}`} />Refresh</Button>} />
      {meetingError && <AlertBox tone="error">{meetingError}</AlertBox>}
      {activeMeeting ? createPortal(<section className="fixed inset-0 z-[200] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-slate-950 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4"><header className="flex min-h-12 shrink-0 items-center justify-between gap-3 px-2 pb-2 text-white"><div className="min-w-0"><p className="truncate text-sm font-black sm:text-base">{activeMeeting.title}</p><p className="truncate text-xs text-slate-300">{activeMeeting.class_name || "Private staff meeting"}</p></div><Button variant="ghost" className="shrink-0 border-white/20 bg-white/10 px-3 text-white hover:bg-white/20 sm:px-4" onClick={() => setActiveMeeting(null)}><X className="h-4 w-4" /><span className="hidden sm:inline">Leave meeting</span><span className="sm:hidden">Leave</span></Button></header><EmbeddedMeeting meeting={activeMeeting} onLeave={() => setActiveMeeting(null)} /></section>, document.body) : <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        {canSchedule && <SectionCard title="Schedule a meeting">
          <form className="space-y-4" onSubmit={(event) => void createMeeting(event)}>
            <Field label="Meeting title" value={meetingTitle} onChange={setMeetingTitle} placeholder={user?.role === "teacher" ? "e.g. Biology revision class" : "e.g. Weekly academic review"} required maxLength={160} />
            {user?.role === "teacher" && <SelectField label="Meeting type" value={meetingAudience} onChange={(value: string) => setMeetingAudience(value)} options={["class", "staff"]} optionLabels={["Online class for my students", "Private meeting with staff"]} />}
            {user?.role === "teacher" && meetingAudience === "class" ? <SelectField label="Classroom" value={meetingClassId} onChange={setMeetingClassId} options={["", ...teacherClasses.map((item: any) => String(item.id))]} optionLabels={["Choose a classroom", ...teacherClasses.map((item: any) => item.name)]} /> : <SelectField label={user?.role === "staff" ? "Meeting participants" : "Staff member"} value={meetingOtherUserId} onChange={setMeetingOtherUserId} options={participantValues} optionLabels={participantLabels} />}
            <Field label="Date and time" type="datetime-local" value={meetingStartsAt} onChange={setMeetingStartsAt} required />
            <SelectField label="Duration" value={meetingDuration} onChange={setMeetingDuration} options={["30", "45", "60", "90", "120"]} optionLabels={["30 minutes", "45 minutes", "1 hour", "1.5 hours", "2 hours"]} />
            {participantOptions.length === 0 && user?.role === "staff" && <p className="text-xs text-amber-700">No active teachers are available to meet yet.</p>}
            {user?.role === "teacher" && meetingAudience === "staff" && participantOptions.length === 0 && <p className="text-xs text-amber-700">No active staff accounts are available to meet yet.</p>}
            <Button type="submit" disabled={meetingLoading || !meetingTitle.trim() || !meetingStartsAt || (user?.role === "teacher" && meetingAudience === "class" ? !meetingClassId : !meetingOtherUserId) || (user?.role === "staff" && participantOptions.length === 0)} className="w-full"><Calendar className="h-4 w-4" />{meetingLoading ? "Scheduling…" : "Schedule meeting"}</Button>
          </form>
          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">Meeting invitations are limited to the selected classroom members or the selected staff and teacher.</p>
        </SectionCard>}
        <SectionCard title={user?.role === "student" ? "Your class meetings" : "Scheduled meetings"} className="min-w-0">
          {meetingLoading && !meetings.length ? <InfoStrip>Loading meetings…</InfoStrip> : meetings.length ? <div className="space-y-3">{meetings.map((meeting: any) => <article key={meeting.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><Video className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{meeting.title}</h3><Badge>{meeting.status}</Badge><Badge>{meeting.meeting_type === "class" ? "Online class" : "Staff meeting"}</Badge></div><p className="mt-1 text-sm text-slate-600">{meeting.class_name || (meeting.participant_count > 2 ? `All teachers (${meeting.participant_count - 1}) · ${meeting.staff_name || "Staff"}` : `${meeting.teacher_name || "Teacher"} · ${meeting.staff_name || "Staff"}`)}</p><p className="mt-2 text-xs font-semibold text-slate-500">{new Date(meeting.starts_at).toLocaleString()} · {meeting.duration_minutes} minutes</p></div><div className="flex shrink-0 gap-2">{meeting.status === "scheduled" && <Button onClick={() => void joinScheduledMeeting(meeting)} disabled={meetingLoading}><Video className="h-4 w-4" />Join</Button>}{meeting.status === "scheduled" && Number(meeting.created_by) === Number(user?.user_id) && <Button variant="ghost" className="text-rose-700" onClick={() => void cancelScheduledMeeting(meeting)} disabled={meetingLoading}>Cancel</Button>}</div></div></article>)}</div> : <Empty title="No meetings scheduled" text={user?.role === "student" ? "Your teacher’s online class meetings will appear here." : "Schedule your first class or staff meeting using the form."} />}
        </SectionCard>
      </div>}
    </Page>;
  };

  const renderCommunications = () => {
    const startContacts = communicationContacts.filter((contact: any) => contact.id !== user?.user_id);
    return <Page>
      <Header title="Messages & meetings" subtitle={user?.role === "student" ? "Contact only the staff members your teacher has enabled." : "Private conversations for staff, teachers, and approved student support."} action={<Button variant="ghost" onClick={() => void loadCommunications()}><RefreshCw className="h-4 w-4" />Refresh</Button>} />
      {communicationError && <AlertBox tone="error">{communicationError}</AlertBox>}
      <div className="grid min-h-[65vh] gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard title="Your conversations">
            {communicationLoading && !communicationConversations.length ? <InfoStrip>Loading conversations…</InfoStrip> : communicationConversations.length ? <div className="max-h-72 space-y-2 overflow-auto">{communicationConversations.map((conversation: any) => <button key={conversation.id} onClick={() => void openCommunication(conversation)} className={`w-full rounded-xl border p-3 text-left transition ${selectedCommunication?.id === conversation.id ? "border-emerald-400 bg-emerald-50" : "border-slate-100 hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-bold text-slate-800">{conversation.other_name}</span><Badge>{conversation.other_role}</Badge></div><p className="mt-1 truncate text-xs text-slate-500">{conversation.last_message || conversation.class_name || "Start a conversation"}</p></button>)}</div> : <p className="text-sm text-slate-500">No conversations yet. Choose a contact below to start.</p>}
          </SectionCard>
          <SectionCard title={user?.role === "student" ? "Staff enabled for you" : "Start a conversation"}>
            {startContacts.length ? <div className="space-y-2">{startContacts.map((contact: any) => <button key={`${contact.id}-${contact.class_id || "direct"}`} onClick={() => void startCommunication(contact)} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/50"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 font-black text-emerald-800">{contact.full_name?.[0]?.toUpperCase() || "U"}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{contact.full_name}</span><span className="block truncate text-xs text-slate-500">{contact.class_name || contact.role}</span></span><MessageSquare className="h-4 w-4 shrink-0 text-emerald-700" /></button>)}</div> : <Empty title={user?.role === "student" ? "No staff contact enabled" : "No contacts available"} text={user?.role === "student" ? "Ask your teacher to enable a staff contact for your classroom." : "There are no available contacts for this account yet."} />}
          </SectionCard>
        </div>
        <section className="flex min-h-[60vh] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {selectedCommunication ? <>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 px-4 py-3 text-white sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10"><MessageSquare className="h-5 w-5" /></span><div className="min-w-0"><h2 className="truncate font-black">{selectedCommunication.other_name}</h2><p className="truncate text-xs text-emerald-100">{selectedCommunication.class_name || selectedCommunication.other_role} · Private chat</p></div></div><div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs font-bold text-emerald-50"><Languages className="h-4 w-4" /><span className="hidden sm:inline">Translate to</span><select value={classChatLanguage} onChange={(event) => setClassChatLanguage(event.target.value)} aria-label="Choose chat translation language" className="max-w-36 rounded-lg border border-white/20 bg-white/10 px-2.5 py-2 text-xs font-bold text-white outline-none">{CLASS_CHAT_TRANSLATION_LANGUAGES.map((language) => <option key={language} value={language} className="bg-white text-slate-900">{language}</option>)}</select></label>{user?.role !== "student" && <Button variant="secondary" onClick={() => nav("meetings")}><Video className="h-4 w-4" /><span className="hidden sm:inline">Schedule meeting</span><span className="sm:hidden">Meet</span></Button>}</div></header>
            {communicationSelectedIds.length > 0 && <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-emerald-100 bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-5"><span className="mr-auto text-xs font-bold text-slate-600">{communicationSelectedIds.length} selected</span><button onClick={() => void actOnCommunicationMessages("reply")} disabled={communicationSelectedIds.length !== 1} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"><Reply className="h-4 w-4" />Reply</button><button onClick={() => void actOnCommunicationMessages("copy")} disabled={communicationSelectedIds.length !== 1} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"><Copy className="h-4 w-4" />Copy</button>{communicationSelectedIds.length === 1 && communicationMessages.find((m: any) => Number(m.id) === communicationSelectedIds[0] && Number(m.sender_id) === Number(user?.user_id) && m.body && m.kind !== "meeting") && <button onClick={() => void actOnCommunicationMessages("edit")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Pencil className="h-4 w-4" />Edit</button>}<button onClick={() => void actOnCommunicationMessages("delete")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Delete mine</button><button onClick={() => setCommunicationSelectedIds([])} className="rounded-lg px-2 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button></div>}
            <div className="class-chat-messages flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50 to-white p-4 sm:p-6">
              {communicationMessages.length === 0 && <Empty title="Start the conversation" text="Send a message, voice note, image, video, or PDF. New messages refresh automatically." />}
              {communicationMessages.map((message: any) => {
                const mine = Number(message.sender_id) === Number(user?.user_id);
                const selected = communicationSelectedIds.includes(Number(message.id));
                const translationKey = `${message.id}:${classChatLanguage}`;
                const translated = communicationTranslations[translationKey] || (classChatLanguage === "Urdu" ? message.translation_ur : "");
                const lines = String(message.body || "").split("\n");
                const meetingUrl = message.kind === "meeting" ? lines[lines.length - 1] : "";
                return <article key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <button onClick={() => setCommunicationSelectedIds((ids) => ids.includes(Number(message.id)) ? ids.filter((id) => id !== Number(message.id)) : [...ids, Number(message.id)])} aria-label={selected ? "Deselect message" : "Select message"} className={`mr-1 mt-3 h-8 shrink-0 rounded-full px-2 text-[10px] font-bold ${selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-emerald-100"}`}>{selected ? "Selected" : "Select"}</button>
                  <div className={`max-w-[92%] min-w-0 rounded-2xl border p-3 shadow-sm sm:max-w-[78%] sm:p-4 ${selected ? "ring-2 ring-emerald-500" : ""} ${mine ? "rounded-br-md border-emerald-200 bg-emerald-50" : "rounded-bl-md border-slate-200 bg-white"}`}>
                    <div className="mb-2 flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-emerald-100 text-xs font-black text-emerald-900">{message.sender_pic ? <AuthenticatedProfileImage userId={Number(message.sender_id)} requesterId={Number(user?.user_id)} revision={message.sender_pic} alt="" className="h-full w-full object-cover" fallback={(message.sender_name || "?").trim().slice(0, 1).toUpperCase()} /> : (message.sender_name || "?").trim().slice(0, 1).toUpperCase()}</span><span className="min-w-0 truncate text-xs font-black text-slate-800">{message.sender_name}{mine ? " · You" : ""}</span><Badge>{message.sender_role}</Badge><time className="ml-auto shrink-0 text-[10px] text-slate-400">{prettyDate(message.created_at)}</time></div>
                    {message.reply_to_id && <div className="mb-2 rounded-lg border-l-2 border-emerald-500 bg-white/70 px-2.5 py-1.5"><p className="text-[10px] font-bold text-emerald-800">Reply to {message.reply_sender || "message"}</p><p className="line-clamp-2 break-words text-xs text-slate-500">{message.reply_body || "Original message"}</p></div>}
                    {message.kind === "meeting" ? <div className="space-y-2"><p className="font-bold text-slate-800">{lines[0]}</p><a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"><Video className="h-4 w-4" />Join online meeting</a></div> : <>{message.body && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{message.body}</p>}{message.attachment_name && user && <ClassroomAttachmentPreview conversationId={Number(selectedCommunication.id)} message={message} userId={Number(user.user_id)} />}</>}
                    {message.kind !== "meeting" && <div className="mt-3 border-t border-slate-200/80 pt-2"><button onClick={() => void translateCommunicationMessage(message)} disabled={communicationTranslating === translationKey} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50"><Languages className="h-3.5 w-3.5" />{communicationTranslating === translationKey ? "Translating…" : translated ? `Hide ${classChatLanguage}` : `Translate to ${classChatLanguage}`}</button>{translated && <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/80 p-3"><p className="mb-1 text-[10px] font-black uppercase tracking-wide text-indigo-700">{classChatLanguage} translation</p><p dir={CLASS_CHAT_RTL_LANGUAGES.has(classChatLanguage) ? "rtl" : "ltr"} className={`whitespace-pre-wrap text-sm leading-7 text-slate-800 ${CLASS_CHAT_RTL_LANGUAGES.has(classChatLanguage) ? "text-right" : "text-left"}`}>{translated}</p></div>}</div>}
                  </div>
                </article>;
              })}
            </div>
            <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
              {communicationError && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{communicationError}</div>}
              {(communicationReplyTarget || communicationEditingId) && <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">{communicationEditingId ? "Editing your message" : `Replying to ${communicationReplyTarget?.sender_name || "conversation member"}`}</p><p className="truncate text-xs text-slate-600">{communicationEditingId ? "Update the text and save." : communicationReplyTarget?.body || communicationReplyTarget?.attachment_name || "Attachment"}</p></div><button aria-label="Cancel reply or edit" onClick={() => { setCommunicationReplyTarget(null); setCommunicationEditingId(null); setCommunicationDraft(""); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button></div>}
              {communicationAttachment && <ClassChatDraftPreview file={communicationAttachment} onRemove={() => { setCommunicationAttachment(null); if (communicationFileRef.current) communicationFileRef.current.value = ""; }} />}
              <textarea value={communicationDraft} onChange={(event) => setCommunicationDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendCommunicationMessage(); } }} rows={2} maxLength={4000} placeholder={communicationEditingId ? "Edit your message…" : "Write a message or ask a question… (Enter to send)"} className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><input ref={communicationFileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/*,application/pdf" onChange={(event) => setCommunicationAttachment(event.target.files?.[0] || null)} /><Button variant="ghost" disabled={Boolean(communicationEditingId)} onClick={() => communicationFileRef.current?.click()}><Paperclip className="h-4 w-4" />Attach</Button><Button variant={communicationRecording ? "dark" : "ghost"} disabled={Boolean(communicationEditingId)} onClick={() => void startCommunicationRecording()}>{communicationRecording ? <StopCircle className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{communicationRecording ? "Stop voice" : "Record voice"}</Button></div><Button onClick={() => void sendCommunicationMessage()} disabled={communicationSending || (!communicationDraft.trim() && !communicationAttachment)}>{communicationSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{communicationSending ? "Sending…" : communicationEditingId ? "Save edit" : "Send message"}</Button></div>
              <p className="mt-2 text-[10px] leading-4 text-slate-400">Images, voice notes, videos, and PDFs up to 15 MB. Private conversation attachments are visible only to its permitted participants.</p>
            </div>
          </> : <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-800"><MessageSquare className="h-7 w-7" /></span><h2 className="mt-4 text-xl font-black text-slate-900">Private, permission-based messaging</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Choose a conversation or contact. Teachers control which students may contact staff.</p></div>}
        </section>
      </div>
    </Page>;
  };

  const renderTeacherAssignments = () => (
    <Page>
      <Header title="Assignments" subtitle="Create assignments and open student submissions for grading." />
      {teacherPortalError && <AlertBox tone="error">{teacherPortalError}</AlertBox>}
      <button onClick={() => setIsCreatingAssignment(true)} className="dashboard-entry-card mb-6 min-h-44 sm:min-h-48" style={{ backgroundImage: `url(${DASHBOARD_IMAGES.student})` }}>
        <span className="dashboard-entry-icon"><Plus className="h-6 w-6" /></span>
        <span className="mt-auto pr-10"><span className="block text-xs font-black uppercase tracking-[0.16em] text-white/75">Prepare new classwork</span><span className="mt-1 block text-2xl font-black">Create Assignment</span><span className="mt-1 block text-sm text-white/85">Share instructions and due dates with your class</span></span>
        <span className="dashboard-entry-arrow" aria-hidden="true">→</span>
      </button>
      {isCreatingAssignment && <Modal title="Create Assignment" onClose={() => setIsCreatingAssignment(false)}><div className="space-y-4"><SelectField label="Classroom" value={newAssignment.class_id} onChange={(v: string) => { const classroom = teacherClasses.find((item) => String(item.id) === v); setNewAssignment({ ...newAssignment, class_id: v, total_marks: newAssignment.total_marks === "100" && classroom?.institution_mode === "School" ? "10" : newAssignment.total_marks === "100" && classroom?.institution_mode === "College" ? "20" : newAssignment.total_marks }); }} options={["", ...teacherClasses.map((x) => `${x.id}|${x.name}`)]} optionLabels={["Select classroom", ...teacherClasses.map((x) => `${x.name} · ${x.grade_level || x.institution_mode || "Level not set"}`)]} />{newAssignment.class_id && <p className="-mt-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">{teacherClasses.find((item) => String(item.id) === newAssignment.class_id)?.institution_mode === "School" ? "School tip: use short, clear steps and a few familiar examples. Suggested starting score: 10 marks." : teacherClasses.find((item) => String(item.id) === newAssignment.class_id)?.institution_mode === "College" ? "College tip: combine concept understanding with a practical application. Suggested starting score: 20 marks." : "University tip: set a clear scope and ask for independent application or analysis. Suggested starting score: 100 marks."}</p>}<Field label="Title" value={newAssignment.title} onChange={(v: string) => setNewAssignment({ ...newAssignment, title: v })} placeholder="Assignment title" /><TextAreaField label="Description / Instructions" value={newAssignment.description} onChange={(v: string) => setNewAssignment({ ...newAssignment, description: v })} rows={6} placeholder={teacherClasses.find((item) => String(item.id) === newAssignment.class_id)?.institution_mode === "School" ? "Write simple steps students can follow. Example: read the lesson, answer questions 1–5, and show your work." : teacherClasses.find((item) => String(item.id) === newAssignment.class_id)?.institution_mode === "College" ? "State the concept to explain and the practical task or example students should complete." : "Describe the question, expected evidence, analysis, and submission format."} /><div className="grid md:grid-cols-2 gap-4"><Field label="Due Date" type="datetime-local" value={newAssignment.due_date} onChange={(v: string) => setNewAssignment({ ...newAssignment, due_date: v })} /><Field label="Total Marks" type="number" value={newAssignment.total_marks} onChange={(v: string) => setNewAssignment({ ...newAssignment, total_marks: v })} /></div></div><div className="flex justify-end gap-3 mt-6"><Button variant="ghost" onClick={() => setIsCreatingAssignment(false)}>Cancel</Button><Button onClick={createAssignment} disabled={teacherPortalLoading}>Create Assignment</Button></div></Modal>}
      {teacherAssignments.length === 0 ? <Empty title="No assignments yet" text="Create your first assignment." /> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{teacherAssignments.map((a) => <div key={a.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm"><div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><ClipboardList className="w-5 h-5" /></div><div className="flex items-center justify-between mt-4"><h2 className="text-xl font-black">{a.title}</h2><Badge>{a.status || "Published"}</Badge></div><p className="text-sm text-slate-500 mt-1">{a.class_name || "Class"}</p><p className="text-sm text-slate-600 mt-4 line-clamp-3">{a.description || "No description provided."}</p><div className="grid grid-cols-2 gap-3 mt-5"><div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-black text-slate-400">MARKS</p><p className="font-black mt-1">{a.total_marks}</p></div><div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-black text-slate-400">SUBMISSIONS</p><p className="font-black mt-1">{a.submission_count || 0}</p></div></div>{a.status === "draft" && <Button className="w-full mt-5" disabled={teacherPortalLoading} onClick={() => void publishAssignment(a)}>Publish to students</Button>}<Button variant="ghost" className="w-full mt-2" onClick={() => loadSubmissions(a)}>Open submissions</Button></div>)}</div>}
    </Page>
  );

const renderTeacherQuizzes = () => (
    <Page>
      <Header
        title="Classroom Quizzes"
        subtitle="Create curriculum-based or AI-generated quizzes, then monitor student attempts."
      />
      {teacherPortalError && <AlertBox tone="error">{teacherPortalError}</AlertBox>}
      {quizPortalNotice && <div className="mb-4"><AlertBox tone="success">{quizPortalNotice}</AlertBox></div>}
      <section className="mb-7 rounded-3xl border border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50 p-5 shadow-sm sm:p-7">
        <div className="mb-5"><span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-900"><CheckSquare className="h-4 w-4" />Quiz creator</span><h2 className="mt-3 text-2xl font-black text-slate-950">Create a classroom quiz</h2><p className="mt-1 text-sm leading-6 text-slate-600">Choose the classroom, source, and curriculum chapter and topic. Curriculum quizzes use only the selected textbook.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Classroom" value={selectedTeacherClass?.id ? String(selectedTeacherClass.id) : ""} onChange={(value: string) => { const classroom = teacherClasses.find((item) => String(item.id) === value); setSelectedTeacherClass(classroom || null); if (classroom) { void loadClassStudents(classroom.id); setQuizCount(classroom.institution_mode === "School" ? "5" : "10"); setQuizDifficulty(classroom.institution_mode === "School" ? "Easy" : "Medium"); const defaultSource = classroom.institution_mode === "University" ? "ai" : "curriculum"; setQuizSource(defaultSource); if (defaultSource === "curriculum" && curriculumBooks.length === 0) void loadQuizCurriculum(); } }} options={["", ...teacherClasses.map((item) => String(item.id))]} optionLabels={["Select a classroom", ...teacherClasses.map((item) => `${item.name} · ${item.grade_level || item.institution_mode || "Class"}`)]} />
          <SelectField label="Quiz source" value={(selectedTeacherClass?.institution_mode || user?.institution_mode) === "University" ? "ai" : quizSource} onChange={(value: "ai" | "curriculum") => { setQuizSource(value); setTeacherPortalError(""); setQuizPortalNotice(""); if (value === "curriculum" && curriculumBooks.length === 0) void loadQuizCurriculum(); }} options={(selectedTeacherClass?.institution_mode || user?.institution_mode) === "University" ? ["ai"] : ["curriculum", "ai"]} optionLabels={(selectedTeacherClass?.institution_mode || user?.institution_mode) === "University" ? ["AI topic / own ideas"] : ["Official curriculum textbook", "AI topic / own ideas"]} />
          {quizSource === "curriculum" && (selectedTeacherClass?.institution_mode || user?.institution_mode) !== "University" ? <>
            {curriculumBooks.length === 0 ? <div className="md:col-span-2 rounded-xl border border-dashed border-emerald-200 bg-white p-4 text-sm text-slate-600">{quizCurriculumLoading ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading official textbooks...</span> : curriculumBooksError ? <span className="text-rose-700">{curriculumBooksError}</span> : "Select the curriculum source above to load its official textbook catalogue."}</div> : <SelectField label="Textbook" value={quizCurriculumBookId} onChange={(value: string) => void selectQuizCurriculumBook(value)} options={["", ...curriculumBooks.filter((book) => book.ebook_available).map((book) => String(book.id))]} optionLabels={["Select a digital textbook", ...curriculumBooks.filter((book) => book.ebook_available).map((book) => `${book.title} · Grade ${book.grade} · ${book.subject}`)]} />}
            {!!curriculumChapters.length && <SelectField label="Chapter" value={quizCurriculumChapter} onChange={(value: string) => { setQuizCurriculumChapter(value); setQuizCurriculumTopic(""); }} options={["", ...curriculumChapters.map((chapter) => chapter.title)]} optionLabels={["Select a chapter", ...curriculumChapters.map((chapter) => chapter.title)]} />}
            {!!quizCurriculumChapter && <SelectField label="Topic" value={quizCurriculumTopic} onChange={setQuizCurriculumTopic} options={["", ...(curriculumChapters.find((chapter) => chapter.title === quizCurriculumChapter)?.topics.length ? curriculumChapters.find((chapter) => chapter.title === quizCurriculumChapter)!.topics : [quizCurriculumChapter])]} optionLabels={["Select a topic", ...(curriculumChapters.find((chapter) => chapter.title === quizCurriculumChapter)?.topics.length ? curriculumChapters.find((chapter) => chapter.title === quizCurriculumChapter)!.topics : [quizCurriculumChapter])]} />}
            {(quizCurriculumLoading && quizCurriculumBookId || quizCurriculumError) && <div className="md:col-span-2 text-sm text-rose-700">{quizCurriculumLoading ? "Reading the selected book's chapter list..." : quizCurriculumError}</div>}
          </> : <>
            {(selectedTeacherClass?.institution_mode || user?.institution_mode) === "University"
              ? <Field label="Subject / course" value={toolSubject} onChange={setToolSubject} placeholder="e.g. Study Skills (GC-101)" />
              : <SelectField label="Subject" value={toolSubject} onChange={setToolSubject} options={["", ...(toolSubject && !SUBJECTS.includes(toolSubject) ? [toolSubject] : []), ...SUBJECTS]} />}
            <Field label="Topic" value={toolTopic} onChange={setToolTopic} placeholder="e.g. Fractions, photosynthesis, or past tense" />
          </>}
          <Field label="Question count" type="number" value={quizCount} onChange={setQuizCount} />
          <SelectField label="Difficulty" value={quizDifficulty} onChange={setQuizDifficulty} options={["Easy", "Medium", "Hard"]} />
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">For curriculum mode, questions, choices, answers, and explanations are generated only from the selected book. AI topic mode uses general AI knowledge.</p>
        <Button className="mt-5 w-full sm:w-auto" onClick={() => void generateQuizFromPortal()} disabled={teacherPortalLoading || (quizSource === "curriculum" && quizCurriculumLoading)}>{teacherPortalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{teacherPortalLoading ? "Generating Quiz..." : "Generate Quiz"}</Button>
      </section>

      {teacherQuizzes.length === 0 ? (
        <Empty
          title="No quizzes created yet"
          text="Your generated quizzes will appear here, where you can review them and monitor student attempts."
        />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {teacherQuizzes.map((q) => (
            <div key={q.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <CheckSquare className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-black mt-5">{q.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{q.class_name || "Classroom Quiz"}</p>
              <p className="text-sm text-slate-600 mt-3"><b>Topic:</b> {q.topic || "General"}</p>

              <div className="grid grid-cols-2 gap-3 mt-5">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-black text-slate-400">TOTAL MARKS</p>
                  <p className="font-black mt-1">{q.total_marks || 10}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-black text-slate-400">ATTEMPTS</p>
                  <p className="font-black mt-1">{q.attempt_count || 0}</p>
                </div>
              </div>

              {/* Yeh raha wo button jo attempts open karega */}
              <Button
                variant="ghost"
                className="w-full mt-5"
                onClick={() => loadQuizSubmissions(q)}
              >
                View Student Attempts ({q.attempt_count || 0})
              </Button>
            </div>
          ))}
        </div>
      )}
    </Page>
  );

 const renderTeacherQuizSubmissions = () => {
    const totalSubs = quizSubmissions.length;
    const gradedSubs = quizSubmissions.filter((s: any) => s.score !== null && s.score !== undefined).length;
    const pendingSubs = totalSubs - gradedSubs;

    return (
      <Page>
        <button
          onClick={() => nav("quizzes")}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Quizzes
        </button>

        <Header
          title={selectedTeacherQuiz?.title || "Quiz Submissions"}
          subtitle={`Review student attempts, check scores, and publish grades for: ${selectedTeacherQuiz?.topic || "Quiz"}`}
        />

        {teacherPortalError && <AlertBox tone="error">{teacherPortalError}</AlertBox>}

        {/* Stats Summary Cards (Jaise Assignments mein hain) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Submissions</p>
              <p className="text-3xl font-black text-slate-900 mt-1">{totalSubs}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <CheckSquare className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Pending Review</p>
              <p className="text-3xl font-black text-slate-900 mt-1">{pendingSubs}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Graded</p>
              <p className="text-3xl font-black text-slate-900 mt-1">{gradedSubs}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckSquare className="w-6 h-6" />
            </div>
          </div>
        </div>

        {teacherPortalLoading ? (
          <div className="p-12 text-center bg-white border border-slate-200 rounded-3xl">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
            <p className="font-bold text-slate-700 mt-3">Loading submissions...</p>
          </div>
        ) : totalSubs === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-4">
              <CheckSquare className="w-6 h-6" />
            </div>
            <h3 className="font-black text-slate-900 text-lg">No submissions yet</h3>
            <p className="text-sm text-slate-500 mt-1">No students have submitted attempts for this quiz so far.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {quizSubmissions.map((sub: any, idx: number) => {
              const maxMarks = Number(selectedTeacherQuiz?.total_marks || 10);
              const scored = sub.score !== null && sub.score !== undefined ? Number(sub.score) : null;

              return (
                <div key={sub.id || sub.student_id || idx} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-black text-base shrink-0">
                        {sub.student_name?.[0]?.toUpperCase() || "S"}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 text-lg">{sub.student_name || "Student"}</h4>
                        <p className="text-xs text-slate-400">Submitted on: {prettyDate(sub.submitted_at || sub.created_at)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-black text-slate-600">
                        SUBMISSION ID #{sub.id || idx + 1}
                      </span>
                      {scored !== null ? (
                        <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-black">
                          Graded {scored}/{maxMarks}
                        </span>
                      ) : (
                        <span className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-xl text-xs font-black">
                          Pending Review
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                    <div className="bg-slate-50 rounded-2xl p-3">
                      <p className="text-[10px] font-black text-slate-400">STUDENT ID</p>
                      <p className="font-black text-slate-900 mt-1">#{sub.student_id}</p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-3">
                      <p className="text-[10px] font-black text-slate-400">CLASS</p>
                      <p className="font-black text-slate-900 mt-1">{selectedTeacherQuiz?.class_name || "Classroom"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-3">
                      <p className="text-[10px] font-black text-slate-400">TOPIC</p>
                      <p className="font-black text-slate-900 mt-1">{selectedTeacherQuiz?.topic || "General"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-3">
                      <p className="text-[10px] font-black text-slate-400">TOTAL MARKS</p>
                      <p className="font-black text-slate-900 mt-1">{maxMarks}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                    <Button
  variant="ghost"
  onClick={() => {
    setSelectedQuizAttempt(sub);
    setQuizManualScore(sub.score !== null ? String(sub.score) : "");
    setQuizManualFeedback(sub.feedback || "");
    setQuizAIOutput(null);
  }}
>
  <CheckCircle2 className="w-4 h-4" /> View & Grade
</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedQuizAttempt && (
          <Modal title={`Evaluate: ${selectedQuizAttempt.student_name}'s Quiz`} onClose={() => setSelectedQuizAttempt(null)}>
            <div className="max-h-[40vh] overflow-y-auto space-y-4 mb-6 pr-2">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Student Answers vs Correct Answers</h4>
              {selectedTeacherQuiz?.questions?.map((q: any, i: number) => {
                const studentAns = selectedQuizAttempt.answers?.[i] || "No Answer";
                const correctAns = q.answer || "";
                const isCorrect = studentAns.trim().toLowerCase() === correctAns.trim().toLowerCase();

                return (
                  <div key={i} className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                    <p className="font-bold text-sm text-slate-800">Q{i + 1}: {q.question}</p>
                    <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">Student Answer</span>
                        <span className={`font-bold ${isCorrect ? "text-emerald-600" : "text-rose-600"}`}>{studentAns}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">Correct Answer</span>
                        <span className="font-bold text-blue-600">{correctAns}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500">Obtained Marks (Max: {selectedTeacherQuiz?.total_marks || 10})</label>
                <Button variant="ghost" onClick={handleAIQuizCheck} disabled={teacherPortalLoading}>
                  {teacherPortalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-purple-600" />} Auto-Check with AI
                </Button>
              </div>
              <input
                type="number"
                value={quizManualScore}
                onChange={(e) => setQuizManualScore(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 outline-none font-bold"
                placeholder="Enter marks"
              />

              <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Teacher Feedback</label>
              <textarea
                rows={3}
                value={quizManualFeedback}
                onChange={(e) => setQuizManualFeedback(e.target.value)}
                className="w-full p-4 rounded-xl border border-slate-200 focus:border-blue-600 outline-none resize-none text-sm"
                placeholder="Add feedback for the student..."
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setSelectedQuizAttempt(null)}>Cancel</Button>
                <Button onClick={handleGradeQuizAttempt} disabled={isSubmittingQuizGrade}>
                  {isSubmittingQuizGrade ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Publish to Results Card
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </Page>
    );
  };
const handleGradeQuizAttempt = async () => {
    if (!selectedQuizAttempt || !selectedTeacherQuiz) return;
    const maxMarks = Number(selectedTeacherQuiz.total_marks || 10);
    const score = Number(quizManualScore);

    if (isNaN(score) || score < 0 || score > maxMarks) {
      return setTeacherPortalError(`Score must be between 0 and ${maxMarks}.`);
    }

    try {
      setIsSubmittingQuizGrade(true);
      setTeacherPortalError("");

      // 1. Safely extract the attempt ID (handles both id and attempt_id fields)
      const attemptId = Number(selectedQuizAttempt.id || selectedQuizAttempt.attempt_id);

      const payload = {
        teacher_id: Number(user?.user_id),
        score: score,
        feedback: quizManualFeedback || "Graded manually",
        evaluation_source: quizAIOutput ? "ai" : "manual"
      };

      // 2. Use direct fetch to cleanly handle backend validation errors
      const response = await fetch(`${API_BASE}/api/quizzes/attempts/${attemptId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(user?.access_token ? { Authorization: "Bearer " + user.access_token } : {}) },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
         // Safely extract the real error instead of [object Object]
         const errorMsg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
         throw new Error(errorMsg || data.message || "Failed to publish grade");
      }

      alert("Grade published successfully to student's Result Card!");
      setSelectedQuizAttempt(null);
      await loadQuizSubmissions(selectedTeacherQuiz);
    } catch (e: any) {
      alert("Publishing Error: " + e.message);
    } finally {
      setIsSubmittingQuizGrade(false);
    }
  };
const handleAIQuizCheck = async () => {
    if (!selectedQuizAttempt) return;
    try {
      setTeacherPortalLoading(true);

      // 1. Safely extract numbers to prevent backend validation errors
      const attemptId = Number(selectedQuizAttempt.id || selectedQuizAttempt.attempt_id);
      const maxMarks = Number(selectedTeacherQuiz?.total_marks || 10);

      const payload = {
        teacher_id: Number(user?.user_id),
        attempt_id: attemptId,
        max_marks: maxMarks
      };

      // 2. Bypass the global api() function to handle validation errors cleanly
      const response = await fetch(`${API_BASE}/api/teacher/quizzes/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(user?.access_token ? { Authorization: "Bearer " + user.access_token } : {}) },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
         // Safely extract the real error instead of showing [object Object]
         const errorMsg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
         throw new Error(errorMsg || data.message || "Request failed");
      }

      let aiFeedback = data.evaluation?.detailed_feedback || "Checked by AI.";

      // 3. If the AI accidentally returned a nested object, convert it to readable text
      if (typeof aiFeedback === 'object') {
        aiFeedback = JSON.stringify(aiFeedback, null, 2);
      }

      setQuizAIOutput(data.evaluation);
      setQuizManualScore(String(data.evaluation?.suggested_score || 0));
      setQuizManualFeedback(aiFeedback);

    } catch (e: any) {
      alert("AI Check Error: " + e.message);
    } finally {
      setTeacherPortalLoading(false);
    }
  };



  const loadQuizSubmissions = async (quiz: any) => {
    if (!user || user.role !== "teacher") return;
    try {
      setTeacherPortalLoading(true);
      setTeacherPortalError("");
      setSelectedTeacherQuiz(quiz);

      // Backend API call try karein
      const data = await api(`/api/quizzes/${quiz.id}/attempts?teacher_id=${user.user_id}`);
      setQuizSubmissions(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.warn("Quiz attempts endpoint warning:", e);
      // Agar endpoint na mile to kam az kam empty list ke sath view khul jaye taake app ruke nahi
      setQuizSubmissions([]);
    } finally {
      setTeacherPortalLoading(false);
      setActiveTab("teacher-quiz-submissions");
    }
  };
  const markTeacherAttendance = async (student: any, status: "present" | "absent") => {
    if (!user || !selectedTeacherClass) return;
    try {
      await api("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          teacher_id: user.user_id,
          class_id: selectedTeacherClass.id,
          student_id: student.id,
          attendance_date: localDateKey(),
          status,
        }),
      });
      const attendance = await api(`/api/attendance/teacher/${user.user_id}`);
      setTeacherAttendance(Array.isArray(attendance) ? attendance : []);
    } catch (error: any) {
      alert(error?.message || "Attendance could not be saved.");
    }
  };

  const renderTeacherAttendance = () => (
    <Page>
      <Header title="Class Attendance" subtitle="Mark and review student attendance for your classrooms." />
      {teacherClasses.length === 0 ? (
        <Empty title="No classrooms available" text="Create a class first to manage attendance." />
      ) : (
        <div className="space-y-6">
          <SectionCard title="Select Classroom to Mark Attendance">
            <div className="grid md:grid-cols-3 gap-4">
              {teacherClasses.map((cls) => (
                <button
                  key={cls.id}
                  onClick={async () => {
                    setSelectedTeacherClass(cls);
                    await loadClassStudents(cls.id);
                  }}
                  className={`text-left border rounded-2xl p-5 transition ${
                    selectedTeacherClass?.id === cls.id ? "border-blue-600 bg-blue-50/50 shadow-sm" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <h3 className="font-black text-slate-900">{cls.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">{cls.subject || "General"}</p>
                </button>
              ))}
            </div>
          </SectionCard>

          {selectedTeacherClass && (
            <SectionCard title={`Students in ${selectedTeacherClass.name}`}>
              {teacherClassStudents.length === 0 ? (
                <Empty title="No students enrolled" text="Share your join code so students can enroll." />
              ) : (
                <div className="space-y-3">
                  {teacherClassStudents.map((student: any) => (
                    <div key={student.id} className="border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-700">
                          {student.full_name?.[0]?.toUpperCase() || "S"}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{student.full_name}</p>
                          <p className="text-xs text-slate-400">{student.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const today = teacherAttendance.find((row: any) => Number(row.class_id) === Number(selectedTeacherClass.id) && Number(row.student_id) === Number(student.id) && String(row.attendance_date || "").startsWith(localDateKey()))?.status;
                          return <>
                            {today && <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${today === "present" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"}`}>Today: {today}</span>}
                            <Button variant={today === "present" ? "primary" : "ghost"} onClick={() => void markTeacherAttendance(student, "present")}>Present</Button>
                            <Button variant={today === "absent" ? "primary" : "ghost"} onClick={() => void markTeacherAttendance(student, "absent")}>Absent</Button>
                          </>;
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
          {selectedTeacherClass && <SectionCard title={`Monthly attendance report · ${new Date().toLocaleString(undefined, { month: "long", year: "numeric" })}`}>
            <p className="mb-4 text-sm text-slate-500">This report is available to you and each student in their attendance page. Every present day contributes 5%, up to 100%.</p>
            <div className="divide-y divide-slate-100">{teacherClassStudents.map((student: any) => {
              const month = localDateKey().slice(0, 7);
              const records = teacherAttendance.filter((row: any) => Number(row.class_id) === Number(selectedTeacherClass.id) && Number(row.student_id) === Number(student.id) && String(row.attendance_date || "").startsWith(month));
              const presentDays = new Set(records.filter((row: any) => row.status === "present").map((row: any) => row.attendance_date)).size;
              return <div key={student.id} className="flex items-center justify-between py-3"><div><p className="font-bold text-slate-800">{student.full_name}</p><p className="text-xs text-slate-500">{presentDays} present day{presentDays === 1 ? "" : "s"} · {records.length} marked</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-black text-blue-700">{Math.min(100, presentDays * 5)}%</span></div>;
            })}</div>
          </SectionCard>}
        </div>
      )}
    </Page>
  );

  const renderSubmissions = () => {
    const totalSubmissions = submissions.length;
    const gradedSubmissions = submissions.filter((s: any) => s.score !== null && s.score !== undefined).length;
    const pendingSubmissions = totalSubmissions - gradedSubmissions;

    return (
      <Page>
        <button onClick={() => nav("assignments")} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 mb-5"><ArrowLeft className="w-4 h-4" />Back to Assignments</button>
        <Header title={selectedAssignment?.title || "Assignment Submissions"} subtitle="Review student work, view submission IDs, grade submissions, and use AI to evaluate student work." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Total Submissions</p><p className="text-3xl font-black text-slate-900 mt-2">{totalSubmissions}</p></div><div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center"><ClipboardList className="w-5 h-5" /></div></div></div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Pending Review</p><p className="text-3xl font-black text-amber-600 mt-2">{pendingSubmissions}</p></div><div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center"><Clock className="w-5 h-5" /></div></div></div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Graded</p><p className="text-3xl font-black text-green-600 mt-2">{gradedSubmissions}</p></div><div className="w-11 h-11 rounded-xl bg-green-50 text-green-700 flex items-center justify-center"><CheckCircle2 className="w-5 h-5" /></div></div></div>
        </div>
        {teacherPortalError && <div className="mb-5"><AlertBox tone="error">{teacherPortalError}</AlertBox></div>}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          {teacherPortalLoading ? (
            <div className="p-14 text-center"><Loader2 className="w-9 h-9 animate-spin text-blue-600 mx-auto" /><p className="font-black text-slate-900 mt-4">Loading submissions...</p><p className="text-sm text-slate-500 mt-1">Please wait while student submissions are loaded.</p></div>
          ) : submissions.length === 0 ? (
            <div className="p-12"><Empty title="No submissions yet" text="No student has submitted this assignment yet." /></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {submissions.map((s: any) => {
                const isPdf = /\.pdf(?:$|[?#])/i.test(s.file_name || "");
                const aiResult = submissionAIEvaluations[s.id];
                const evaluation = aiResult?.evaluation;
                return (
                <div key={s.id} className="p-6 hover:bg-slate-50 transition">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-black text-lg shrink-0">{s.student_name?.[0]?.toUpperCase() || "S"}</div>
                      <div className="min-w-0"><p className="font-black text-slate-900 text-base">{s.student_name || "Unknown Student"}</p><p className="text-sm text-slate-500 mt-1">{s.student_email || s.email || "No email available"}</p><p className="text-xs text-slate-400 mt-2">Submitted on {prettyDate(s.submitted_at)}</p></div>
                    </div>
                    <div className="w-full xl:w-auto grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Student ID</p><p className="text-sm font-black text-slate-700 mt-1">{s.student_id || "N/A"}</p></div>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Class</p><p className="text-sm font-black text-slate-700 mt-1">{s.class_name || selectedAssignment?.class_name || "N/A"}</p></div>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Subject</p><p className="text-sm font-black text-slate-700 mt-1">{s.subject || "N/A"}</p></div>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Marks</p><p className="text-sm font-black text-slate-700 mt-1">{s.total_marks ?? selectedAssignment?.total_marks ?? 100}</p></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100"><span className="text-[10px] font-black uppercase tracking-wider text-blue-500">Submission ID</span><span className="font-mono font-black text-blue-800">#{s.id}</span><button type="button" title="Copy Submission ID" onClick={async () => { try { await navigator.clipboard.writeText(String(s.id)); setTeacherPortalError(""); } catch { setTeacherPortalError("Unable to copy Submission ID."); } }} className="p-1 rounded-lg hover:bg-blue-100 text-blue-600 transition"><Copy className="w-4 h-4" /></button></div>
                      <span className={`px-3 py-2 rounded-xl text-xs font-black border ${s.score !== null && s.score !== undefined ? "bg-green-50 text-green-700 border-green-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>{s.score !== null && s.score !== undefined ? `Graded ${s.score}/${selectedAssignment?.total_marks || 0}` : "Pending Review"}</span>
                    </div>
                  </div>
                  <div className="mt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-400">Student Submission</p>
                      {s.file_name && <TeacherSubmissionFile submissionId={Number(s.id)} teacherId={Number(user?.user_id)} fileName={s.file_name} isPdf={isPdf} />}
                      {s.file_name && isPdf && <Button className="mt-2" onClick={() => void checkSubmissionDocumentWithAI(s)} disabled={checkingSubmissionId === Number(s.id)}>{checkingSubmissionId === Number(s.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Check this document with AI</Button>}
                    </div>
                    {s.file_name && !isPdf && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="text-sm text-blue-900">Uploaded document is attached and will be read directly during AI review.</p><Button onClick={() => void checkSubmissionDocumentWithAI(s)} disabled={checkingSubmissionId === Number(s.id)}>{checkingSubmissionId === Number(s.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Check this document with AI</Button></div>}
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5">{s.text_content ? <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{s.text_content}</p> : <div className="flex items-center gap-2 text-sm text-slate-400 italic"><FileText className="w-4 h-4" />No written submission content available.</div>}</div>
                  </div>

                  {evaluation && <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-violet-700">AI teacher review {aiResult.document_name ? `· ${aiResult.document_name}` : ""}</p><p className="mt-1 text-sm text-violet-900">Suggested grade: <strong>{evaluation.suggested_score}/{aiResult.total_marks}</strong> · {evaluation.percentage}% · {evaluation.grade}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">AI writing estimate is uncertain</span></div>
                    {evaluation.rubric && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Relevance", evaluation.rubric.relevance], ["Accuracy", evaluation.rubric.accuracy], ["Completeness", evaluation.rubric.completeness_reasoning], ["Clarity", evaluation.rubric.clarity]].map(([label, value]: any) => <div key={label} className="rounded-xl border border-violet-100 bg-white p-3"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 font-black text-slate-800">{value}</p></div>)}</div>}
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-800">{evaluation.detailed_feedback || evaluation.overall_summary}</p>
                    {Array.isArray(evaluation.strengths) && <div className="mt-3"><p className="text-xs font-black uppercase text-emerald-700">Strengths</p><ul className="mt-1 list-disc pl-5 text-sm text-slate-700">{evaluation.strengths.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul></div>}
                    {Array.isArray(evaluation.areas_for_improvement) && <div className="mt-3"><p className="text-xs font-black uppercase text-amber-700">Next steps</p><ul className="mt-1 list-disc pl-5 text-sm text-slate-700">{evaluation.areas_for_improvement.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul></div>}
                    {evaluation.ai_detection_verdict && <p className="mt-3 text-xs text-slate-500">Writing-style observation: {evaluation.ai_detection_verdict}{evaluation.ai_generated_probability !== undefined ? ` (${evaluation.ai_generated_probability}% low-confidence estimate)` : ""} — {evaluation.ai_detection_reasoning}. This is not proof and was not used to deduct marks.</p>}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-violet-200 pt-4"><p className="text-xs text-slate-500">Review the AI suggestion before publishing the result.</p><Button onClick={() => void publishSubmissionAIEvaluation(s)} disabled={teacherPortalLoading || aiResult.published}>{aiResult.published ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}{aiResult.published ? "Published to student" : "Publish grade to student"}</Button></div>
                  </section>}

                  {s.feedback && <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /><p className="text-xs font-black uppercase tracking-wider text-green-700">Existing Feedback</p></div><p className="text-sm leading-6 text-green-800 mt-2 whitespace-pre-wrap">{s.feedback}</p></div>}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 pt-5 border-t border-slate-100"><div className="text-xs text-slate-400">Database Submission ID: <span className="font-mono font-black text-slate-600">#{s.id}</span></div><div className="flex flex-wrap items-center gap-2">{!s.file_name && <Button variant="ghost" onClick={() => void checkSubmissionDocumentWithAI(s)} disabled={checkingSubmissionId === Number(s.id)}>{checkingSubmissionId === Number(s.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Check with AI</Button>}<Button variant="ghost" onClick={() => openGradeModal(s)}><CheckCircle2 className="w-4 h-4" />Grade manually</Button></div></div>
                </div>
              );})}
            </div>
          )}
        </div>
        {gradingSubmission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div><h3 className="text-lg font-black text-slate-900">Manual Assignment Evaluation</h3><p className="text-xs font-bold text-slate-400 mt-1">Student: {gradingSubmission.student_name} (Submission ID: #{gradingSubmission.id})</p></div>
                <button type="button" onClick={() => setgradingSubmission(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-lg font-bold">✕</button>
              </div>
              <div><div className="flex justify-between items-center mb-1"><label className="text-xs font-black uppercase tracking-wider text-slate-500">Obtained Marks</label><span className="text-xs font-bold text-slate-400">Max: {gradingSubmission.total_marks ?? selectedAssignment?.total_marks ?? 100}</span></div><input type="number" min="0" max={gradingSubmission.total_marks ?? selectedAssignment?.total_marks ?? 100} value={manualScore} onChange={(e) => setManualScore(e.target.value)} placeholder={`Enter marks (0 - ${gradingSubmission.total_marks ?? selectedAssignment?.total_marks ?? 100})`} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 font-bold text-slate-900 outline-none text-sm" /></div>
              <div><label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Teacher Feedback</label><textarea rows={4} value={manualFeedback} onChange={(e) => setManualFeedback(e.target.value)} placeholder="Write feedback, corrections, or encouraging notes for the student..." className="w-full p-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-sm leading-6 text-slate-800 outline-none resize-none" /></div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100"><button type="button" onClick={() => setgradingSubmission(null)} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition">Cancel</button><button type="button" disabled={isSubmittingGrade} onClick={handleSaveManualGrade} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black transition disabled:opacity-50 shadow-sm">{isSubmittingGrade && <Loader2 className="w-4 h-4 animate-spin" />}Save & Publish Grade</button></div>
            </div>
          </div>
        )}
      </Page>
    );
  };

  const renderTeacherTools = () => {
    const filtered = TEACHER_TOOLS;
    return <Page><Header title="Teacher Tools" subtitle="Your AI teaching toolkit for planning, assessment and communication." /><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">{filtered.map((tool) => <button key={tool.id} onClick={() => openTeacherTool(tool)} className="bg-white border border-slate-200 rounded-3xl p-6 text-left shadow-sm hover:shadow-md hover:border-blue-200 transition"><div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center"><WandSparkles className="w-6 h-6" /></div><div className="mt-5"><span className="text-[10px] uppercase font-black tracking-wider text-blue-600">{tool.category}</span><h3 className="text-lg font-black mt-2">{tool.title}</h3><p className="text-sm text-slate-500 mt-2 leading-6">{tool.description}</p></div></button>)}</div></Page>;
  };

  const renderTeacherToolForm = () => {

    const tool = selectedTool;
    if (!tool) return <Empty title="No tool selected" text="Choose a teacher tool first." />;
    return <Page><button onClick={() => nav(tool.id === "quiz-generator" ? "quizzes" : "tools")} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 mb-5"><ArrowLeft className="w-4 h-4" />{tool.id === "quiz-generator" ? "Back to quizzes" : "Back to tools"}</button><Header title={tool.title} subtitle={tool.subtitle} /><div className="grid xl:grid-cols-[420px_1fr] gap-6"><SectionCard title="Tool Inputs"><div className="space-y-4"><SelectField label="Classroom" value={selectedTeacherClass?.id ? String(selectedTeacherClass.id) : ""} onChange={(v: string) => { const c = teacherClasses.find((x) => String(x.id) === v); setSelectedTeacherClass(c || null); if (c) loadClassStudents(c.id); }} options={["", ...teacherClasses.map((c) => String(c.id))]} optionLabels={["No specific classroom", ...teacherClasses.map((c) => c.name)]} />    {user?.institution_mode === "University" ? <Field label="Subject / course" value={toolSubject} onChange={setToolSubject} placeholder="e.g. Study Skills (GC-101)" /> : <SelectField label="Subject" value={toolSubject} onChange={setToolSubject} options={["", ...(toolSubject && !SUBJECTS.includes(toolSubject) ? [toolSubject] : []), ...SUBJECTS]} />}
        {(tool.id === "lesson-plan" || (tool.id === "quiz-generator" && quizSource === "ai") || tool.id === "activity-generator" || tool.id === "differentiation" || tool.id === "exit-ticket" || tool.id === "chunk-text" || tool.id === "clear-directions" || tool.id === "real-world") && <><Field label="Topic" value={toolTopic} onChange={setToolTopic} placeholder="Topic / content area" /><TextAreaField label="Learning Objective / Text" value={learningObjective || toolText} onChange={(v: string) => { setLearningObjective(v); setToolText(v); }} rows={5} placeholder="Describe the learning goal or paste the content..." /></>}
        {tool.id === "quiz-generator" && <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <p className="text-sm font-black text-slate-800">Quiz content source</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {user?.institution_mode !== "University" && <button type="button" onClick={() => setQuizSource("curriculum")} className={`rounded-xl border p-3 text-left text-sm font-bold ${quizSource === "curriculum" ? "border-emerald-600 bg-white text-emerald-900 ring-2 ring-emerald-100" : "border-slate-200 bg-white/70 text-slate-600"}`}><BookOpen className="mr-2 inline h-4 w-4" />Official curriculum book</button>}
            <button type="button" onClick={() => setQuizSource("ai")} className={`rounded-xl border p-3 text-left text-sm font-bold ${quizSource === "ai" ? "border-emerald-600 bg-white text-emerald-900 ring-2 ring-emerald-100" : "border-slate-200 bg-white/70 text-slate-600"}`}><Sparkles className="mr-2 inline h-4 w-4" />AI topic / own ideas</button>
          </div>
          <p className="text-xs leading-5 text-slate-600">{quizSource === "curriculum" ? "Questions, answer choices, and explanations will be created from the selected BTBB textbook only. If the requested topic is not in the book, generation will stop." : "AI creates a quiz from your topic using its general knowledge. Review questions and answers before sharing."}</p>
          {quizSource === "curriculum" && <>
            {curriculumBooks.length === 0 && <Button type="button" variant="secondary" onClick={() => void loadQuizCurriculum()} disabled={quizCurriculumLoading}>{quizCurriculumLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookCopy className="h-4 w-4" />}Load official book catalogue</Button>}
            {curriculumBooksError && <AlertBox tone="error">{curriculumBooksError}</AlertBox>}
            {curriculumBooks.length > 0 && <SelectField label="Textbook" value={quizCurriculumBookId} onChange={(value: string) => void selectQuizCurriculumBook(value)} options={["", ...curriculumBooks.filter((book) => book.ebook_available).map((book) => String(book.id))]} optionLabels={["Select a digital textbook", ...curriculumBooks.filter((book) => book.ebook_available).map((book) => `${book.title} · Grade ${book.grade} · ${book.subject}`)]} />}
            {quizCurriculumLoading && quizCurriculumBookId && <p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Reading chapters from the selected book...</p>}
            {!!curriculumChapters.length && <>
              <SelectField label="Chapter" value={quizCurriculumChapter} onChange={(value: string) => { setQuizCurriculumChapter(value); setQuizCurriculumTopic(""); }} options={["", ...curriculumChapters.map((chapter) => chapter.title)]} optionLabels={["Select a chapter", ...curriculumChapters.map((chapter) => chapter.title)]} />
              {!!quizCurriculumChapter && <SelectField label="Topic" value={quizCurriculumTopic} onChange={setQuizCurriculumTopic} options={["", ...(curriculumChapters.find((chapter) => chapter.title === quizCurriculumChapter)?.topics.length ? curriculumChapters.find((chapter) => chapter.title === quizCurriculumChapter)!.topics : [quizCurriculumChapter])]} optionLabels={["Select a topic", ...(curriculumChapters.find((chapter) => chapter.title === quizCurriculumChapter)?.topics.length ? curriculumChapters.find((chapter) => chapter.title === quizCurriculumChapter)!.topics : [quizCurriculumChapter])]} />}
            </>}
            {quizCurriculumError && <AlertBox tone="error">{quizCurriculumError}</AlertBox>}
          </>}
        </div>}
        {tool.id === "lesson-plan" && <div className="grid grid-cols-2 gap-3"><Field label="Minutes" type="number" value={lessonDuration} onChange={setLessonDuration} /><SelectField label="Format" value={lessonFormat} onChange={setLessonFormat} options={["5-Part", "Direct Instruction", "Inquiry-Based", "Project-Based"]} /></div>}
        {(tool.id === "lesson-plan" || tool.id === "quiz-generator") && <SelectField label="Difficulty / Detail" value={tool.id === "lesson-plan" ? lessonDetail : quizDifficulty} onChange={tool.id === "lesson-plan" ? setLessonDetail : setQuizDifficulty} options={tool.id === "lesson-plan" ? ["Standard", "High Detail", "Very Detailed"] : ["Easy", "Medium", "Hard"]} />}
        {tool.id === "quiz-generator" && <Field label="Question Count" type="number" value={quizCount} onChange={setQuizCount} />}
        {tool.id === "rubric-generator" && <><Field label="Rubric Title" value={rubricTitle} onChange={setRubricTitle} placeholder="Research Project Rubric" /><TextAreaField label="Criteria" value={rubricCriteria} onChange={setRubricCriteria} rows={7} placeholder="Accuracy, presentation, reasoning..." /></>}
        {tool.id === "activity-generator" && <SelectField label="Activity Type" value={activityType} onChange={setActivityType} options={["Interactive Activity", "Group Activity", "Discussion", "Project", "Game"]} />}
        {(tool.id === "activity-generator" || tool.id === "differentiation" || tool.id === "group-generator") && <SelectField label="Student Level" value={studentLevel} onChange={setStudentLevel} options={["Beginner", "Intermediate", "Advanced", "Mixed Ability"]} />}
        {tool.id === "group-generator" && <><SelectField label="Strategy" value={groupStrategy} onChange={setGroupStrategy} options={["Balanced Groups", "Random", "Performance Mix"]} /><Field label="Number of Groups" type="number" value={groupCount} onChange={setGroupCount} /></>}
        {tool.id === "exit-ticket" && <Field label="Question Count" type="number" value={exitCount} onChange={setExitCount} />}
        {tool.id === "parent-message" && <><SelectField label="Student" value={parentStudentName} onChange={setParentStudentName} options={["", ...teacherClassStudents.map((s: any) => s.full_name)]} /><SelectField label="Message Type" value={messageType} onChange={setMessageType} options={["General Update", "Progress Concern", "Positive Feedback", "Attendance", "Assignment"]} /><TextAreaField label="Context" value={parentContext} onChange={setParentContext} rows={6} /></>}
        {tool.id === "assignment-checker" && <div className="grid grid-cols-2 gap-3"><Field label="Submission ID" value={submissionId} onChange={setSubmissionId} type="number" /><Field label="Max Marks" value={maxMarks} onChange={setMaxMarks} type="number" /></div>}
        {(tool.id === "blooket-gen" || tool.id === "chunk-text" || tool.id === "clear-directions" || tool.id === "real-world") && <TextAreaField label="Content / Instruction" value={toolText} onChange={setToolText} rows={8} placeholder="Paste content or describe what you need..." />}
        <Button onClick={runTeacherTool} disabled={teacherPortalLoading} className="w-full">{teacherPortalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{tool.id === "quiz-generator" ? "Generate Quiz" : "Generate"}</Button>
      </div>
</SectionCard>
          <SectionCard title="AI Output">
            {teacherPortalError && <AlertBox tone="error">{teacherPortalError}</AlertBox>}
            {teacherOutput ? (
              <div className="space-y-4">
                {selectedTool?.id === "assignment-checker" && teacherOutput?.evaluation && (
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        AI Recommended Score
                      </span>
                      <p className="text-2xl font-black text-slate-900 mt-1">
                        {teacherOutput.evaluation.suggested_score}{" "}
                        <span className="text-sm font-bold text-slate-400">
                          / {teacherOutput.total_marks || maxMarks || 100}
                        </span>
                      </p>
                    </div>
                    <Button
                      onClick={async () => {
                        try {
                          setTeacherPortalLoading(true);
                          setTeacherPortalError("");

                          const payload = {
                            teacher_id: Number(user?.user_id || 2),
                            score: Number(teacherOutput.evaluation.suggested_score),
                            feedback:
                              teacherOutput.evaluation.detailed_feedback ||
                              teacherOutput.evaluation.overall_summary ||
                              "",
                            evaluation_source: "ai",
                          };

                          const response = await fetch(
                            `${API_BASE}/api/assignments/submissions/${teacherOutput.submission_id}/grade`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json", ...(user?.access_token ? { Authorization: "Bearer " + user.access_token } : {}) },
                              body: JSON.stringify(payload),
                            }
                          );

                          const data = await response.json();
                          if (!response.ok) {
                            throw new Error(data.detail || "Failed to publish AI grade.");
                          }

                          alert("AI Evaluation published successfully! The student can now view this result.");
                          await loadTeacherPortal();
                        } catch (err: any) {
                          setTeacherPortalError(err.message || "Unable to publish AI grade.");
                        } finally {
                          setTeacherPortalLoading(false);
                        }
                      }}
                      disabled={teacherPortalLoading}
                    >
                      <CheckCircle2 className="w-4 h-4" /> Publish to Student
                    </Button>
                  </div>
                )}
                <OutputBlock data={teacherOutput} />
              </div>
            ) : (
              <Empty title="No output yet" text="Complete the inputs and click Generate." />
            )}
          </SectionCard>
        </div>
      </Page>

  };

  const saveTeacherResource = async () => {
    if (!user || !resourceTitle.trim() || (!resourceContent.trim() && !resourceFile)) {
      setResourceError("Add a title and either resource content or a file before saving.");
      return;
    }
    setResourceSaving(true);
    setResourceError("");
    setResourceNotice("");
    const shouldOpenUploadedFile = Boolean(resourceFile);
    try {
      let createdResource: any = null;
      if (resourceFile) {
        const form = new FormData();
        form.append("teacher_id", String(user.user_id));
        form.append("resource_type", resourceType);
        form.append("title", resourceTitle.trim());
        form.append("content", resourceContent.trim());
        if (resourceClassId) form.append("class_id", resourceClassId);
        form.append("file", resourceFile);
        createdResource = await api("/api/teacher/resources/upload", { method: "POST", body: form });
      } else {
        createdResource = await api("/api/teacher/resources/save", {
          method: "POST",
          body: JSON.stringify({
            teacher_id: user.user_id,
            resource_type: resourceType,
            title: resourceTitle.trim(),
            content: resourceContent.trim(),
            class_id: resourceClassId ? Number(resourceClassId) : null,
          }),
        });
      }
      const saved = await api(`/api/teacher/resources/${user.user_id}`);
      setTeacherResources(Array.isArray(saved) ? saved : []);
      if (shouldOpenUploadedFile && createdResource?.attachment_url) {
        void openTeacherResourceFile(createdResource);
      }
      setResourceTitle("");
      setResourceContent("");
      setResourceFile(null);
      setResourceClassId("");
      setResourceFormOpen(false);
      setResourceNotice("Resource saved to your teaching library.");
    } catch (error: any) {
      setResourceError(error?.message || "Could not save this resource.");
    } finally {
      setResourceSaving(false);
    }
  };

  const deleteTeacherResource = async (resource: any) => {
    if (!user || !window.confirm(`Delete “${resource.title}” from your resources?`)) return;
    setResourceError("");
    try {
      await api(`/api/teacher/resources/${resource.id}?teacher_id=${user.user_id}`, { method: "DELETE" });
      setTeacherResources((current) => current.filter((item) => item.id !== resource.id));
      setResourceNotice("Resource deleted.");
    } catch (error: any) {
      setResourceError(error?.message || "Could not delete this resource.");
    }
  };

  const openTeacherResourceFile = async (resource: any) => {
    if (!user || !resource.attachment_url) return;
    setResourceError("");
    try {
      const accessToken = JSON.parse(localStorage.getItem("khanmigo_user") || "{}").access_token || "";
      const response = await fetch(`${API_BASE}${resource.attachment_url}?teacher_id=${user.user_id}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail || "Could not open the resource file.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      setResourcePreview({ resource, url: objectUrl });
    } catch (error: any) {
      setResourceError(error?.message || "Could not open the resource file.");
    }
  };

  const renderTeacherResources = () => {
    const visibleResources = teacherResources.filter((resource) =>
      `${resource.title} ${resource.resource_type} ${resource.content} ${resource.attachment_name || ""}`.toLowerCase().includes(resourceSearch.trim().toLowerCase()),
    );
    const associatedClass = (resource: any) => teacherClasses.find((item) => Number(item.id) === Number(resource.class_id))?.name;
    return (
      <Page>
        <Header
          title="Teaching Resources"
          subtitle="Create, organize, and reuse your lesson notes, worksheets, and classroom materials."
          action={<Button onClick={() => { setResourceFormOpen((open) => !open); setResourceError(""); }}><Plus className="h-4 w-4" />Add resource</Button>}
        />
        {resourceNotice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{resourceNotice}</div>}
        {resourceError && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{resourceError}</div>}
        {resourcePreview && <ResourceDocumentViewer resource={resourcePreview.resource} src={resourcePreview.url} onClose={() => setResourcePreview(null)} />}
        {resourceFormOpen && (
          <SectionCard title="Add teaching resource" className="mb-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">Title<input value={resourceTitle} onChange={(event) => setResourceTitle(event.target.value)} maxLength={160} placeholder="e.g. Fractions revision notes" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-medium outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" /></label>
              <label className="text-sm font-bold text-slate-700">Resource type<select value={resourceType} onChange={(event) => setResourceType(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100">{["Lesson notes", "Lesson plan", "Worksheet", "Reading material", "Study guide", "Other"].map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="text-sm font-bold text-slate-700 md:col-span-2">Class (optional)<select value={resourceClassId} onChange={(event) => setResourceClassId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"><option value="">Save to my library</option>{teacherClasses.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select></label>
              <label className="text-sm font-bold text-slate-700 md:col-span-2">Content (optional when you upload a file)<textarea value={resourceContent} onChange={(event) => setResourceContent(event.target.value)} rows={6} maxLength={30000} placeholder="Write notes or add a description for the uploaded file…" className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 font-medium leading-6 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" /><span className="mt-1 block text-right text-xs font-medium text-slate-400">{resourceContent.length}/30,000</span></label>
              <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700">Attach a file <span className="font-medium text-slate-400">(PDF, Office document, text, or image · max 20 MB)</span><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp" onChange={(event) => { const file = event.target.files?.[0] || null; if (file && file.size > 20 * 1024 * 1024) { setResourceError("Choose a file smaller than 20 MB."); event.target.value = ""; setResourceFile(null); return; } setResourceError(""); setResourceFile(file); }} className="mt-2 block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-600 file:mr-4 file:cursor-pointer file:border-0 file:bg-emerald-800 file:px-4 file:py-3 file:font-bold file:text-white hover:file:bg-emerald-900" /></label>{resourceFile && <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><span className="truncate font-semibold">{resourceFile.name} · {(resourceFile.size / (1024 * 1024)).toFixed(1)} MB</span><button type="button" onClick={() => setResourceFile(null)} className="shrink-0 rounded-lg p-1 hover:bg-emerald-100" aria-label="Remove selected file"><X className="h-4 w-4" /></button></div>}</div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setResourceFormOpen(false)} disabled={resourceSaving}>Cancel</Button><Button onClick={() => void saveTeacherResource()} disabled={resourceSaving}>{resourceSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save resource</Button></div>
          </SectionCard>
        )}
        <form className="mb-5 flex max-w-2xl gap-2" onSubmit={(event) => { event.preventDefault(); setResourceSearch(resourceSearchInput.trim()); }}><label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-100"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input type="search" value={resourceSearchInput} onChange={(event) => setResourceSearchInput(event.target.value)} placeholder="Search title, type, file, or content" className="w-full bg-transparent py-3 text-sm outline-none" /></label><Button type="submit"><Search className="h-4 w-4" />Search</Button></form>
        {visibleResources.length === 0 ? <Empty title={resourceSearch ? "No matching resources" : "Your teaching library is empty"} text={resourceSearch ? "Try a different title, type, or keyword." : "Add notes, lesson plans, worksheets, or study guides to keep your teaching material in one place."} /> : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visibleResources.map((resource: any) => (
            <article key={resource.id} className="group relative flex min-h-72 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-950/10">
              <div className="relative flex min-h-28 items-start justify-between overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 p-5 text-white">
                <span className="pointer-events-none absolute -right-7 -top-12 h-40 w-40 rounded-full border border-white/10" /><span className="pointer-events-none absolute -right-1 -top-7 h-28 w-28 rounded-full border border-white/10" />
                <div className="relative flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-inner"><FileText className="h-6 w-6 text-emerald-100" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100">Teaching library</p><p className="mt-1 text-sm font-bold">{resource.resource_type}</p></div></div>
                <button type="button" onClick={() => void deleteTeacherResource(resource)} aria-label={`Delete ${resource.title}`} title="Delete resource" className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/10 text-white/80 transition hover:bg-rose-500 hover:text-white"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="line-clamp-2 text-lg font-black leading-snug text-slate-950">{resource.title}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2"><Badge>{resource.resource_type}</Badge>{associatedClass(resource) && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">{associatedClass(resource)}</span>}</div>
                {resource.attachment_url && <div className="mt-4 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-800 shadow-sm"><FileText className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{resource.attachment_name}</p><p className="mt-0.5 text-xs font-medium text-slate-500">{resource.attachment_size ? `${(resource.attachment_size / (1024 * 1024)).toFixed(1)} MB` : "Attached file"}</p></div></div><Button className="mt-3 w-full" onClick={() => void openTeacherResourceFile(resource)}><Eye className="h-4 w-4 shrink-0" /><span>{resource.attachment_mime === "application/pdf" ? "Open PDF full screen" : String(resource.attachment_mime || "").startsWith("image/") ? "Open image full screen" : "Open document"}</span></Button></div>}
                {resource.content && <p className="mt-4 line-clamp-3 flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{resource.content}</p>}
                {!resource.content && !resource.attachment_url && <p className="mt-4 flex-1 text-sm text-slate-500">Teaching material</p>}
                <div className="mt-4 border-t border-slate-100 pt-3"><span className="text-xs font-medium text-slate-400">{resource.created_at ? new Date(resource.created_at).toLocaleDateString() : "Saved"}</span></div>
              </div>
            </article>
          ))}</div>
        )}
      </Page>
    );
  };

  const renderProfile = () => {
    if (!user) return null;

    const saveProfileChanges = async (changePassword: boolean) => {
      setProfileError("");
      setProfileSuccess("");

      if (!profileName.trim()) return setProfileError("Your full name is required.");
      if (changePassword) {
        if (!currentPassword) return setProfileError("Current password is required.");
        if (!newPassword || !confirmPassword) return setProfileError("Enter and confirm your new password.");
        if (newPassword.length < 8) return setProfileError("Use at least 8 characters for your new password.");
        if (newPassword.length > 72) return setProfileError("Password must be 72 characters or fewer.");
        if (newPassword !== confirmPassword) return setProfileError("New passwords do not match.");
      }

      try {
        setProfileLoading(true);
        const res = await api(`/api/users/${user.user_id}/profile`, {
          method: "POST",
          body: JSON.stringify({
            requester_id: user.user_id,
            full_name: profileName.trim() || user.full_name,
            institution_mode: profileInstitution,
            current_password: changePassword ? currentPassword : undefined,
            new_password: changePassword ? newPassword : undefined,
          }),
        });

        const updatedUser = { ...user, full_name: res.full_name, institution_mode: res.institution_mode };
        setUser(updatedUser);
        localStorage.setItem("khanmigo_user", JSON.stringify(updatedUser));
        if (changePassword) {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setShowCurrentPassword(false);
          setShowNewPassword(false);
          setShowConfirmPassword(false);
        }
        setProfileSuccess(changePassword ? "Profile and password updated successfully." : "Profile updated successfully.");
        await loadFullProfile();
      } catch (err: any) {
        setProfileError(err.message || "Failed to update profile.");
      } finally {
        setProfileLoading(false);
      }
    };
    const handleSaveProfile = async (event: React.FormEvent) => {
      event.preventDefault();
      await saveProfileChanges(false);
    };
    const handleSaveSecurity = async (event: React.FormEvent) => {
      event.preventDefault();
      await saveProfileChanges(true);
    };
    const handleAvatarChange = async (file: File) => {
      setProfileError("");
      setProfileSuccess("");
      setProfileLoading(true);

      try {
        const croppedImage = await cropProfileImage(file);
        const fd = new FormData();
        fd.append("requester_id", String(user.user_id));
        fd.append("file", croppedImage);
        const response = await fetch(`${API_BASE}/api/users/${user.user_id}/avatar`, {
          method: "POST",
          headers: user.access_token ? { Authorization: `Bearer ${user.access_token}` } : {},
          body: fd,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Avatar upload failed.");

        const updatedUser = { ...user, profile_pic: data.user.profile_pic };
        setUser(updatedUser);
        localStorage.setItem("khanmigo_user", JSON.stringify(updatedUser));
        setProfileSuccess("Profile photo updated.");
        await loadFullProfile();
      } catch (err: any) {
        setProfileError(err.message || "Unable to upload image.");
      } finally {
        setProfileLoading(false);
      }
    };

    return (
      <Page>
        <Header title="Account settings" subtitle="Manage your profile, personal details, and sign-in security." />
        {profileError && <AlertBox tone="error">{profileError}</AlertBox>}
        {profileSuccess && <AlertBox tone="success">{profileSuccess}</AlertBox>}

        <section className="relative mb-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-6 text-white shadow-xl shadow-emerald-950/10 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-white/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-36 right-1/3 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="relative h-28 w-28 shrink-0">
              <div className="h-28 w-28 overflow-hidden rounded-[1.75rem] border-4 border-white/80 bg-white/15 shadow-xl">
                {user.profile_pic ? <AuthenticatedProfileImage userId={Number(user.user_id)} requesterId={Number(user.user_id)} revision={profilePicture} alt={`${user.full_name}'s profile`} className="h-full w-full object-cover object-center" fallback={user.full_name?.[0]?.toUpperCase() || "U"} /> : <span className="flex h-full w-full items-center justify-center bg-white/10 text-4xl font-black text-white">{user.full_name?.[0]?.toUpperCase() || "U"}</span>}
              </div>
              <input
                ref={avatarCameraInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="user"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files?.[0]) void handleAvatarChange(event.target.files[0]);
                  setAvatarSourceChooser(false);
                  event.currentTarget.value = "";
                }}
              />
              <input ref={avatarGalleryInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { if (event.target.files?.[0]) void handleAvatarChange(event.target.files[0]); setAvatarSourceChooser(false); event.currentTarget.value = ""; }} />
              <button
                type="button"
                onClick={() => setAvatarSourceChooser(true)}
                disabled={profileLoading}
                aria-label="Change profile photo"
                className="absolute -bottom-2 -right-2 inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 border-emerald-900 bg-white text-emerald-900 shadow-lg transition hover:bg-emerald-50 disabled:opacity-60"
              >
                {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-100">Your profile</p>
              <h2 className="mt-1 truncate text-2xl font-black sm:text-3xl">{user.full_name}</h2>
              <p className="mt-1 truncate text-sm text-emerald-50/80">{user.email}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold capitalize">{user.role.replace("_", " ")}</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold">{user.institution_mode || "University"}</span>
                {user.role === "student" ? <span className="rounded-full border border-emerald-200/40 bg-emerald-300/15 px-3 py-1 text-xs font-black">Roll No: {user.roll_number || profileData?.roll_number || "Assigning…"}</span> : <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold">Member #{user.user_id}</span>}
              </div>
              {profileData?.total_classes !== undefined && (
                <p className="mt-3 text-xs font-semibold text-emerald-50/85">
                  {profileData.total_classes} {profileData.total_classes === 1 ? "connected class" : "connected classes"}
                </p>
              )}
              <p className="mt-3 text-xs text-emerald-100/75">Choose from camera or gallery · JPG, PNG, WebP · Up to 10 MB</p>
            </div>
          </div>
        </section>

        {avatarSourceChooser && <Modal title="Choose a profile photo" onClose={() => setAvatarSourceChooser(false)}>
          <p className="mb-5 text-sm leading-6 text-slate-500">Take a new photo with your camera or choose an existing image from your gallery.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button onClick={() => { setAvatarSourceChooser(false); avatarCameraInputRef.current?.click(); }} disabled={profileLoading} className="w-full"><Camera className="h-5 w-5" />Take a photo</Button>
            <Button variant="ghost" onClick={() => { setAvatarSourceChooser(false); avatarGalleryInputRef.current?.click(); }} disabled={profileLoading} className="w-full"><ImageIcon className="h-5 w-5" />Choose from gallery</Button>
          </div>
        </Modal>}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
          <SectionCard title="Personal information" className="border-slate-200/80 shadow-md shadow-slate-900/[0.03]">
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div>
                <p className="mb-4 text-sm leading-6 text-slate-500">Keep your name up to date so teachers and classmates can recognize you.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" value={profileName} onChange={setProfileName} placeholder="Enter your first and last name" />
                  <SelectField label="Education system" value={profileInstitution} onChange={(value: string) => setProfileInstitution(value as Institution)} options={["School", "College", "University"]} />
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Email address</span>
                    <input type="email" readOnly value={user.email} autoComplete="email" className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600" />
                    <span className="mt-1.5 block text-xs text-slate-400">Contact support if your email needs to change.</span>
                  </label>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-400">Your email is used for account sign-in.</p>
                <Button type="submit" disabled={profileLoading} className="min-w-40">
                  {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save profile
                </Button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Password & security" className="border-slate-200/80 shadow-md shadow-slate-900/[0.03]">
            <form onSubmit={handleSaveSecurity} className="space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm"><ShieldCheck className="h-4 w-4" /></span>
                  <div><p className="text-sm font-bold text-emerald-950">Protect your account</p><p className="mt-1 text-xs leading-5 text-emerald-900/70">Leave these fields empty if you only want to update your profile name.</p></div>
                </div>
              </div>
              <PasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword} visible={showCurrentPassword} onToggle={() => setShowCurrentPassword((visible) => !visible)} placeholder="Enter your current password" autoComplete="current-password" />
              <PasswordField label="New password" value={newPassword} onChange={setNewPassword} visible={showNewPassword} onToggle={() => setShowNewPassword((visible) => !visible)} placeholder="Create a new password (8+ characters)" autoComplete="new-password" minLength={8} maxLength={72} />
              <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((visible) => !visible)} placeholder="Type your new password again" autoComplete="new-password" minLength={8} maxLength={72} />
              <p className="text-xs leading-5 text-slate-400">Use at least 8 characters. Your current password is required to save a new one.</p>
              <Button type="submit" disabled={profileLoading} className="w-full">
                {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Save account settings
              </Button>
            </form>
          </SectionCard>
        </div>
      </Page>
    );
  };

  const renderStaffDashboard = () => <Page>
    <Header title={`Welcome back, ${user?.full_name || "Staff"}`} subtitle="Keep your institution's classrooms, reports, and communications moving." />
    <section className="dashboard-hero mb-6 overflow-hidden rounded-[1.75rem] bg-[#173b50] text-white shadow-lg shadow-slate-950/10">
      <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
          <span className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-sky-200">Institution operations</span>
          <h2 className="max-w-xl text-3xl font-black leading-tight sm:text-4xl">A clear view of your learning community.</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-sky-50/85">Review classrooms, share important notices, and prepare clear reports for your institution.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button onClick={() => nav("classes")} className="bg-white text-slate-950 hover:bg-sky-50"><GraduationCap className="h-4 w-4" />Classroom oversight</Button><Button onClick={() => nav("announcements")} variant="secondary" className="border-white/30 bg-white/10 text-white hover:bg-white/20"><Megaphone className="h-4 w-4" />Publish a notice</Button></div>
        </div>
        <div className="dashboard-hero-image min-h-56 sm:min-h-72 lg:min-h-[340px]"><img src={DASHBOARD_IMAGES.staff} alt="Education team planning and working together" loading="lazy" /></div>
      </div>
    </section>
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{[["Classrooms", staffClasses.length, "classes", GraduationCap], ["Notices", staffAnnouncements.length, "announcements", Megaphone], ["Reports", "View data", "reports", BarChart3], ["AI assistant", "Get support", "chat", Sparkles]].map(([title, value, tab, Icon]: any) => <button key={tab} onClick={() => nav(tab)} className="group flex min-h-32 flex-col items-start rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-200 hover:shadow-md sm:p-5"><span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-800"><Icon className="h-5 w-5" /></span><span className="font-black text-slate-900">{title}</span><span className="mt-1 text-sm text-slate-500">{value}</span></button>)}</div>
    <SectionCard title="Staff AI tools" className="mt-6"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{STAFF_TOOLS.map((tool) => <button key={tool.id} onClick={() => { setSelectedTool(tool); nav("chat"); setMessages([{ sender: "assistant", content: `I am ready to help with ${tool.title}. Describe the task you need completed.` }]); }} className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-sky-200 hover:bg-sky-50/40"><p className="font-bold">{tool.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{tool.description}</p></button>)}</div></SectionCard>
    <DashboardConnect />
  </Page>;
  const renderReports = () => <Page><Header title="Institution reports" subtitle="Overview of classrooms, people, attendance, submissions, and published results." action={<Button variant="ghost" onClick={() => void loadStaffReport()}><RefreshCw className="h-4 w-4" />Refresh report</Button>} />{staffError && <AlertBox tone="error">{staffError}</AlertBox>}{!staffReport ? <Empty title="Report data unavailable" text="Refresh the report or check your connection." /> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Students" value={staffReport.students || 0} icon={GraduationCap} /><StatCard label="Teachers" value={staffReport.teachers || 0} icon={Users} /><StatCard label="Classrooms" value={staffReport.classes || 0} icon={BookOpen} /><StatCard label="Open classrooms" value={staffReport.open_classes || 0} icon={Activity} /><StatCard label="Enrolled students" value={staffReport.enrollments || 0} icon={Users} /><StatCard label="Attendance rate" value={`${staffReport.attendance_rate || 0}%`} icon={Clock} /><StatCard label="Assignments submitted" value={staffReport.submissions || 0} icon={ClipboardList} /><StatCard label="Pending grading" value={staffReport.pending_submissions || 0} icon={AlertCircle} /></div><SectionCard title="Assessment and attendance" className="mt-5"><div className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs font-bold uppercase text-slate-500">Attendance records</p><p className="mt-1 text-2xl font-black">{staffReport.attendance_entries || 0}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Present marks</p><p className="mt-1 text-2xl font-black">{staffReport.present_entries || 0}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Published student results</p><p className="mt-1 text-2xl font-black">{staffReport.published_results || 0}</p></div></div></SectionCard></>}</Page>;

  const renderChat = () => {
    const filteredConvs = conversations.filter((c: any) =>
      (c.title || c.topic || "Conversation")
        .toLowerCase()
        .includes(convSearch.toLowerCase())
    );

    return (
      <div className="h-full flex bg-white overflow-hidden">
        <div
          className={`h-full border-r border-slate-200 bg-slate-50/70 flex flex-col shrink-0 transition-all duration-200 ${
            isChatSidebarOpen ? "w-72" : "w-0 -translate-x-full overflow-hidden"
          }`}
        >
          <div className="p-3 border-b border-slate-200/80 space-y-2">
            <button
              onClick={() => {
                setCurrentConvId(null);
                setMessages([]);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition shadow-xs"
            >
              <Plus className="w-4 h-4" /> New Chat
            </button>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={convSearch}
                onChange={(e) => setConvSearch(e.target.value)}
                placeholder="Search chats..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-3 py-1.5">
              Recent Conversations
            </p>

            {filteredConvs.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                {convSearch ? "No matching chats" : "No saved chats yet"}
              </div>
            ) : (
              filteredConvs.map((c: any) => {
                const id = c.conversation_id || c.id;
                const isActive = currentConvId === id;

                return (
                  <div
                    key={id}
                    className={`group flex items-center justify-between gap-1 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      isActive
                        ? "bg-blue-100/70 text-blue-800"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <button
                      onClick={() => loadConversation(id)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-blue-600" />
                      <span className="truncate">{c.title || c.topic || "Untitled Chat"}</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingConvId(id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition rounded-md"
                      title="Delete chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 h-full flex flex-col bg-white">
          <div className="h-16 border-b border-slate-200 flex items-center justify-between px-5 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsChatSidebarOpen(!isChatSidebarOpen)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition"
                title="Toggle sidebar"
              >
                <ChevronLeft
                  className={`w-5 h-5 transition-transform ${
                    isChatSidebarOpen ? "" : "rotate-180"
                  }`}
                />
              </button>
              <div>
                <p className="font-black text-slate-900 text-sm sm:text-base">
                  {selectedTool?.title ||
                    (user?.role === "student"
                      ? "AI Learning Assistant"
                      : user?.role === "teacher"
                      ? "AI Teaching Assistant"
                      : "Balochistan Acadmy Assistant")}
                </p>
                <p className="text-xs text-slate-400">
                  Multimodal educational assistant • LAWMS ACADMY AI
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={speechLanguage}
                onChange={(e) => setSpeechLanguage(e.target.value)}
                className="hidden sm:block border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-white"
              >
                <option value="en-US">English</option>
                <option value="ur-PK">Urdu</option>
                <option value="hi-IN">Hindi</option>
              </select>

              <Button
                variant="ghost"
                onClick={() => {
                  setCurrentConvId(null);
                  setMessages([]);
                }}
              >
                <Plus className="w-4 h-4 mr-1" /> New
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
            <div className="max-w-4xl mx-auto space-y-5">
              {messages.length === 0 && (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-black mt-5">How can I help?</h2>
                  <p className="text-slate-500 mt-2 text-sm">
                    Ask questions, upload problems or diagrams, or dictate your ideas.
                  </p>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-3xl px-5 py-4 ${
                      m.sender === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-50 border border-slate-200 text-slate-800"
                    }`}
                  >
                    {m.sender === "assistant" && !m.content && isLoading ? (
                      <div className="flex items-center gap-2 text-slate-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    {m.input_type === "document" && (
                      <p className="text-xs opacity-80 mt-2 font-bold">Attachment included</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white/80 backdrop-blur-md p-4 shrink-0">
            <div className="max-w-4xl mx-auto">
              {fileError && (
                <div className="mb-3 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-300/80 rounded-3xl p-3 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:bg-white transition-all">
                {selectedFiles.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2.5 pb-2.5 mb-2 border-b border-slate-200/80">
                    {selectedFiles.map((file, i) => {
                      const isImage = file.type.startsWith("image/");
                      const previewUrl = isImage ? URL.createObjectURL(file) : null;

                      return (
                        <div
                          key={`${file.name}-${i}`}
                          className="relative group flex items-center gap-2.5 bg-white border border-slate-200 rounded-2xl p-1.5 pr-3 shadow-xs hover:border-slate-300 transition"
                        >
                          {isImage && previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={file.name}
                              className="w-10 h-10 object-cover rounded-xl border border-slate-100"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                              <FileText className="w-5 h-5" />
                            </div>
                          )}

                          <div className="max-w-[140px] sm:max-w-[200px]">
                            <p className="text-xs font-black text-slate-800 truncate">
                              {file.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                              {(file.size / (1024 * 1024)).toFixed(1)} MB
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setSelectedFiles((prev) =>
                                prev.filter((_, idx) => idx !== i)
                              )
                            }
                            className="w-5 h-5 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition"
                            title="Remove file"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt,.csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) addFiles(Array.from(e.target.files));
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-10 h-10 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center shrink-0 transition"
                    title="Attach educational document or diagram"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                    rows={1}
                    placeholder={
                      selectedFiles.length > 0
                        ? "Ask a question about your attached file..."
                        : user?.role === "student"
                        ? "Ask a question, request a hint, or paste a problem..."
                        : "Ask for lesson plans, rubrics, or pedagogical assistance..."
                    }
                    className="w-full max-h-36 min-h-[40px] resize-none bg-transparent border-0 outline-none px-1.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 leading-relaxed font-medium"
                    style={{ height: "auto" }}
                    onInput={(e: any) => {
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
                    }}
                  />

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center transition ${
                        isRecording
                          ? "bg-rose-50 text-rose-600 animate-pulse border border-rose-200"
                          : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/60"
                      }`}
                      title={isRecording ? "Stop recording" : "Voice input"}
                    >
                      {isRecording ? <StopCircle className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                    </button>

                    <button
                      type="button"
                      onClick={sendChat}
                      disabled={isLoading || (!chatInput.trim() && !selectedFiles.length)}
                      className="w-10 h-10 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center transition shadow-xs"
                      title="Send message"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {isRecording && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs text-rose-600 font-bold px-1.5 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                      <span>Listening... {speechLanguage}</span>
                      {interimTranscript && (
                        <span className="text-slate-400 font-normal truncate max-w-[200px] sm:max-w-md">
                          "{interimTranscript}"
                        </span>
                      )}
                    </div>
                    <span>{recordingSeconds}s</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {deletingConvId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
              <h3 className="font-black text-slate-900 text-base">Delete Conversation?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to delete this conversation? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setDeletingConvId(null)}>
                  Cancel
                </Button>
                <button
                  onClick={() => deleteConversation(deletingConvId)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* =======================================================
     AUTH SCREEN RENDER
  ======================================================= */
  if (!user) {
    return <AuthScreen authMode={authMode} setAuthMode={setAuthMode} fullName={fullName} setFullName={setFullName} email={email} setEmail={setEmail} password={password} setPassword={setPassword} confirmPassword={resetConfirmPassword} setConfirmPassword={setResetConfirmPassword} selectedRole={selectedRole} setSelectedRole={setSelectedRole} selectedInstitution={selectedInstitution} setSelectedInstitution={setSelectedInstitution} qualification={qualification} setQualification={setQualification} teachingSubject={teachingSubject} setTeachingSubject={setTeachingSubject} designation={designation} setDesignation={setDesignation} staffRegistrationCode={staffRegistrationCode} setStaffRegistrationCode={setStaffRegistrationCode} termsAccepted={termsAccepted} setTermsAccepted={setTermsAccepted} loading={authLoading} error={authError} success={authSuccess} onSubmit={handleAuth} />;
  }

  let content: React.ReactNode;
  if (activeTab === "meetings") content = renderMeetings();
  else if (activeTab === "communications") content = renderCommunications();
  else if (activeTab === "chat") content = renderChat();
  else if (activeTab === "profile") content = renderProfile();
  else if (user.role === "teacher") {

  // ...existing code...
    content =
      activeTab === "dashboard" ? renderTeacherDashboard() :
      activeTab === "classes" ? renderTeacherClasses() :
      activeTab === "class-detail" ? renderTeacherClassDetail() :
      activeTab === "attendance" ? renderTeacherAttendance() :
      activeTab === "assignments" ? renderTeacherAssignments() :
      activeTab === "quizzes" ? renderTeacherQuizzes() :
      activeTab === "teacher-quiz-submissions" ? renderTeacherQuizSubmissions() :
      activeTab === "submissions" ? renderSubmissions() :
      activeTab === "tools" ? renderTeacherTools() :
      activeTab === "tool-form" ? renderTeacherToolForm() :
      activeTab === "resources" ? renderTeacherResources() :
      activeTab === "browse-subjects" ? renderBrowseSubjects() :
      activeTab === "subject-view" ? renderSubjectView() :
      renderTeacherDashboard();
// ...existing code...
  } else if (user.role === "student") {
    content =
      activeTab === "dashboard" ? renderStudentDashboard() :
      activeTab === "classes" ? renderStudentClasses() :
      activeTab === "student-class-detail" ? renderStudentClassDetail() :
      activeTab === "assignments" ? renderStudentAssignments() :
      activeTab === "student-assignment" ? renderStudentAssignment() :
      activeTab === "quizzes" ? renderStudentQuizzes() :
      activeTab === "student-quiz" ? renderStudentQuiz() :
      activeTab === "attendance" ? renderStudentAttendance() :
      activeTab === "results" ? renderStudentResults() :
      activeTab === "announcements" ? renderStudentAnnouncements() :
      activeTab === "timetable" ? renderStudentTimetable() :
      activeTab === "browse-subjects" ? renderBrowseSubjects() :
      activeTab === "subject-view" ? renderSubjectView() :
      renderStudentDashboard();
  } else if (user.role === "staff") {
    content =
      activeTab === "dashboard" ? renderStaffDashboard() :
      activeTab === "reports" ? renderReports() :
      ["students", "teachers", "staff"].includes(activeTab) ? renderDirectoryTable(activeTab) :
      activeTab === "departments" ? renderDepartmentsView() :
      activeTab === "announcements" ? renderStaffAnnouncements() :
      activeTab === "attendance" ? renderStaffAttendance() :
      activeTab === "classes" ? renderAllClassesView() :
      renderChat();
  }

  return (
    <div className="app-workspace-shell h-dvh min-h-[100svh] text-slate-900 flex overflow-hidden">
      <aside
        className={`app-sidebar-surface fixed z-40 inset-y-0 left-0 w-[285px] border-r border-emerald-900/10 flex flex-col transform transition-transform md:static md:translate-x-0 ${
          mobileSidebar ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {renderSidebar()}
      </aside>

      {mobileSidebar && (
        <div
          onClick={() => setMobileSidebar(false)}
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
        />
      )}

      <main className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden">
        <div className="app-mobile-header md:hidden h-14 border-b border-emerald-900/10 flex items-center px-4">
          <button
            onClick={() => setMobileSidebar(true)}
            className="p-2 rounded-xl hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-black ml-3">BALOCHISTAN ACADMY</span>
        </div>

        <div
          className={`app-page-surface min-h-0 min-w-0 flex-1 ${
            activeTab === "chat" ? "h-full overflow-hidden flex flex-col" : "overflow-y-auto"
          }`}
        >
          {content}
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   COMPONENTS MOVED OUTSIDE OF APP TO PREVENT UNMOUNT/FOCUS LOSS
========================================================= */

function AuthScreen(props: any) {
  const [showPassword, setShowPassword] = useState(false);
  const isAccountForm = props.authMode === "login" || props.authMode === "register";
  const title = props.authMode === "login" ? "Welcome back" : props.authMode === "register" ? "Join your learning community" : props.authMode === "forgot" ? "Recover your account" : "Choose a new password";
  const subtitle = props.authMode === "login" ? "Sign in to continue to your learning workspace." : props.authMode === "register" ? "Create a student or teacher account. Staff accounts require an administrator code." : props.authMode === "forgot" ? "Enter your account email and we will send a secure reset link." : "Use at least 8 characters for your new password.";

  return (
    <main className="auth-backdrop relative flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-8 sm:px-8 lg:py-10">
      <div className="auth-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="auth-glow auth-glow-one pointer-events-none absolute" aria-hidden="true" />
      <div className="auth-glow auth-glow-two pointer-events-none absolute" aria-hidden="true" />
      <div className="relative grid w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-[0_32px_100px_rgba(20,54,39,0.16)] ring-1 ring-slate-900/[0.04] lg:min-h-[700px] lg:grid-cols-[1fr_0.92fr]">
        <section
          className="relative isolate flex min-h-[330px] flex-col justify-between overflow-hidden bg-emerald-950 bg-cover bg-center px-6 py-6 text-white sm:min-h-[390px] sm:px-10 sm:py-10 lg:min-h-0 lg:px-12 lg:py-12"
          style={{
            backgroundImage: "linear-gradient(145deg, rgba(8, 48, 53, 0.78), rgba(13, 74, 69, 0.62) 58%, rgba(10, 61, 60, 0.48)), url('/learning-campus.png')",
          }}
        >
          <div className="auth-orbit auth-orbit-one pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border border-white/10" aria-hidden="true" />
          <div className="auth-orbit auth-orbit-two pointer-events-none absolute -right-5 top-8 h-56 w-56 rounded-full border border-white/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-40 -left-28 h-96 w-96 rounded-full bg-emerald-300/10 blur-3xl" aria-hidden="true" />
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#d9eba6] text-[#164e3b] shadow-lg shadow-black/10">
                <GraduationCap className="h-6 w-6" />
              </div>
              <span className="text-lg font-black tracking-tight">BALOCHISTAN <span className="text-[#d9eba6]">ACADMY</span></span>
            </div>
          </div>
          <div className="relative z-10 mt-auto mb-5 max-w-[58%] [text-shadow:0_1px_8px_rgba(0,0,0,0.35)] lg:mb-8 lg:max-w-[20rem]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-100">
              <Sparkles className="h-3.5 w-3.5 text-[#d9eba6]" />
              Learning in Balochistan
            </div>
            <p className="mt-5 max-w-md text-sm leading-7 text-emerald-50 sm:text-base">
              One place for students, teachers and education teams to learn, teach and move forward.
            </p>

            <div className="relative mt-6 hidden max-w-sm rounded-2xl border border-white/15 bg-white/[0.09] p-4 shadow-xl shadow-[#082b21]/20 backdrop-blur-sm sm:mt-8 sm:block sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#d9eba6]/15 text-[#d9eba6]">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Learning that moves with you</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-50/70">Your classes, resources and progress, all in one workspace.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="relative z-10 mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-white/15 pt-4 text-xs font-semibold text-emerald-50/70 sm:mt-8 sm:pt-5">
            <span>Primary to university</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#d9eba6]" /> Built for education</span>
          </div>
        </section>

        <section className="flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
          <div className="mb-8 flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Your education workspace
          </div>
          {isAccountForm && (
            <div className="mb-8 flex rounded-xl bg-slate-100 p-1">
              {["login", "register"].map((mode) => (
                <button key={mode} type="button" onClick={() => { props.setSelectedRole("student"); props.setAuthMode(mode); }} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition ${props.authMode === mode ? "bg-white text-[#14573f] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {mode === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
          )}
          <div className="mb-7">
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
          </div>
          {props.error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{props.error}</div>}
          {props.success && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{props.success}</div>}

          <form onSubmit={props.onSubmit} className="space-y-4">
            {props.authMode === "register" && <>
              <Field label="Full Name" value={props.fullName} onChange={props.setFullName} placeholder="Your full name" required maxLength={120} />
              <SelectField label="Role" value={props.selectedRole} onChange={props.setSelectedRole} options={["student", "teacher", "staff"]} />
              <SelectField label={props.selectedRole === "student" ? "Education level" : "Institution"} value={props.selectedInstitution} onChange={props.setSelectedInstitution} options={["School", "College", "University"]} />
              {props.selectedRole === "teacher" && <>
                <Field label="Teaching qualification" value={props.qualification} onChange={props.setQualification} placeholder="e.g. B.Ed, M.Ed, or subject degree" required maxLength={120} />
                <Field label="Teaching subject" value={props.teachingSubject} onChange={props.setTeachingSubject} placeholder="e.g. Mathematics, English, or Science" required maxLength={120} />
              </>}
              {props.selectedRole === "staff" && <>
                <Field label="Education / professional qualification" value={props.qualification} onChange={props.setQualification} placeholder="e.g. Bachelor's degree or diploma" required maxLength={120} />
                <Field label="Institution role / designation" value={props.designation} onChange={props.setDesignation} placeholder="e.g. Coordinator, Librarian, or Clerk" required maxLength={120} />
                <Field label="Staff registration code" type="password" value={props.staffRegistrationCode} onChange={props.setStaffRegistrationCode} placeholder="Provided by your administrator" required maxLength={200} />
              </>}
            </>}
            {props.authMode !== "reset" && <Field label="Email address" type="email" value={props.email} onChange={props.setEmail} placeholder="name@example.com" />}
            {(props.authMode === "login" || props.authMode === "register" || props.authMode === "reset") && <div className="block">
              <label htmlFor="auth-password" className="mb-2 block text-xs font-black uppercase text-slate-500">{props.authMode === "reset" ? "New password" : "Password"}</label>
              <span className="flex items-center rounded-xl border border-slate-300 bg-white transition focus-within:border-[#167250] focus-within:ring-2 focus-within:ring-emerald-100">
                <input id="auth-password" type={showPassword ? "text" : "password"} required minLength={props.authMode === "login" ? undefined : 8} maxLength={72} autoComplete={props.authMode === "login" ? "current-password" : "new-password"} value={props.password} onChange={(event) => props.setPassword(event.target.value)} placeholder="At least 8 characters" className="w-full min-w-0 rounded-l-xl bg-transparent px-4 py-3 outline-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible: boolean) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-[#14573f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#167250]"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                </button>
              </span>
            </div>}
            {props.authMode === "reset" && <label className="block">
              <span className="block text-xs font-black uppercase text-slate-500 mb-2">Confirm new password</span>
              <input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={props.confirmPassword} onChange={(event) => props.setConfirmPassword(event.target.value)} placeholder="Enter the new password again" className="w-full border border-slate-300 px-4 py-3 outline-none focus:border-[#167250] focus:ring-2 focus:ring-emerald-100" />
            </label>}
            {props.authMode === "register" && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={props.termsAccepted} onChange={(event) => props.setTermsAccepted(event.target.checked)} />I accept the platform terms.</label>}
            <button disabled={props.loading} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#167250] py-3.5 font-bold text-white shadow-lg shadow-emerald-900/10 transition hover:-translate-y-0.5 hover:bg-[#125c40] hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
              {props.loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {props.authMode === "login" ? "Sign in" : props.authMode === "register" ? "Create account" : props.authMode === "forgot" ? "Send reset link" : "Update password"}
            </button>
          </form>
          <div className="mt-5 flex items-center justify-between gap-4 text-sm">
            {props.authMode === "login" ? <button type="button" onClick={() => props.setAuthMode("forgot")} className="font-bold text-[#167250] transition hover:text-[#125c40] hover:underline">Forgot password?</button> : <button type="button" onClick={() => props.setAuthMode("login")} className="font-bold text-[#167250] transition hover:text-[#125c40] hover:underline">Back to sign in</button>}
            {props.authMode === "forgot" && <span className="text-xs text-slate-400">Reset links expire after 30 minutes.</span>}
          </div>
          <p className="mt-10 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-400">
            A shared space for students, teachers and education teams.
          </p>
        </section>
      </div>
    </main>
  );
}

function Page({ children }: { children: React.ReactNode }) { return <div className="mx-auto w-full max-w-7xl p-4 pb-10 sm:p-5 sm:pb-12 md:p-8 lg:p-10">{children}</div>; }
function Header({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) { return <div className="mb-6 flex min-w-0 flex-col gap-3 sm:mb-7 md:flex-row md:items-end md:justify-between md:gap-4"><div className="min-w-0"><h1 className="break-words text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">{title}</h1>{subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">{subtitle}</p>}</div>{action && <div className="shrink-0">{action}</div>}</div>; }
function SectionCard({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) { return <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6 ${className}`}><div className="mb-4 flex items-center justify-between gap-3 sm:mb-5"><h2 className="min-w-0 text-base font-black sm:text-lg">{title}</h2>{action}</div>{children}</section>; }
function StatCard({ label, value, icon: Icon }: any) { return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5"><Icon className="h-5 w-5 text-blue-600" /><p className="mt-2 break-words text-xl font-black sm:mt-4 sm:text-2xl">{value}</p><p className="mt-1 text-xs leading-4 text-slate-500 sm:text-sm">{label}</p></div>; }
function DashboardConnect() {
  const links = [
    ["Khan Academy", "https://www.khanacademy.org/", "K", "bg-emerald-700"],
    ["Google Scholar", "https://scholar.google.com/", "GS", "bg-indigo-600"],
    ["Coursera", "https://www.coursera.org/", "Co", "bg-blue-800"],
    ["edX", "https://www.edx.org/", "edX", "bg-red-700"],
    ["MIT OpenCourseWare", "https://ocw.mit.edu/", "MIT", "bg-rose-800"],
    ["OpenLearn", "https://www.open.edu/openlearn/", "OL", "bg-purple-700"],
    ["PhET Simulations", "https://phet.colorado.edu/", "PhET", "bg-orange-600"],
    ["Project Gutenberg", "https://www.gutenberg.org/", "PG", "bg-amber-700"],
  ];
  return <section className="dashboard-links-panel mt-6 overflow-hidden rounded-3xl p-5 sm:p-7">
    <div className="relative z-10 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-800">Explore and connect</p><h2 className="mt-1 text-xl font-black text-slate-900">Useful links for your learning journey</h2></div><p className="mt-1 text-sm text-slate-500">Open a trusted resource in a new tab.</p></div>
    <div className="relative z-10 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">{links.map(([name, url, mark, color]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 items-center gap-2 rounded-xl border border-white/80 bg-white/85 p-2.5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white hover:shadow-md sm:flex-col sm:items-start sm:gap-2 sm:p-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black text-white shadow-sm ${color}`}>{mark}</span><span className="truncate text-xs font-bold text-slate-700 group-hover:text-emerald-800 sm:text-sm">{name}</span></a>)}</div>
  </section>;
}
type JitsiExternalApi = {
  dispose: () => void;
  addEventListener: (event: string, listener: () => void) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, any>) => JitsiExternalApi;
  }
}

function EmbeddedMeeting({ meeting, onLeave }: { meeting: any; onLeave: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  const [error, setError] = useState("");
  useEffect(() => {
    let api: JitsiExternalApi | null = null;
    let disposed = false;
    const start = () => {
      if (disposed || !hostRef.current || !window.JitsiMeetExternalAPI) return;
      api = new window.JitsiMeetExternalAPI(meeting.domain || "meet.jit.si", {
        roomName: meeting.room_name,
        ...(meeting.jwt ? { jwt: meeting.jwt } : {}),
        parentNode: hostRef.current,
        width: "100%",
        height: "100%",
        lang: "en",
        userInfo: { displayName: meeting.display_name || "Khanmigo member" },
        configOverwrite: { startWithAudioMuted: true, startWithVideoMuted: true, prejoinConfig: { enabled: true } },
      });
      api.addEventListener("videoConferenceLeft", () => onLeaveRef.current());
      api.addEventListener("readyToClose", () => onLeaveRef.current());
    };
    const scriptUrl = meeting.script_url || `https://${meeting.domain || "meet.jit.si"}/external_api.js`;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    if (window.JitsiMeetExternalAPI) start();
    else if (existing) {
      existing.addEventListener("load", start, { once: true });
      existing.addEventListener("error", () => setError("The video meeting service could not be loaded."), { once: true });
    } else {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.onload = start;
      script.onerror = () => setError("The video meeting service could not be loaded. Check your internet connection and try again.");
      document.head.appendChild(script);
    }
    return () => {
      disposed = true;
      api?.dispose();
    };
  }, [meeting.domain, meeting.room_name, meeting.display_name]);
  return <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black sm:rounded-2xl"><div ref={hostRef} className="h-full min-h-0 w-full" />{error && <div role="alert" className="absolute inset-x-3 top-3 rounded-xl bg-rose-950/90 p-3 text-sm font-semibold text-white">{error}</div>}</div>;
}

function Button({ children, onClick, variant = "primary", disabled = false, className = "", type = "button" }: any) {
  const variants: Record<string, string> = {
    primary: "bg-gradient-to-r from-[#167250] to-[#20845e] text-white shadow-[0_5px_14px_rgba(22,114,80,0.18)] hover:-translate-y-0.5 hover:from-[#125c40] hover:to-[#167250] hover:shadow-[0_9px_20px_rgba(22,114,80,0.24)]",
    secondary: "border border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-md",
    ghost: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md",
    dark: "bg-slate-900 text-white shadow-sm hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md",
  };
  const buttonVariant = variants[variant] || variants.primary;
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0 ${buttonVariant} ${className}`}>{children}</button>;
}
function Badge({ children }: { children: React.ReactNode }) { return <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-black">{children}</span>; }
function AlertBox({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "success" | "info" }) { const cls = tone === "error" ? "bg-red-50 border-red-200 text-red-700" : tone === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-blue-50 border-blue-200 text-blue-700"; return <div className={`mb-5 border rounded-2xl px-4 py-3 text-sm ${cls}`}>{children}</div>; }
function InfoStrip({ children }: { children: React.ReactNode }) { return <AlertBox tone="info"><div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{children}</div></AlertBox>; }
function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) { return <div className="py-12 text-center"><div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center mx-auto"><BookOpen className="w-6 h-6" /></div><h3 className="font-black mt-4 text-slate-900">{title}</h3><p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{text}</p>{action && <div className="mt-5">{action}</div>}</div>; }
function Field({ label, value, onChange, placeholder = "", type = "text", required = false, maxLength }: any) { return <label className="block"><span className="block text-xs font-black uppercase tracking-wide text-slate-500 mb-2">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} maxLength={maxLength} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" /></label>; }
function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  placeholder,
  autoComplete,
  minLength,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  placeholder: string;
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
}) {
  const inputId = `password-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="block">
      <label htmlFor={inputId} className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</label>
      <span className="flex items-center rounded-xl border border-slate-200 bg-white transition focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-600/10">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          className="w-full min-w-0 rounded-l-xl bg-transparent px-4 py-3 text-sm text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </span>
    </div>
  );
}
function TextAreaField({ label, value, onChange, placeholder = "", rows = 6 }: any) { return <label className="block"><span className="block text-xs font-black uppercase tracking-wide text-slate-500 mb-2">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none resize-y focus:border-blue-500 focus:ring-4 focus:ring-blue-50" /></label>; }
function SelectField({ label, value, onChange, options, optionLabels }: any) { return <label className="block"><span className="block text-xs font-black uppercase tracking-wide text-slate-500 mb-2">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-white outline-none focus:border-blue-500">{options.map((option: string, i: number) => <option key={`${option}-${i}`} value={option.split("|")[0]}>{optionLabels?.[i] || (option.includes("|") ? option.split("|")[1] : option || `Select ${label}`)}</option>)}</select></label>; }
function Modal({ title, onClose, children }: any) { return createPortal(<div className="modal-backdrop fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-3 sm:p-5"><div role="dialog" aria-modal="true" aria-label={title} className="modal-shell my-auto w-full max-w-2xl max-h-[calc(100svh-1.5rem)] overflow-y-auto rounded-3xl shadow-2xl"><div className="modal-heading sticky top-0 z-10 flex items-center justify-between px-5 py-5 text-white sm:px-7"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">Khanmigo workspace</p><h2 className="mt-1 text-xl font-black sm:text-2xl">{title}</h2><p className="mt-1 text-xs text-white/75">Add the details below to get started.</p></div><button aria-label="Close dialog" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20"><X className="h-5 w-5" /></button></div><div className="modal-content p-4 sm:p-7">{children}</div></div></div>, document.body); }

function OutputBlock({ data }: { data: any }) {
  let questions: any[] = [];
  if (Array.isArray(data?.questions)) {
    questions = data.questions;
  } else if (typeof data?.questions_json === "string") {
    try {
      questions = JSON.parse(data.questions_json);
    } catch {
      questions = [];
    }
  }

  if (questions.length > 0) {
    return (
      <div className="space-y-6 overflow-y-auto max-h-[75vh] pr-2">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                Generated Quiz
              </span>
              <h3 className="text-xl font-black mt-1">
                {data.title || data.topic ? `${data.topic} Quiz` : "Quiz Assessment"}
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold bg-white/10 px-3 py-1.5 rounded-xl">
                Questions: {questions.length}
              </span>
              <span className="text-xs font-bold bg-white/10 px-3 py-1.5 rounded-xl">
                Marks: {data.total_marks || questions.length}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((q: any, index: number) => {
            const options = Array.isArray(q.options) ? q.options : [];
            const answerText = String(q.answer ?? "").trim();
            const answerLetterMatch = answerText.match(/^(?:option\s*)?([a-d])(?:[).:\s-]|$)/i);
            const answerLetterIndex = answerLetterMatch ? answerLetterMatch[1].toUpperCase().charCodeAt(0) - 65 : -1;
            const normalizeAnswer = (value: unknown) => String(value ?? "")
              .trim()
              .replace(/^(?:option\s*)?[a-d][).:\s-]+/i, "")
              .replace(/\s+/g, " ")
              .toLocaleLowerCase();

            return (
              <div
                key={index}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition"
              >
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <p className="font-bold text-slate-900 text-sm leading-6">
                    {q.question || q.text}
                  </p>
                </div>

                {options.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-2 mt-4 ml-10">
                    {options.map((opt: string, optIndex: number) => {
                      const isCorrect = answerLetterIndex >= 0
                        ? optIndex === answerLetterIndex
                        : normalizeAnswer(opt) === normalizeAnswer(answerText);

                      return (
                        <div
                          key={optIndex}
                          className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-between ${
                            isCorrect
                              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                              : "bg-slate-50 border-slate-200 text-slate-700"
                          }`}
                        >
                          <span>{opt}</span>
                          {isCorrect && (
                            <span className="text-[10px] uppercase font-black tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md shrink-0 ml-2">
                              Answer
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.explanation && (
                  <div className="mt-3.5 ml-10 rounded-xl bg-blue-50/50 border border-blue-100 p-3 text-xs leading-relaxed text-slate-600">
                    <strong className="text-blue-900 font-bold">Explanation: </strong>
                    {q.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const textContent =
    typeof data === "string"
      ? data
      : data?.content ||
        data?.result ||
        data?.report ||
        data?.response ||
        data?.message ||
        "";

  if (textContent) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 overflow-auto max-h-[75vh] shadow-xs">
        <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {textContent}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900 text-slate-100 p-5 overflow-auto max-h-[65vh]">
      <pre className="whitespace-pre-wrap text-xs font-mono">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
