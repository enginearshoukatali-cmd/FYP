import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  FileText,
  GraduationCap,
  Key,
  LayoutGrid,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  StopCircle,
  Target,
  Trash2,
  Users,
  WandSparkles,
  X,
} from "lucide-react";

const API_BASE = (window.__APP_CONFIG__?.API_BASE || import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");
const MAX_FILES = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
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

type Role = "student" | "teacher" | "staff" | "superadmin";
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
  | "tokens"
  | "teacher-quiz-submissions"
  | "departments"
  | "students"
  | "teachers"
  | "staff"
  | "chat";


interface User {
  user_id: number;
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
  return role === "super_admin" ? "superadmin" : (role as Role);
}

function prettyDate(value: any) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
      if (new URLSearchParams(window.location.search).has("reset_token")) return null;
    try {
      const raw = localStorage.getItem("khanmigo_user");
      const storedUser = raw ? JSON.parse(raw) as User : null;
      return storedUser?.access_token ? storedUser : null;
    } catch {
      return null;
    }
  });

  const [, setTeacherAttendance] = useState<any[]>([]);
  const [, setIsAttachmentOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("student");
  const [selectedInstitution, setSelectedInstitution] = useState<Institution>("University");
  const [invitationCode, setInvitationCode] = useState("");
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
  const [search, setSearch] = useState("");
  const curriculumReaderRef = useRef<HTMLElement>(null);
  const curriculumOpenRequestRef = useRef(0);
  const pathwayStages = user?.role === "student"
    ? institutionCurriculumStages(user.institution_mode)
    : CURRICULUM_STAGES.map((stage) => stage.name);
  const availableBookGrades = user?.role === "student"
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
  const [staffAnnouncements, setStaffAnnouncements] = useState<any[]>([]);
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
  const [teacherStudents, setTeacherStudents] = useState<any[]>([]);
  const [selectedTeacherClass, setSelectedTeacherClass] = useState<TeacherClass | null>(null);
  const [teacherClassStudents, setTeacherClassStudents] = useState<any[]>([]);
  const [teacherPortalLoading, setTeacherPortalLoading] = useState(false);
  const [teacherPortalError, setTeacherPortalError] = useState("");
  const [teacherOutput, setTeacherOutput] = useState<any>(null);
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

  const [generatedTokens, setGeneratedTokens] = useState<any[]>([]);
  const [tokenRole, setTokenRole] = useState<"teacher" | "staff">("teacher");
  const [tokenLoading, setTokenLoading] = useState(false);

  const [profileData, setProfileData] = useState<any>(null);
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const api = async (endpoint: string, options: RequestInit = {}) => {
    let accessToken = "";
    try {
      accessToken = JSON.parse(localStorage.getItem("khanmigo_user") || "{}").access_token || "";
    } catch {
      accessToken = "";
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.message || "Request failed.");
    return data;
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
      const allowedGrades = user?.role === "student" ? institutionBookGrades(user.institution_mode) : null;
      setCurriculumBooks(Array.isArray(books)
        ? books.filter((book: CurriculumBook) => !allowedGrades || allowedGrades.some((allowedGrade) => String(allowedGrade).toLowerCase() === String(book.grade).toLowerCase()))
        : []);
    } catch (error: any) {
      setCurriculumBooksError(error?.message || "Could not load BTBB textbooks.");
    } finally {
      setCurriculumBooksLoading(false);
    }
  };

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
    } catch {
      setProfileData({});
      setProfileName(user.full_name || "");
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

  const loadAdminTokens = async () => {
    if (!user || user.role !== "superadmin") return;
    try {
      const data = await api(`/api/admin/invitations/${user.user_id}`);
      setGeneratedTokens(Array.isArray(data) ? data : []);
    } catch {
      setGeneratedTokens([]);
    }
  };

  const loadStaffClasses = async () => {
    if (!user || !["staff", "superadmin"].includes(user.role)) return;
    try {
      const classes = await api(`/api/classes/all?requester_id=${user.user_id}`);
      setStaffClasses(Array.isArray(classes) ? classes : []);
    } catch (error: any) {
      setStudentError(error?.message || "Unable to load classroom overview.");
    }
  };

  const loadStaffAnnouncements = async () => {
    if (!user || !["staff", "superadmin"].includes(user.role)) return;
    try {
      const announcements = await api(`/api/announcements/user/${user.user_id}`);
      setStaffAnnouncements(Array.isArray(announcements) ? announcements : []);
    } catch (error: any) {
      setStaffAnnouncementError(error?.message || "Unable to load institutional notices.");
    }
  };

  useEffect(() => {
    if (!user) return;
    localStorage.setItem("khanmigo_user", JSON.stringify(user));
    loadConversations();
    loadFullProfile();
    if (user.role === "teacher") loadTeacherPortal();
    if (user.role === "student") loadStudentPortal();
    if (user.role === "staff" || user.role === "superadmin") loadStaffClasses();
    if (user.role === "staff" || user.role === "superadmin") loadStaffAnnouncements();
    if (user.role === "superadmin") loadAdminTokens();
  }, [user]);

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
      if (!email.trim() || !password) throw new Error("Email and password are required.");
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = authMode === "login"
        ? { email: email.trim(), password }
        : {
            full_name: fullName.trim(),
            email: email.trim(),
            password,
            role: selectedRole,
            institution_mode: selectedInstitution,
            invitation_code: selectedRole === "teacher" || selectedRole === "staff" ? invitationCode.trim() : undefined,
          };
      const data = await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
      if (authMode === "login") {
        const nextUser: User = { ...data, access_token: data.access_token, role: normalizeRole(data.role) };
        setUser(nextUser);
      } else {
        setAuthMode("login");
        setPassword("");
        setInvitationCode("");
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

  const openStudentClass = async (cls: any) => {
    if (!user) return;
    try {
      const data = await api(`/api/classes/${cls.id}?user_id=${user.user_id}`);
      setStudentSelectedClass(data);
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
    if (!user || !["staff", "superadmin"].includes(user.role)) return;
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
      nav("class-detail");
    } catch (error: any) {
      setTeacherPortalError(error?.message || "Unable to open classroom.");
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

  const openSubmissionForAI = (submission: Submission) => {
    if (!submission?.id) {
      setTeacherPortalError("This submission does not have a valid Submission ID.");
      return;
    }
    setSubmissionId(String(submission.id));
    setMaxMarks(String(selectedAssignment?.total_marks || 100));
    const checkerTool = TEACHER_TOOLS.find((tool) => tool.id === "assignment-checker");
    if (checkerTool) setSelectedTool(checkerTool);
    setTeacherPortalError("");
    setTeacherOutput(null);
    nav("tool-form");
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
          headers: { "Content-Type": "application/json" },
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
          if (!toolTopic.trim()) throw new Error("Quiz topic is required.");
          result = await api("/api/teacher/quizzes/generate-and-save", { method: "POST", body: JSON.stringify({ teacher_id: user.user_id, class_id: classId, subject: toolSubject, topic: toolTopic, grade_level: selectedTeacherClass?.grade_level || "", question_count: Number(quizCount), difficulty: quizDifficulty }) });
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
    const textbookContext = selectedCurriculumBook && user.role === "teacher"
      ? `Selected textbook: ${selectedCurriculumBook.title}; Grade ${selectedCurriculumBook.grade}; Subject: ${selectedCurriculumBook.subject}; Topic: ${selectedCurriculumTopic || "not selected"}`
      : "";
    fd.append("workspace_context", [selectedSubject ? `Subject: ${selectedSubject}` : "", textbookContext].filter(Boolean).join(" | "));
    if (selectedCurriculumBook && user.role === "teacher") {
      fd.append("curriculum_book_id", String(selectedCurriculumBook.id));
      fd.append("curriculum_topic", selectedCurriculumTopic);
    }
    files.forEach((file) => fd.append("files", file));
    try {
      const response = await fetch(`${API_BASE}/api/agent/chat_multimodal`, { method: "POST", body: fd, signal: controller.signal });
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

  const generateToken = async () => {
    if (!user) return;
    try {
      setTokenLoading(true);
      const data = await api("/api/admin/generate-invitation", { method: "POST", body: JSON.stringify({ admin_id: user.user_id, target_role: tokenRole, institution_mode: user.institution_mode, valid_days: 7 }) });
      await loadAdminTokens();
      alert(`New invitation token: ${data.token}`);
    } catch (e: any) {
      alert(e?.message || "Unable to generate token.");
    } finally {
      setTokenLoading(false);
    }
  };

  const attendancePercentage = useMemo(() => {
    if (!studentAttendance.length) return 0;
    const present = studentAttendance.filter((x) => x.status === "present" || x.status === "late").length;
    return Math.round((present / studentAttendance.length) * 100);
  }, [studentAttendance]);

  const nav = (id: Tab) => { setActiveTab(id); setMobileSidebar(false); };

  const NavButton = ({ id, label, icon: Icon }: { id: Tab; label: string; icon: any }) => (
    <button onClick={() => nav(id)} className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold transition ${activeTab === id ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-100"}`}>
      <Icon className="w-4.5 h-4.5" />{label}
    </button>
  );

  /* ================= STUDENT RENDER FUNCTIONS ================= */

  const renderStudentDashboard = () => {
    const classesList = Array.isArray(studentClasses) ? studentClasses : [];
    const assignmentsList = Array.isArray(studentAssignments) ? studentAssignments : [];
    const quizzesList = Array.isArray(studentQuizzes) ? studentQuizzes : [];

    return (
      <Page>
        <Header 
          title={`Welcome back, ${user?.full_name || "Student"}`} 
          subtitle="Track your classes, assignments, quizzes, and learning progress." 
        />
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Enrolled Classes" value={classesList.length} icon={BookOpen} />
          <StatCard label="Assignments" value={assignmentsList.length} icon={ClipboardList} />
          <StatCard label="Attendance" value={`${attendancePercentage}%`} icon={Clock} />
          <StatCard label="Quizzes" value={quizzesList.length} icon={CheckSquare} />
        </div>

        <div className="grid xl:grid-cols-2 gap-6">
          <SectionCard title="My Classrooms" action={<Button onClick={() => nav("classes")} variant="ghost">View all</Button>}>
            {classesList.length === 0 ? (
              <Empty title="No classrooms joined" text="Join a classroom using your teacher's join code from the classrooms tab." />
            ) : (
              <div className="space-y-3">
                {classesList.slice(0, 4).map((cls: any) => (
                  <div key={cls.id} className="border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900">{cls.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{cls.subject || "General"}</p>
                    </div>
                    <Button variant="ghost" onClick={() => openStudentClass(cls)}>Open</Button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Pending Assignments" action={<Button onClick={() => nav("assignments")} variant="ghost">View all</Button>}>
            {assignmentsList.filter((a: any) => !a.submission_id).length === 0 ? (
              <Empty title="All caught up!" text="You have no pending assignments right now." />
            ) : (
              <div className="space-y-3">
                {assignmentsList.filter((a: any) => !a.submission_id).slice(0, 4).map((a: any) => (
                  <div key={a.id} className="border border-slate-100 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{a.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{a.class_name}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      onClick={() => { 
                        setStudentSelectedAssignment(a); 
                        setStudentAssignmentText(""); 
                        nav("student-assignment"); 
                      }}
                    >
                      Start
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
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
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{assignment.title}</h3><p className="mt-1 text-xs text-slate-500">{assignment.total_marks || 100} marks · Due {assignment.due_date || "date not set"}</p></div><Badge>{assignment.status || (assignment.submission_id ? "Submitted" : "Pending")}</Badge></div>
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
                  <Badge>{a.status || (a.submission_id ? "Submitted" : "Pending")}</Badge>
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
                <Button className="w-full mt-6" onClick={() => openStudentQuiz(q)}>Start Quiz</Button>
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
        <Header title="My Attendance Records" subtitle="Track your daily classroom attendance and overall percentage." />
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
                <div><h3 className="font-black text-slate-900">{t.class_name || t.subject}</h3><p className="text-xs text-slate-500 mt-0.5">{t.day_of_week || "Schedule"} • {t.start_time} - {t.end_time}</p></div>
                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">{t.room || "Room 101"}</span>
              </div>
            ))}
          </div>
        )}
      </Page>
    );
  };

  const renderBrowseSubjects = () => {
    const availableStages = CURRICULUM_STAGES.filter((stage) => pathwayStages.includes(stage.name));
    const stages = (curriculumStage === "All levels"
      ? availableStages
      : availableStages.filter((stage) => stage.name === curriculumStage))
      .map((stage) => ({
        ...stage,
        subjects: stage.subjects.filter((subject) => subject.toLowerCase().includes(search.trim().toLowerCase())),
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
            <div className="mt-6 max-w-xl rounded-2xl border border-white/25 bg-emerald-950/45 p-3 shadow-lg shadow-black/15 backdrop-blur-sm">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wide text-emerald-50">Find a subject</span>
                <span className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 shadow-sm transition focus-within:border-lime-500 focus-within:ring-4 focus-within:ring-lime-200/60">
                  <Search className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search subjects or study groups"
                    aria-label="Find a subject"
                    className="w-full bg-transparent py-3 text-sm font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-600"
                  />
                </span>
              </label>
            </div>
          </div>
        </section>
        <section className="mb-6 flex flex-col gap-4 rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between md:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800"><BookCopy className="h-6 w-6" /></span>
            <div>
              <h2 className="text-lg font-black text-slate-900">Official BTBB textbooks</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {user?.role === "student"
                  ? `Browse books for ${user.institution_mode || "your education level"}${user.institution_mode === "School" ? " (Primer and Grades 1–10)" : user.institution_mode === "College" ? " (Grades 11–12)" : ""}.`
                  : "Browse the official textbook catalogue and open available e-books in this workspace."}
              </p>
            </div>
          </div>
          <Button
            className="shrink-0"
            onClick={() => {
              setSelectedSubject("");
              void loadCurriculumBooks("");
              nav("subject-view");
            }}
          >
            <BookCopy className="h-4 w-4" />Browse official textbooks
          </Button>
        </section>
        <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Filter curriculum by stage">
          {["All levels", ...availableStages.map((stage) => stage.name)].map((stage) => (
            <button key={stage} onClick={() => setCurriculumStage(stage)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${curriculumStage === stage ? "bg-emerald-800 text-white shadow-sm" : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-900"}`}>
              {stage}
            </button>
          ))}
        </div>
        <div className="mb-7 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <AlertCircle className="mt-1 h-4 w-4 shrink-0 text-amber-700" />
          <p>This guide is a learning overview. Subject availability and course requirements vary by institution; confirm the current syllabus with your school, board, college or university.</p>
        </div>
        <div className="space-y-6">
          {stages.length === 0 && <Empty title="No matching subjects" text="Try another subject name or curriculum stage." />}
          {stages.map((stage) => (
            <section key={stage.name} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
              <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-white to-emerald-50/70 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-800 text-sm font-black text-white shadow-md shadow-emerald-900/15">0{CURRICULUM_STAGES.findIndex((item) => item.name === stage.name) + 1}</span>
                  <div><h2 className="text-xl font-black text-slate-900 md:text-2xl">{stage.name}</h2><p className="mt-1 text-sm font-semibold text-emerald-800">{stage.grades}</p></div>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">{stage.description}</p>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5 xl:grid-cols-3">
                {stage.subjects.map((subject) => (
                  <button key={subject} onClick={() => {
                    const grade = stage.name === "Middle" ? 6 : stage.name === "Secondary" ? 9 : stage.name === "Higher Secondary" ? 11 : stage.name === "University" ? "" : 1;
                    setSelectedSubject(subject);
                    setSelectedCurriculumGrade(String(grade));
                    void loadCurriculumBooks(grade);
                    nav("subject-view");
                  }} className="group flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/60 hover:shadow-md">
                    <span className="text-sm font-bold leading-5 text-slate-800">{subject}</span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition group-hover:bg-emerald-800 group-hover:text-white"><ArrowLeft className="h-4 w-4 rotate-180" /></span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
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

  /* Fallbacks for staff/admin tabs */
  const renderDirectoryTable = (type: string) => <Page><Header title={`${type} Directory`} /><Empty title="Directory" text={`No ${type} records.`} /></Page>;
  const renderDepartmentsView = () => <Page><Header title="Departments" /><Empty title="Departments" text="No departments." /></Page>;
  const renderAllClassesView = () => {
    const query = staffClassSearch.trim().toLowerCase();
    const visibleClasses = staffClasses.filter((classroom) =>
      [classroom.name, classroom.subject, classroom.teacher_name, classroom.institution_mode, classroom.grade_level]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
    return (
      <Page>
        <Header title="Classroom oversight" subtitle="Review active classrooms, their teachers, and enrollment. Invite codes are not shown in staff view." action={<Button variant="ghost" onClick={() => void loadStaffClasses()}><RefreshCw className="h-4 w-4" />Refresh</Button>} />
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
      <Header title="Institution notices" subtitle="Share verified school-wide updates with students and teachers." />
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

  const renderSidebar = () => {
    if (!user) return null;
    return (
      <>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm"><GraduationCap className="w-5 h-5" /></div>
            <div><h1 className="font-black text-lg text-slate-900">BALOCHISTAN ACADMY</h1><p className="text-[10px] uppercase font-black tracking-wider text-slate-400">{user.role === "superadmin" ? "Super Admin" : user.role} Portal</p></div>
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
            <NavButton id="chat" label="AI Learning Assistant" icon={Sparkles} />
          </div>}
          {user.role === "staff" && <div className="space-y-1">
            <NavButton id="dashboard" label="Operations Hub" icon={LayoutGrid} />
            <NavButton id="classes" label="Classroom Oversight" icon={GraduationCap} />
            <NavButton id="announcements" label="Institution Notices" icon={Megaphone} />
            <NavButton id="reports" label="Reports" icon={BarChart3} />
            <NavButton id="browse-subjects" label="Curriculum" icon={BookCopy} />
            <NavButton id="attendance" label="Attendance" icon={Clock} />
            <NavButton id="chat" label="AI Assistant" icon={Sparkles} />
          </div>}
          {user.role === "superadmin" && <div className="space-y-1">
            <NavButton id="dashboard" label="Admin Dashboard" icon={ShieldCheck} />
            <NavButton id="classes" label="Classroom Oversight" icon={GraduationCap} />
            <NavButton id="announcements" label="Institution Notices" icon={Megaphone} />
            <NavButton id="tokens" label="Invitation Tokens" icon={Key} />
            <NavButton id="reports" label="System Reports" icon={BarChart3} />
            <NavButton id="browse-subjects" label="Curriculum" icon={BookCopy} />
            <NavButton id="chat" label="AI Admin Assistant" icon={Sparkles} />
          </div>}
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black overflow-hidden shrink-0 border border-slate-200">
              {user.profile_pic ? (
                <img
                  src={user.profile_pic.startsWith("http") ? user.profile_pic : `${API_BASE}${user.profile_pic}`}
                  alt={user.full_name}
                  className="w-full h-full object-cover object-top"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                user.full_name?.[0]?.toUpperCase() || "U"
              )}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[["Students", teacherSummary?.students || teacherStudents.length, Users], ["Classes", teacherSummary?.classes || teacherClasses.length, GraduationCap], ["Assignments", teacherSummary?.assignments || teacherAssignments.length, ClipboardList], ["Pending", teacherSummary?.pending_submissions || 0, FileCheck2]].map(([label, value, Icon]: any) => <StatCard key={label} label={label} value={value} icon={Icon} />)}
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
        {[["Lesson Plan", "lesson-plan", BookOpen], ["Generate Quiz", "quiz-generator", CheckSquare], ["Rubric", "rubric-generator", Target], ["AI Assistant", "chat-gpt", Sparkles]].map(([label, id, Icon]: any) => {
          const tool = TEACHER_TOOLS.find((x) => x.id === id)!;
          return <button key={id} onClick={() => openTeacherTool(tool)} className="bg-white border border-slate-200 rounded-2xl p-5 text-left shadow-sm hover:shadow-md hover:border-blue-200 transition"><Icon className="w-6 h-6 text-blue-600 mb-4" /><p className="font-black text-slate-900">{label}</p><p className="text-xs text-slate-400 mt-1">Open tool</p></button>;
        })}
      </div>
      <div className="grid xl:grid-cols-2 gap-6 mt-6">
        <SectionCard title="My Classrooms" action={<Button onClick={() => nav("classes")} variant="ghost">View all</Button>}>
          {teacherClasses.length === 0 ? <Empty title="No classrooms yet" text="Create your first classroom to connect students." action={<Button onClick={() => setIsCreatingClass(true)}><Plus className="w-4 h-4" />Create Classroom</Button>} /> : <div className="grid md:grid-cols-2 gap-4">{teacherClasses.slice(0, 6).map((cls) => <button key={cls.id} onClick={() => void openTeacherClass(cls)} className="text-left border border-slate-200 rounded-2xl p-4 hover:border-blue-200 hover:shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-900">{cls.name}</h3><p className="text-sm text-slate-500 mt-1">{cls.subject || "General"}</p></div><span className="text-[11px] font-black px-2 py-1 rounded-full bg-blue-50 text-blue-700">{cls.student_count || 0}</span></div><div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400 font-black">JOIN CODE</p><p className="font-mono font-black mt-1 tracking-widest">{cls.join_code}</p></div></button>)}</div>}
        </SectionCard>
        <SectionCard title="Recent Assignments" action={<Button onClick={() => nav("assignments")} variant="ghost">View all</Button>}>
          {teacherAssignments.length === 0 ? <Empty title="No assignments" text="Create an assignment for your classes." /> : <div className="space-y-2">{teacherAssignments.slice(0, 6).map((a) => <button key={a.id} onClick={() => loadSubmissions(a)} className="w-full text-left border border-slate-100 rounded-xl p-4 hover:bg-slate-50"><div className="flex items-center justify-between gap-3"><div><p className="font-bold text-slate-900">{a.title}</p><p className="text-xs text-slate-400 mt-1">{a.class_name || "Class"}</p></div><span className="text-xs font-bold text-slate-500">{a.submission_count || 0} submissions</span></div></button>)}</div>}
        </SectionCard>
      </div>
    </Page>
  );


  const renderTeacherClasses = () => (
    <Page>
      <Header title="My Classrooms" subtitle="Create classes, copy join codes and manage connected students." action={<Button onClick={() => setIsCreatingClass(true)}><Plus className="w-4 h-4" />Create Classroom</Button>} />
      {teacherPortalError && <AlertBox tone="error">{teacherPortalError}</AlertBox>}
      {isCreatingClass && <Modal title="Create Classroom" onClose={() => setIsCreatingClass(false)}>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Class Name" value={newClass.name} onChange={(v: string) => setNewClass({ ...newClass, name: v })} placeholder="e.g. Web Development" />
          <SelectField label="Subject" value={newClass.subject} onChange={(v: string) => setNewClass({ ...newClass, subject: v })} options={["", ...SUBJECTS]} />
          <SelectField label="Grade / Level" value={newClass.grade_level} onChange={(v: string) => setNewClass({ ...newClass, grade_level: v })} options={["|Choose a grade or level", ...CLASS_GRADE_OPTIONS]} />
          <Field label="Section" value={newClass.section} onChange={(v: string) => setNewClass({ ...newClass, section: v })} placeholder="A" />
          <Field label="Course Code" value={newClass.course_code} onChange={(v: string) => setNewClass({ ...newClass, course_code: v })} placeholder="CS-401" />
          <Field label="Description" value={newClass.description} onChange={(v: string) => setNewClass({ ...newClass, description: v })} placeholder="Short class description" />
        </div>
        <div className="flex justify-end gap-3 mt-6"><Button variant="ghost" onClick={() => setIsCreatingClass(false)}>Cancel</Button><Button onClick={createTeacherClass} disabled={teacherPortalLoading}>{teacherPortalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Create</Button></div>
      </Modal>}
      {teacherClasses.length === 0 ? <Empty title="No classrooms created" text="Create a classroom and share its join code with students." action={<Button onClick={() => setIsCreatingClass(true)}><Plus className="w-4 h-4" />Create Classroom</Button>} /> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{teacherClasses.map((cls) => <div key={cls.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm"><div className="flex items-start justify-between"><div><div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mb-4"><GraduationCap className="w-5 h-5" /></div><h2 className="text-xl font-black text-slate-900">{cls.name}</h2><p className="text-sm text-slate-500 mt-1">{cls.subject || "General Subject"}</p></div><span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-black">{cls.student_count || 0} students</span></div><div className="grid grid-cols-2 gap-3 mt-5 text-sm"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400 font-black">SECTION</p><p className="font-bold mt-1">{cls.section || "—"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400 font-black">COURSE CODE</p><p className="font-bold mt-1">{cls.course_code || "—"}</p></div></div><div className="mt-4 rounded-xl border border-dashed border-blue-200 bg-blue-50 p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] text-blue-500 font-black">CLASS INVITE CODE</p><p className="font-mono font-black text-blue-800 tracking-widest mt-1">{cls.join_code}</p></div><button aria-label={`Copy invite code for ${cls.name}`} onClick={() => { void navigator.clipboard?.writeText(cls.join_code).then(() => alert("Invite code copied.")); }} className="p-2 rounded-lg bg-white text-blue-700"><Copy className="w-4 h-4" /></button></div></div><div className="mt-4 flex gap-2"><Button className="flex-1" onClick={() => void openTeacherClass(cls)}>Manage classroom</Button><Button variant="ghost" onClick={() => void updateJoinAccess(cls)}>{cls.is_active ? "Pause joins" : "Reopen joins"}</Button></div></div>)}</div>}
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
        <SectionCard title="Students" className="lg:col-span-2"><div className="grid md:grid-cols-2 gap-3">{teacherClassStudents.length === 0 ? <Empty title="No connected students" text="Students can join using the classroom code." /> : teacherClassStudents.map((s: any) => <div key={s.id} className="border border-slate-200 rounded-2xl p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-700">{s.full_name?.[0]?.toUpperCase() || "S"}</div><div className="min-w-0 flex-1"><p className="font-bold truncate">{s.full_name}</p><p className="text-xs text-slate-400 truncate">{s.email}</p></div><button onClick={() => removeStudent(selectedTeacherClass.id, s.id)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button></div>)}</div></SectionCard>
      </div>
      <SectionCard title="Class Assignments" className="mt-6"><div className="space-y-2">{teacherAssignments.filter((x) => Number(x.class_id) === Number(selectedTeacherClass.id)).map((a) => <div key={a.id} className="border border-slate-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"><div><p className="font-bold">{a.title}</p><p className="text-xs text-slate-400 mt-1">{a.submission_count || 0} submissions • {a.total_marks} marks</p></div><Button variant="ghost" onClick={() => loadSubmissions(a)}>View submissions</Button></div>)}{teacherAssignments.filter((x) => Number(x.class_id) === Number(selectedTeacherClass.id)).length === 0 && <p className="text-sm text-slate-500">No assignments for this classroom.</p>}</div></SectionCard>
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

  const renderTeacherAssignments = () => (
    <Page>
      <Header title="Assignments" subtitle="Create assignments and open student submissions for grading." action={<Button onClick={() => setIsCreatingAssignment(true)}><Plus className="w-4 h-4" />Create Assignment</Button>} />
      {teacherPortalError && <AlertBox tone="error">{teacherPortalError}</AlertBox>}
      {isCreatingAssignment && <Modal title="Create Assignment" onClose={() => setIsCreatingAssignment(false)}><div className="space-y-4"><SelectField label="Classroom" value={newAssignment.class_id} onChange={(v: string) => setNewAssignment({ ...newAssignment, class_id: v })} options={["", ...teacherClasses.map((x) => `${x.id}|${x.name}`)]} optionLabels={["Select classroom", ...teacherClasses.map((x) => x.name)]} /><Field label="Title" value={newAssignment.title} onChange={(v: string) => setNewAssignment({ ...newAssignment, title: v })} placeholder="Assignment title" /><TextAreaField label="Description / Instructions" value={newAssignment.description} onChange={(v: string) => setNewAssignment({ ...newAssignment, description: v })} rows={6} /><div className="grid md:grid-cols-2 gap-4"><Field label="Due Date" type="datetime-local" value={newAssignment.due_date} onChange={(v: string) => setNewAssignment({ ...newAssignment, due_date: v })} /><Field label="Total Marks" type="number" value={newAssignment.total_marks} onChange={(v: string) => setNewAssignment({ ...newAssignment, total_marks: v })} /></div></div><div className="flex justify-end gap-3 mt-6"><Button variant="ghost" onClick={() => setIsCreatingAssignment(false)}>Cancel</Button><Button onClick={createAssignment} disabled={teacherPortalLoading}>Create Assignment</Button></div></Modal>}
      {teacherAssignments.length === 0 ? <Empty title="No assignments yet" text="Create your first assignment." action={<Button onClick={() => setIsCreatingAssignment(true)}><Plus className="w-4 h-4" />Create Assignment</Button>} /> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{teacherAssignments.map((a) => <div key={a.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm"><div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><ClipboardList className="w-5 h-5" /></div><h2 className="text-xl font-black mt-5">{a.title}</h2><p className="text-sm text-slate-500 mt-1">{a.class_name || "Class"}</p><p className="text-sm text-slate-600 mt-4 line-clamp-3">{a.description || "No description provided."}</p><div className="grid grid-cols-2 gap-3 mt-5"><div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-black text-slate-400">MARKS</p><p className="font-black mt-1">{a.total_marks}</p></div><div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-black text-slate-400">SUBMISSIONS</p><p className="font-black mt-1">{a.submission_count || 0}</p></div></div><Button className="w-full mt-5" onClick={() => loadSubmissions(a)}>Open Submissions</Button></div>)}</div>}
    </Page>
  );

const renderTeacherQuizzes = () => (
    <Page>
      <Header 
        title="Classroom Quizzes" 
        subtitle="View quizzes generated for your classes and monitor student quiz attempts." 
        action={
          <Button onClick={() => openTeacherTool(TEACHER_TOOLS.find(t => t.id === "quiz-generator")!)}>
            <Sparkles className="w-4 h-4" /> Generate New Quiz via AI
          </Button>
        } 
      />
      {teacherPortalError && <AlertBox tone="error">{teacherPortalError}</AlertBox>}
      
      {teacherQuizzes.length === 0 ? (
        <Empty 
          title="No quizzes created yet" 
          text="Use the Teacher AI Tools to generate interactive quizzes for your classrooms." 
          action={
            <Button onClick={() => openTeacherTool(TEACHER_TOOLS.find(t => t.id === "quiz-generator")!)}>
              <Sparkles className="w-4 h-4" /> Go to Quiz Generator
            </Button>
          } 
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
                        <Button variant="ghost" onClick={async () => {
                          await api("/api/attendance", {
                            method: "POST",
                            body: JSON.stringify({
                              teacher_id: user?.user_id,
                              class_id: selectedTeacherClass.id,
                              student_id: student.id,
                              attendance_date: new Date().toISOString().slice(0, 10),
                              status: "present"
                            })
                          });
                          alert(`Marked Present for ${student.full_name}`);
                        }}>Present</Button>
                        <Button variant="ghost" onClick={async () => {
                          await api("/api/attendance", {
                            method: "POST",
                            body: JSON.stringify({
                              teacher_id: user?.user_id,
                              class_id: selectedTeacherClass.id,
                              student_id: student.id,
                              attendance_date: new Date().toISOString().slice(0, 10),
                              status: "absent"
                            })
                          });
                          alert(`Marked Absent for ${student.full_name}`);
                        }}>Absent</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
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
              {submissions.map((s: any) => (
                <div key={s.id} className="p-6 hover:bg-slate-50 transition">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-black text-lg shrink-0">{s.student_name?.[0]?.toUpperCase() || "S"}</div>
                      <div className="min-w-0"><p className="font-black text-slate-900 text-base">{s.student_name || "Unknown Student"}</p><p className="text-sm text-slate-500 mt-1">{s.email || "No email available"}</p><p className="text-xs text-slate-400 mt-2">Submitted on {prettyDate(s.submitted_at)}</p></div>
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
                      {s.file_name && (
                        <a 
                          href={s.file_name.startsWith("http") ? s.file_name : `${API_BASE}${s.file_name}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-black transition"
                        >
                          <Download className="w-4 h-4" /> Download Attached File
                        </a>
                      )}
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5">{s.text_content ? <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{s.text_content}</p> : <div className="flex items-center gap-2 text-sm text-slate-400 italic"><FileText className="w-4 h-4" />No written submission content available.</div>}</div>
                  </div>
              
                  {s.feedback && <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /><p className="text-xs font-black uppercase tracking-wider text-green-700">Existing Feedback</p></div><p className="text-sm leading-6 text-green-800 mt-2 whitespace-pre-wrap">{s.feedback}</p></div>}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 pt-5 border-t border-slate-100"><div className="text-xs text-slate-400">Database Submission ID: <span className="font-mono font-black text-slate-600">#{s.id}</span></div><div className="flex flex-wrap items-center gap-2"><Button variant="ghost" onClick={() => openSubmissionForAI(s)}><Sparkles className="w-4 h-4" />Check with AI</Button><Button variant="ghost" onClick={() => openGradeModal(s)}><CheckCircle2 className="w-4 h-4" />Grade</Button></div></div>
                </div>
              ))}
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
    const filtered = TEACHER_TOOLS.filter((tool) => `${tool.title} ${tool.description} ${tool.category}`.toLowerCase().includes(search.toLowerCase()));
    return <Page><Header title="Teacher Tools" subtitle="Your AI teaching toolkit for planning, assessment and communication." /><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">{filtered.map((tool) => <button key={tool.id} onClick={() => openTeacherTool(tool)} className="bg-white border border-slate-200 rounded-3xl p-6 text-left shadow-sm hover:shadow-md hover:border-blue-200 transition"><div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center"><WandSparkles className="w-6 h-6" /></div><div className="mt-5"><span className="text-[10px] uppercase font-black tracking-wider text-blue-600">{tool.category}</span><h3 className="text-lg font-black mt-2">{tool.title}</h3><p className="text-sm text-slate-500 mt-2 leading-6">{tool.description}</p></div></button>)}</div></Page>;
  };

  const renderTeacherToolForm = () => {
    
    const tool = selectedTool;
    if (!tool) return <Empty title="No tool selected" text="Choose a teacher tool first." />;
    return <Page><button onClick={() => nav("tools")} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 mb-5"><ArrowLeft className="w-4 h-4" />Back to tools</button><Header title={tool.title} subtitle={tool.subtitle} /><div className="grid xl:grid-cols-[420px_1fr] gap-6"><SectionCard title="Tool Inputs"><div className="space-y-4"><SelectField label="Classroom" value={selectedTeacherClass?.id ? String(selectedTeacherClass.id) : ""} onChange={(v: string) => { const c = teacherClasses.find((x) => String(x.id) === v); setSelectedTeacherClass(c || null); if (c) loadClassStudents(c.id); }} options={["", ...teacherClasses.map((c) => String(c.id))]} optionLabels={["No specific classroom", ...teacherClasses.map((c) => c.name)]} /><SelectField label="Subject" value={toolSubject} onChange={setToolSubject} options={["", ...SUBJECTS]} />
        {(tool.id === "lesson-plan" || tool.id === "quiz-generator" || tool.id === "activity-generator" || tool.id === "differentiation" || tool.id === "exit-ticket" || tool.id === "chunk-text" || tool.id === "clear-directions" || tool.id === "real-world") && <><Field label="Topic" value={toolTopic} onChange={setToolTopic} placeholder="Topic / content area" /><TextAreaField label="Learning Objective / Text" value={learningObjective || toolText} onChange={(v: string) => { setLearningObjective(v); setToolText(v); }} rows={5} placeholder="Describe the learning goal or paste the content..." /></>}
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
        <Button onClick={runTeacherTool} disabled={teacherPortalLoading} className="w-full">{teacherPortalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Generate</Button>
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
                              headers: { "Content-Type": "application/json" },
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

  const renderTeacherResources = () => <Page><Header title="Resources" subtitle="Saved resources returned by the teacher resource endpoint." /><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{teacherResources.length === 0 ? <Empty title="No resources yet" text="Generated teacher resources will appear here when the backend provides them." /> : teacherResources.map((r: any) => <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-5"><div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><FileText className="w-5 h-5" /></div><h3 className="font-black mt-4">{r.title}</h3><p className="text-xs text-slate-400 mt-1">{r.resource_type}</p><p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap line-clamp-6">{r.content}</p></div>)}</div></Page>;

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
            current_password: changePassword ? currentPassword : undefined,
            new_password: changePassword ? newPassword : undefined,
          }),
        });

        const updatedUser = { ...user, full_name: res.full_name };
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
                {user.profile_pic ? (
                  <img
                    src={`${user.profile_pic.startsWith("http") ? "" : API_BASE}${user.profile_pic}${user.profile_pic.includes("?") ? "&" : "?"}v=${encodeURIComponent(user.profile_pic)}`}
                    alt={`${user.full_name}'s profile`}
                    className="h-full w-full object-cover object-center"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-white/10 text-4xl font-black text-white">{user.full_name?.[0]?.toUpperCase() || "U"}</span>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="user"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files?.[0]) void handleAvatarChange(event.target.files[0]);
                  event.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
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
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold">Member #{user.user_id}</span>
              </div>
              {profileData?.total_classes !== undefined && (
                <p className="mt-3 text-xs font-semibold text-emerald-50/85">
                  {profileData.total_classes} {profileData.total_classes === 1 ? "connected class" : "connected classes"}
                </p>
              )}
              <p className="mt-3 text-xs text-emerald-100/75">JPG, PNG, or WebP · Up to 10 MB · Photos are centered and cropped to fit.</p>
            </div>
          </div>
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
          <SectionCard title="Personal information" className="border-slate-200/80 shadow-md shadow-slate-900/[0.03]">
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div>
                <p className="mb-4 text-sm leading-6 text-slate-500">Keep your name up to date so teachers and classmates can recognize you.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" value={profileName} onChange={setProfileName} placeholder="Enter your first and last name" />
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Email address</span>
                    <input type="email" readOnly value={user.email} autoComplete="email" className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600" />
                    <span className="mt-1.5 block text-xs text-slate-400">Contact support if your email needs to change.</span>
                  </label>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-400">Your email is used for account sign-in.</p>
                <Button disabled={profileLoading} className="min-w-40">
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
              <Button disabled={profileLoading} className="w-full">
                {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Save account settings
              </Button>
            </form>
          </SectionCard>
        </div>
      </Page>
    );
  };

  const renderStaffDashboard = () => <Page><Header title={`Welcome back, ${user?.full_name || "Staff"}`} subtitle="Manage operational work with AI support for reports, communication and planning." /><div className="grid md:grid-cols-3 gap-5">{[["AI Assistant", "chat", Sparkles], ["Reports", "reports", BarChart3], ["Operational Tools", "chat", Settings]].map(([title, tab, Icon]: any) => <button key={title} onClick={() => nav(tab)} className="bg-white border border-slate-200 rounded-3xl p-6 text-left hover:shadow-md"><Icon className="w-7 h-7 text-blue-600 mb-4" /><h3 className="font-black text-lg">{title}</h3><p className="text-sm text-slate-500 mt-1">Open workspace</p></button>)}</div><SectionCard title="Staff AI Tools" className="mt-6"><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{STAFF_TOOLS.map((tool) => <button key={tool.id} onClick={() => { setSelectedTool(tool); nav("chat"); setMessages([{ sender: "assistant", content: `I am ready to help with ${tool.title}. Describe the task you need completed.` }]); }} className="border border-slate-200 rounded-2xl p-4 text-left hover:border-blue-200"><p className="font-bold">{tool.title}</p><p className="text-xs text-slate-500 mt-1">{tool.description}</p></button>)}</div></SectionCard></Page>;
  const renderSuperAdminDashboard = () => <Page><Header title={`Super Admin Dashboard`} subtitle="Manage registration access and use the AI admin assistant." action={<Button onClick={loadAdminTokens} variant="dark"><RefreshCw className="w-4 h-4" />Refresh</Button>} /><div className="grid md:grid-cols-3 gap-5"><StatCard label="Invitation Tokens" value={generatedTokens.length} icon={Key} /><StatCard label="Active Tokens" value={generatedTokens.filter((x) => !x.is_used).length} icon={ShieldCheck} /><StatCard label="Institution Mode" value={user?.institution_mode || "—"} icon={GraduationCap} /></div><div className="grid md:grid-cols-2 gap-5 mt-6"><button onClick={() => nav("tokens")} className="bg-white border border-slate-200 rounded-3xl p-6 text-left hover:shadow-md"><Key className="w-7 h-7 text-blue-600" /><h3 className="font-black text-lg mt-4">Invitation Management</h3><p className="text-sm text-slate-500 mt-1">Generate Teacher and Staff signup tokens.</p></button><button onClick={() => nav("chat")} className="bg-white border border-slate-200 rounded-3xl p-6 text-left hover:shadow-md"><Sparkles className="w-7 h-7 text-purple-600" /><h3 className="font-black text-lg mt-4">Admin AI Assistant</h3><p className="text-sm text-slate-500 mt-1">Draft policies, analyze supplied audit information and more.</p></button></div></Page>;
  const renderReports = () => <Page><Header title="Reports" subtitle="This workspace is ready for report data exposed by your backend." /><Empty title="Report workspace" text={user?.role === "staff" ? "Use the Staff AI tools to generate and analyze reports from supplied institutional data." : "Use the AI Admin Assistant for analysis and policy drafting."} action={<Button onClick={() => nav("chat")}><Sparkles className="w-4 h-4" />Open AI Assistant</Button>} /></Page>;
  const renderTokens = () => <Page><Header title="Institution Registration Tokens" subtitle="Generate authorized invitation codes for Teacher and Staff registration." action={<Button onClick={generateToken} disabled={tokenLoading}>{tokenLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}Generate Token</Button>} /><div className="flex items-center gap-3 mb-6"><select value={tokenRole} onChange={(e) => setTokenRole(e.target.value as any)} className="border border-slate-200 rounded-xl px-4 py-3 bg-white font-bold"><option value="teacher">Teacher</option><option value="staff">Staff</option></select></div><SectionCard title={`Generated Tokens (${generatedTokens.length})`}>{generatedTokens.length === 0 ? <Empty title="No tokens yet" text="Generate a token to authorize a Teacher or Staff signup." /> : <div className="divide-y">{generatedTokens.map((t) => <div key={t.id} className="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"><div><span className="inline-flex px-2 py-1 rounded-full bg-slate-100 text-xs font-black uppercase">{t.role}</span><p className="font-mono font-black tracking-wider mt-2">{t.token}</p><p className="text-xs text-slate-400 mt-1">{prettyDate(t.created_at)} • {t.institution_mode}</p></div><div className="flex items-center gap-2"><Badge>{t.is_used ? `Used by ${t.used_by_name || "User"}` : "Active / Unused"}</Badge><button onClick={() => { navigator.clipboard?.writeText(t.token); alert("Token copied."); }} className="p-2 rounded-lg border border-slate-200"><Copy className="w-4 h-4" /></button></div></div>)}</div>}</SectionCard></Page>;

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
    return <AuthScreen authMode={authMode} setAuthMode={setAuthMode} fullName={fullName} setFullName={setFullName} email={email} setEmail={setEmail} password={password} setPassword={setPassword} confirmPassword={resetConfirmPassword} setConfirmPassword={setResetConfirmPassword} selectedRole={selectedRole} setSelectedRole={setSelectedRole} selectedInstitution={selectedInstitution} setSelectedInstitution={setSelectedInstitution} invitationCode={invitationCode} setInvitationCode={setInvitationCode} termsAccepted={termsAccepted} setTermsAccepted={setTermsAccepted} loading={authLoading} error={authError} success={authSuccess} onSubmit={handleAuth} />;
  }

  let content: React.ReactNode;
  if (activeTab === "chat") content = renderChat();
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
      activeTab === "browse-subjects" ? renderBrowseSubjects() :
      activeTab === "subject-view" ? renderSubjectView() :
      activeTab === "classes" ? renderAllClassesView() :
      renderChat();
  } else {
    content = 
      activeTab === "dashboard" ? renderSuperAdminDashboard() : 
      activeTab === "tokens" ? renderTokens() : 
      activeTab === "reports" ? renderReports() : 
      ["students", "teachers", "staff"].includes(activeTab) ? renderDirectoryTable(activeTab) :
      activeTab === "departments" ? renderDepartmentsView() :
      activeTab === "announcements" ? renderStaffAnnouncements() :
      activeTab === "browse-subjects" ? renderBrowseSubjects() :
      activeTab === "subject-view" ? renderSubjectView() :
      activeTab === "classes" ? renderAllClassesView() :
      renderChat();
  }

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex overflow-hidden">
      <aside
        className={`fixed z-40 inset-y-0 left-0 w-[285px] bg-white border-r border-slate-200 flex flex-col transform transition-transform md:static md:translate-x-0 ${
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

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="md:hidden h-14 bg-white border-b border-slate-200 flex items-center px-4">
          <button
            onClick={() => setMobileSidebar(true)}
            className="p-2 rounded-xl hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-black ml-3">BALOCHISTAN ACADMY</span>
        </div>

        <div
          className={`flex-1 min-w-0 ${
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
  const subtitle = props.authMode === "login" ? "Sign in to continue to your learning workspace." : props.authMode === "register" ? "Create an account for your Balochistan Acadmy learning workspace." : props.authMode === "forgot" ? "Enter your account email and we will send a secure reset link." : "Use at least 8 characters for your new password.";

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
                <button key={mode} type="button" onClick={() => props.setAuthMode(mode)} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition ${props.authMode === mode ? "bg-white text-[#14573f] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
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
              <Field label="Full Name" value={props.fullName} onChange={props.setFullName} placeholder="Your full name" />
              <SelectField label="Role" value={props.selectedRole} onChange={props.setSelectedRole} options={["student", "teacher", "staff"]} />
              <SelectField label={props.selectedRole === "student" ? "Education level" : "Institution"} value={props.selectedInstitution} onChange={props.setSelectedInstitution} options={["School", "College", "University"]} />
              {(props.selectedRole === "teacher" || props.selectedRole === "staff") && <Field label="Invitation Code" value={props.invitationCode} onChange={props.setInvitationCode} placeholder="Provided by your administrator" />}
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

function Page({ children }: { children: React.ReactNode }) { return <div className="max-w-7xl mx-auto p-5 md:p-8 lg:p-10 pb-16">{children}</div>; }
function Header({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) { return <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-7"><div><h1 className="text-3xl md:text-4xl font-black tracking-tight">{title}</h1>{subtitle && <p className="text-slate-500 mt-2 max-w-3xl">{subtitle}</p>}</div>{action}</div>; }
function SectionCard({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) { return <section className={`bg-white border border-slate-200 rounded-3xl shadow-sm p-6 ${className}`}><div className="flex items-center justify-between gap-3 mb-5"><h2 className="text-lg font-black">{title}</h2>{action}</div>{children}</section>; }
function StatCard({ label, value, icon: Icon }: any) { return <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><Icon className="w-5 h-5 text-blue-600" /><p className="text-2xl font-black mt-4">{value}</p><p className="text-sm text-slate-500 mt-1">{label}</p></div>; }
function Button({ children, onClick, variant = "primary", disabled = false, className = "" }: any) {
  const variants: Record<string, string> = {
    primary: "bg-[#167250] text-white shadow-sm hover:bg-[#125c40] hover:shadow-md",
    secondary: "border border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-100",
    ghost: "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm",
    dark: "bg-slate-900 text-white shadow-sm hover:bg-slate-800 hover:shadow-md",
  };
  const buttonVariant = variants[variant] || variants.primary;
  return <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${buttonVariant} ${className}`}>{children}</button>;
}
function Badge({ children }: { children: React.ReactNode }) { return <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-black">{children}</span>; }
function AlertBox({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "success" | "info" }) { const cls = tone === "error" ? "bg-red-50 border-red-200 text-red-700" : tone === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-blue-50 border-blue-200 text-blue-700"; return <div className={`mb-5 border rounded-2xl px-4 py-3 text-sm ${cls}`}>{children}</div>; }
function InfoStrip({ children }: { children: React.ReactNode }) { return <AlertBox tone="info"><div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{children}</div></AlertBox>; }
function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) { return <div className="py-12 text-center"><div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center mx-auto"><BookOpen className="w-6 h-6" /></div><h3 className="font-black mt-4 text-slate-900">{title}</h3><p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{text}</p>{action && <div className="mt-5">{action}</div>}</div>; }
function Field({ label, value, onChange, placeholder = "", type = "text" }: any) { return <label className="block"><span className="block text-xs font-black uppercase tracking-wide text-slate-500 mb-2">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" /></label>; }
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
function Modal({ title, onClose, children }: any) { return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl"><div className="flex items-center justify-between px-6 py-5 border-b border-slate-100"><h2 className="text-xl font-black">{title}</h2><button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button></div><div className="p-6">{children}</div></div></div>; }

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
                      const isCorrect =
                        opt === q.answer ||
                        opt.startsWith(q.answer) ||
                        (q.answer && q.answer.startsWith(opt.charAt(0)));

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
