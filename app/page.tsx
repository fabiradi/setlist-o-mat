"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Euro,
  FileMusic,
  Filter,
  KeyRound,
  Construction,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Headphones,
  ListMusic,
  ListPlus,
  Lock,
  LogOut,
  MessageCircle,
  Music2,
  Pencil,
  Play,
  Plus,
  Power,
  Printer,
  RefreshCw,
  Search,
  Settings,
  Shuffle,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import rawPieces from "./data/pieces.json";
import { getSupabaseBrowserClient } from "./lib/supabase";

type Piece = {
  id: number;
  title: string;
  composer: string;
  durationSeconds: number;
  grade: number;
  priceCents: number;
  owned: boolean;
  genres: string[];
  sampleUrl: string | null;
  youtubeId: string | null;
  purchaseUrl: string | null;
  soloStatus: "unknown" | "none" | "available";
  solos: string | null;
  source: string;
  subtitle: string | null;
  note: string | null;
};
type Rating = { stars: number | null; skipped: boolean; comment: string };
type View = "home" | "pieces" | "setlists" | "admin";
type SetlistState = "draft" | "published" | "finalist" | "final";
type SetlistFilter = "all" | "finalists" | "mine" | "mine-published";
type PieceSort = "title" | "own-desc" | "group-desc" | "frequency-desc";
type SetlistSort = "rating-desc" | "progress-desc" | "agreement-desc" | "name";
type SetlistReview = {
  userId: string;
  author: string;
  stars: number;
  comment: string;
};
type Setlist = {
  id: number | string;
  name: string;
  ownerId: string | null;
  owner: string;
  pieceIds: number[];
  state: SetlistState;
  rating: number;
  ratingCount: number;
  comments: number;
  reviews: SetlistReview[];
};
type SetlistRating = { stars: number; comment: string };
type GroupRating = {
  average: number;
  count: number;
  comments: { author: string; text: string }[];
};
type Member = {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  lastSeenAt: string | null;
  ratingsCompleted: number;
};
type AllowedEmail = { email: string; displayName: string | null };
type AdminPiecePatch = Pick<
  Piece,
  | "title"
  | "subtitle"
  | "composer"
  | "genres"
  | "sampleUrl"
  | "purchaseUrl"
  | "soloStatus"
  | "solos"
  | "durationSeconds"
  | "grade"
  | "priceCents"
  | "owned"
  | "source"
  | "note"
>;
type MaintenanceStatus = {
  enabled: boolean;
  message: string;
  startedAt: string | null;
};
type SetlistSaveState = "idle" | "saving" | "saved" | "error";
type PendingSetlistSave = {
  setlistId: string;
  name: string;
  pieceIds: string[];
  publish: boolean;
};
type AppRoute = {
  view: View;
  pieceId: number | null;
  setlistId: number | string | null;
  editSetlist: boolean;
  search: string;
  genre: string;
  onlyOpen: boolean;
  pieceSort: PieceSort;
  setlistFilter: SetlistFilter;
  setlistSort: SetlistSort;
};
type YouTubePlayer = {
  cuePlaylist: (
    playlist: string[],
    index?: number,
    startSeconds?: number,
  ) => void;
  getPlaylistIndex: () => number;
  destroy: () => void;
};
type YouTubePlayerEvent = { target: YouTubePlayer; data?: number };
type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      videoId: string;
      host?: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: YouTubePlayerEvent) => void;
        onStateChange: (event: YouTubePlayerEvent) => void;
      };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT) resolve(window.YT);
    };
    if (
      document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    )
      return;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      youtubeApiPromise = null;
      reject(new Error("YouTube Player API konnte nicht geladen werden."));
    };
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}

const pieces = rawPieces as Piece[];
const TARGET_MIN = 25 * 60;
const TARGET_MAX = 30 * 60;
const ACTIVE_PROJECT_ID = "20270000-0000-4000-8000-000000000001";
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "development";
const emptyPiece: Piece = {
  id: 0,
  title: "Neues Stück",
  composer: "",
  durationSeconds: 0,
  grade: 0,
  priceCents: 0,
  owned: false,
  genres: [],
  sampleUrl: null,
  youtubeId: null,
  purchaseUrl: null,
  soloStatus: "unknown",
  solos: null,
  source: "",
  subtitle: null,
  note: null,
};
const RETURN_HASH_KEY = "setlist-o-mat:return-hash";
const initialRatings: Record<number, Rating> = {
  2: {
    stars: 4,
    skipped: false,
    comment: "Schöner Einstieg, aber recht lang.",
  },
  4: { stars: 5, skipped: false, comment: "Klingt sofort nach Konzert!" },
  7: {
    stars: 4,
    skipped: false,
    comment: "Starker Sound, Soli bitte noch prüfen.",
  },
  10: {
    stars: 3,
    skipped: false,
    comment: "Charmant, aber nicht mein Favorit.",
  },
};
const initialSetlists: Setlist[] = [
  {
    id: 1,
    name: "Tanzende Tuba",
    ownerId: "demo-1",
    owner: "Demo-Mitglied 1",
    pieceIds: [1, 3, 5, 7, 9, 11],
    state: "finalist",
    rating: 4.5,
    ratingCount: 2,
    comments: 2,
    reviews: [
      {
        userId: "demo-2",
        author: "Demo-Mitglied 2",
        stars: 5,
        comment: "Schöne Dramaturgie und ein starker Schluss.",
      },
      {
        userId: "demo-3",
        author: "Demo-Mitglied 3",
        stars: 4,
        comment: "Guter Mix, nur die Mitte könnte etwas ruhiger sein.",
      },
    ],
  },
  {
    id: 2,
    name: "Goldener Wirbelwind",
    ownerId: "demo-2",
    owner: "Demo-Mitglied 2",
    pieceIds: [2, 4, 6, 8, 10, 12],
    state: "published",
    rating: 4,
    ratingCount: 1,
    comments: 1,
    reviews: [
      {
        userId: "demo-1",
        author: "Demo-Mitglied 1",
        stars: 4,
        comment: "Passt zeitlich gut und deckt viele Genres ab.",
      },
    ],
  },
  {
    id: 3,
    name: "Mitternachtsfanfare",
    ownerId: null,
    owner: "Demo",
    pieceIds: [1, 4, 7, 10, 12],
    state: "draft",
    rating: 0,
    ratingCount: 0,
    comments: 0,
    reviews: [],
  },
];
const artAdjectives = [
  "Funkelnder",
  "Fliegender",
  "Samtener",
  "Tanzender",
  "Goldener",
  "Wilder",
  "Leuchtender",
  "Mutiger",
  "Klingender",
  "Beschwingter",
  "Feuriger",
  "Nachtblauer",
];
const artNouns = [
  "Auftakt",
  "Wirbelwind",
  "Paukenschlag",
  "Taktwechsel",
  "Klangbogen",
  "Höhenflug",
  "Fermatenflug",
  "Blechzauber",
  "Notentanz",
  "Finalakkord",
  "Holzbläsertraum",
  "Konzertfunke",
];

function uniqueSetlistName(existingNames: string[], preferred?: string) {
  const used = new Set(
    existingNames.map((name) => name.trim().toLocaleLowerCase("de")),
  );
  const candidates = preferred
    ? [preferred]
    : artAdjectives.flatMap((adjective) =>
        artNouns.map((noun) => `${adjective} ${noun}`),
      );
  const available = candidates.filter(
    (name) => !used.has(name.toLocaleLowerCase("de")),
  );
  if (available.length)
    return available[Math.floor(Math.random() * available.length)];
  const base = preferred ?? "Neue Setlist";
  let number = 2;
  while (used.has(`${base} ${number}`.toLocaleLowerCase("de"))) number += 1;
  return `${base} ${number}`;
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function formatMoney(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
function formatPiecePrice(piece: Piece) {
  return piece.owned
    ? "Kaufpreis entfällt"
    : piece.priceCents > 0
      ? `Preis ${formatMoney(piece.priceCents)}`
      : "Preis noch offen";
}
function getYoutubeId(url: string | null) {
  return (
    url?.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/)?.[1] ?? null
  );
}
function isSupabaseAuthHash(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return (
    params.has("access_token") ||
    params.has("refresh_token") ||
    params.has("error") ||
    params.has("error_code")
  );
}
function friendlyAuthError(message: string, code?: string | null) {
  const normalized = `${code ?? ""} ${message}`.toLocaleLowerCase("de");
  if (
    normalized.includes("otp_expired") ||
    normalized.includes("invalid or has expired") ||
    normalized.includes("one-time token")
  )
    return "Dieser Anmeldelink ist abgelaufen oder wurde bereits verwendet. Bitte fordere eine neue Anmeldemail an und öffne nur den neuesten Link.";
  if (
    normalized.includes("rate_limit") ||
    normalized.includes("only request this after") ||
    normalized.includes("429")
  )
    return "Du hast gerade schon eine Anmeldemail angefordert. Bitte warte kurz und versuche es dann erneut.";
  if (normalized.includes("invalid login credentials"))
    return "E-Mail-Adresse oder Passwort ist nicht korrekt.";
  if (normalized.includes("email not confirmed"))
    return "Dieses bestehende Konto hat noch kein verwendbares Passwort. Bitte melde dich kurz bei Fabian.";
  if (
    normalized.includes("user already registered") ||
    normalized.includes("user_already_exists")
  )
    return "Für diese E-Mail-Adresse gibt es bereits ein Konto. Melde dich bitte an – oder kurz bei Fabian, falls das Konto bisher nur einen Mail-Link verwendet hat.";
  if (
    normalized.includes("weak_password") ||
    normalized.includes("password should be")
  )
    return "Das Passwort muss mindestens acht Zeichen lang sein.";
  if (normalized.includes("gruppencode"))
    return "Der Gruppencode stimmt nicht. Prüfe bitte die Schreibweise oder frage kurz in der WhatsApp-Gruppe nach.";
  if (
    normalized.includes("not allowed") ||
    normalized.includes("signup_disabled")
  )
    return "Diese E-Mail-Adresse ist nicht freigeschaltet. Bitte melde dich kurz bei Fabian.";
  return (
    message || "Die Anmeldung ist fehlgeschlagen. Bitte prüfe deine Eingaben."
  );
}
function getAuthCallbackError(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!params.has("error") && !params.has("error_code")) return null;
  return friendlyAuthError(
    params.get("error_description")?.replace(/\+/g, " ") ?? "",
    params.get("error_code"),
  );
}
function parsePieceSort(value: string | null): PieceSort {
  return value === "own-desc" ||
    value === "group-desc" ||
    value === "frequency-desc"
    ? value
    : "title";
}
function parseSetlistSort(value: string | null): SetlistSort {
  return value === "progress-desc" ||
    value === "agreement-desc" ||
    value === "name"
    ? value
    : "rating-desc";
}
function parseAppHash(hash: string): AppRoute {
  const [rawPath = "", rawQuery = ""] = hash.replace(/^#/, "").split("?");
  const segments = rawPath
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  const params = new URLSearchParams(rawQuery);
  const base = segments[0];
  if (base === "stuecke")
    return {
      view: "pieces",
      pieceId: /^\d+$/.test(segments[1] ?? "") ? Number(segments[1]) : null,
      setlistId: null,
      editSetlist: false,
      search: params.get("q") ?? "",
      genre: params.get("genre") ?? "Alle Genres",
      onlyOpen: params.get("offen") === "1",
      pieceSort: parsePieceSort(params.get("sort")),
      setlistFilter: "all",
      setlistSort: "rating-desc",
    };
  if (base === "setlists") {
    const rawId = segments[1];
    const setlistId = rawId
      ? /^\d+$/.test(rawId)
        ? Number(rawId)
        : rawId
      : null;
    const filter = params.get("filter");
    return {
      view: "setlists",
      pieceId: null,
      setlistId,
      editSetlist: segments[2] === "bearbeiten",
      search: "",
      genre: "Alle Genres",
      onlyOpen: false,
      pieceSort: "title",
      setlistFilter:
        filter === "finalists" ||
        filter === "mine" ||
        filter === "mine-published"
          ? filter
          : "all",
      setlistSort: parseSetlistSort(params.get("sort")),
    };
  }
  if (base === "admin")
    return {
      view: "admin",
      pieceId: null,
      setlistId: null,
      editSetlist: false,
      search: "",
      genre: "Alle Genres",
      onlyOpen: false,
      pieceSort: "title",
      setlistFilter: "all",
      setlistSort: "rating-desc",
    };
  return {
    view: "home",
    pieceId: null,
    setlistId: null,
    editSetlist: false,
    search: "",
    genre: "Alle Genres",
    onlyOpen: false,
    pieceSort: "title",
    setlistFilter: "all",
    setlistSort: "rating-desc",
  };
}
function writeAppHash(hash: string, replace = false) {
  const nextHash = hash.startsWith("#") ? hash : `#${hash}`;
  if (window.location.hash === nextHash) return;
  if (replace) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${nextHash}`,
    );
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else window.location.hash = nextHash;
}
function reloadForVersion(version: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("appVersion", version);
  window.location.replace(url.toString());
}
function piecesHash(
  search: string,
  genre: string,
  onlyOpen: boolean,
  sort: PieceSort = "title",
) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  if (genre !== "Alle Genres") params.set("genre", genre);
  if (onlyOpen) params.set("offen", "1");
  if (sort !== "title") params.set("sort", sort);
  return `stuecke${params.size ? `?${params.toString()}` : ""}`;
}
function pieceDetailHash(
  pieceId: number,
  search: string,
  genre: string,
  onlyOpen: boolean,
  sort: PieceSort = "title",
) {
  return piecesHash(search, genre, onlyOpen, sort).replace(
    "stuecke",
    `stuecke/${pieceId}`,
  );
}
function setlistsHash(
  filter: SetlistFilter,
  sort: SetlistSort = "rating-desc",
) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (sort !== "rating-desc") params.set("sort", sort);
  return `setlists${params.size ? `?${params}` : ""}`;
}
function getMissingPieceFields(piece: Piece) {
  return [
    !piece.title.trim() && "Titel",
    !piece.composer.trim() && "Komponist/Arrangeur",
    piece.durationSeconds <= 0 && "Dauer",
    piece.genres.length === 0 && "Genre",
    !piece.sampleUrl && "Hörprobe",
    piece.soloStatus === "unknown" && "Soli",
  ].filter(Boolean) as string[];
}
function getSuggestedProfileName(displayName: string | null, email: string) {
  const localPart = email.split("@")[0] ?? "";
  const currentName = displayName?.trim() ?? "";
  const candidate =
    currentName &&
    currentName.toLocaleLowerCase("de") !== localPart.toLocaleLowerCase("de")
      ? currentName
      : localPart.split(/[._]+/)[0];
  return candidate
    ? candidate.charAt(0).toLocaleUpperCase("de") + candidate.slice(1)
    : "";
}
function formatLastActive(value: string | null) {
  if (!value) return "noch nie aktiv";
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return "gerade eben";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
  return `am ${new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
}
function getMetrics(pieceIds: number[], catalogue: Piece[] = pieces) {
  const selected = pieceIds
    .map((id) => catalogue.find((piece) => piece.id === id))
    .filter(Boolean) as Piece[];
  const duration = selected.reduce(
    (sum, piece) => sum + piece.durationSeconds,
    0,
  );
  const grades = selected.map((piece) => piece.grade);
  return {
    selected,
    duration,
    minGrade: grades.length ? Math.min(...grades) : 0,
    maxGrade: grades.length ? Math.max(...grades) : 0,
    avgGrade: grades.length
      ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length
      : 0,
    cost: selected.reduce(
      (sum, piece) => sum + (piece.owned ? 0 : piece.priceCents),
      0,
    ),
    genres: [...new Set(selected.flatMap((piece) => piece.genres))],
  };
}
function getSetlistAgreement(setlist: Setlist, published: Setlist[]) {
  if (!setlist.pieceIds.length) return null;
  const comparisons =
    setlist.state === "draft"
      ? published
      : published.filter((item) => item.id !== setlist.id);
  if (!comparisons.length) return null;
  const matches = setlist.pieceIds.reduce(
    (sum, pieceId) =>
      sum +
      comparisons.filter((item) => item.pieceIds.includes(pieceId)).length,
    0,
  );
  return Math.round(
    (matches / (setlist.pieceIds.length * comparisons.length)) * 100,
  );
}

function Stars({
  value,
  onChange,
  small = false,
}: {
  value: number | null;
  onChange?: (value: number) => void;
  small?: boolean;
}) {
  return (
    <div
      className="stars"
      aria-label={value ? `${value} von 5 Sternen` : "Noch nicht bewertet"}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          className={small ? "star star-small" : "star"}
          type="button"
          key={star}
          onClick={() => onChange?.(star)}
          disabled={!onChange}
          aria-label={`${star} Sterne`}
        >
          <Star fill={value && star <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

function TimeSignal({
  duration,
  compact = false,
}: {
  duration: number;
  compact?: boolean;
}) {
  const state =
    duration < TARGET_MIN ? "short" : duration <= TARGET_MAX ? "good" : "long";
  const delta =
    state === "short"
      ? TARGET_MIN - duration
      : state === "long"
        ? duration - TARGET_MAX
        : TARGET_MAX - duration;
  const label =
    state === "short"
      ? `noch ${formatDuration(delta)}`
      : state === "long"
        ? `${formatDuration(delta)} zu lang`
        : `${formatDuration(delta)} Luft`;
  return (
    <div
      className={`time-signal time-${state} ${compact ? "time-compact" : ""}`}
    >
      <div className="time-signal-copy">
        <strong>{formatDuration(duration)}</strong>
        <span>{label}</span>
      </div>
      <div
        className="time-track"
        aria-label={`${formatDuration(duration)} von maximal 30 Minuten`}
      >
        <span
          style={{ width: `${Math.min((duration / TARGET_MAX) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

function AppMark() {
  return (
    <div className="app-mark" aria-hidden="true">
      <Music2 />
      <span className="mark-spark">✦</span>
    </div>
  );
}

function printSetlistDocument(name: string) {
  const previousTitle = document.title;
  document.title = `${name} – Setlist-o-Mat`;
  const restoreTitle = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };
  window.addEventListener("afterprint", restoreTitle);
  window.print();
  window.setTimeout(restoreTitle, 60000);
}

export default function Home() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [ratings, setRatings] = useState<Record<number, Rating>>(
    supabase ? {} : initialRatings,
  );
  const [setlists, setSetlists] = useState<Setlist[]>(
    supabase ? [] : initialSetlists,
  );
  const [activePieceId, setActivePieceId] = useState<number | null>(null);
  const [activeSetlistId, setActiveSetlistId] = useState<
    number | string | null
  >(null);
  const [setlistRatings, setSetlistRatings] = useState<
    Record<string, SetlistRating>
  >({});
  const [setlistFilter, setSetlistFilter] = useState<SetlistFilter>("all");
  const [setlistSort, setSetlistSort] = useState<SetlistSort>("rating-desc");
  const [showConsensus, setShowConsensus] = useState(true);
  const [builderId, setBuilderId] = useState<number | string | null>(null);
  const [remotePieceIds, setRemotePieceIds] = useState<Record<number, string>>(
    {},
  );
  const [remotePieces, setRemotePieces] = useState<Piece[]>([]);
  const [pieceOverrides, setPieceOverrides] = useState<
    Record<number, Partial<Piece>>
  >({});
  const [groupRatings, setGroupRatings] = useState<Record<number, GroupRating>>(
    {},
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmail[]>([]);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(
    null,
  );
  const [profileNameConfirmedAt, setProfileNameConfirmedAt] = useState<
    string | null | undefined
  >(undefined);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<{
    member: Member;
    password: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Alle Genres");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [pieceSort, setPieceSort] = useState<PieceSort>("title");
  const [adminEditId, setAdminEditId] = useState<number | null>(null);
  const [adminCreatingPiece, setAdminCreatingPiece] = useState(false);
  const [adminPieceSearch, setAdminPieceSearch] = useState("");
  const [adminOnlyIncomplete, setAdminOnlyIncomplete] = useState(false);
  const [setlistSaveState, setSetlistSaveState] =
    useState<SetlistSaveState>("idle");
  const pendingSetlistSave = useRef<PendingSetlistSave | null>(null);
  const setlistSaveRunning = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(!supabase);
  const [profileReady, setProfileReady] = useState(!supabase);
  const [onlineMemberIds, setOnlineMemberIds] = useState<string[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceStatus>({
    enabled: false,
    message: "Der Setlist-o-Mat wird gerade gestimmt. Gleich geht es weiter!",
    startedAt: null,
  });
  const [maintenanceReady, setMaintenanceReady] = useState(!supabase);
  const [projectDataReady, setProjectDataReady] = useState(!supabase);
  const [addPieceToSetlistId, setAddPieceToSetlistId] = useState<number | null>(
    null,
  );
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const interactionBlocked =
    activePieceId !== null ||
    activeSetlistId !== null ||
    builderId !== null ||
    adminEditId !== null ||
    adminCreatingPiece ||
    showProfileDialog ||
    temporaryPassword !== null ||
    addPieceToSetlistId !== null ||
    setlistSaveState === "saving";

  useEffect(() => {
    let active = true;
    const checkVersion = async (autoReload: boolean) => {
      try {
        const versionUrl = new URL("version.json", document.baseURI);
        versionUrl.searchParams.set("t", String(Date.now()));
        const response = await fetch(versionUrl, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { version?: string };
        const nextVersion = payload.version?.trim();
        if (
          !active ||
          !nextVersion ||
          nextVersion === BUILD_ID ||
          nextVersion === "development"
        )
          return;
        if (autoReload && !interactionBlocked) reloadForVersion(nextVersion);
        else setAvailableVersion(nextVersion);
      } catch (error) {
        console.warn("version check failed", error);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const wasAwayLongEnough =
        hiddenAt.current !== null &&
        Date.now() - hiddenAt.current >= 5 * 60_000;
      hiddenAt.current = null;
      void checkVersion(wasAwayLongEnough);
    };
    void checkVersion(true);
    const timer = window.setInterval(
      () => void checkVersion(false),
      5 * 60_000,
    );
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [interactionBlocked]);

  useEffect(() => {
    const syncFromHash = () => {
      const callbackError = getAuthCallbackError(window.location.hash);
      if (callbackError) {
        setAuthMessage(callbackError);
        const storedHash = window.localStorage.getItem(RETURN_HASH_KEY);
        const safeHash =
          storedHash?.startsWith("#") && !isSupabaseAuthHash(storedHash)
            ? storedHash
            : "#uebersicht";
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}${safeHash}`,
        );
      }
      const route = parseAppHash(window.location.hash);
      setView(route.view);
      setActivePieceId(route.pieceId);
      setActiveSetlistId(
        route.setlistId && !route.editSetlist ? route.setlistId : null,
      );
      setBuilderId(
        route.setlistId && route.editSetlist ? route.setlistId : null,
      );
      if (route.view === "pieces") {
        setSearch(route.search);
        setGenre(route.genre);
        setOnlyOpen(route.onlyOpen);
        setPieceSort(route.pieceSort);
      }
      if (route.view === "setlists") {
        setSetlistFilter(route.setlistFilter);
        setSetlistSort(route.setlistSort);
      }
    };
    if (!window.location.hash) writeAppHash("uebersicht", true);
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    if (view === "pieces" && activePieceId === null)
      writeAppHash(piecesHash(search, genre, onlyOpen, pieceSort), true);
  }, [activePieceId, genre, onlyOpen, pieceSort, search, view]);

  useEffect(() => {
    if (view === "setlists" && activeSetlistId === null && builderId === null)
      writeAppHash(setlistsHash(setlistFilter, setlistSort), true);
  }, [activeSetlistId, builderId, setlistFilter, setlistSort, view]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setShowConsensus(
          window.localStorage.getItem("setlist-o-mat:consensus") !== "off",
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!profileReady || view !== "admin" || isAdmin) return;
    const timer = window.setTimeout(() => writeAppHash("uebersicht", true), 0);
    return () => window.clearTimeout(timer);
  }, [isAdmin, profileReady, view]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(data.session);
        if (error) setAuthMessage(friendlyAuthError(error.message, error.code));
        setAuthReady(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === "SIGNED_IN") setAuthMessage(null);
        setSession((current) => {
          if (current?.user.id !== nextSession?.user.id) {
            setProfileReady(false);
            setIsAdmin(false);
            setOnlineMemberIds([]);
            setProfileDisplayName(null);
            setProfileNameConfirmedAt(undefined);
            setPasswordChangeRequired(false);
            setProjectDataReady(false);
          }
          return nextSession;
        });
        setAuthReady(true);
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    const url = new URL(window.location.href);
    const returnHash =
      url.searchParams.get("returnHash") ||
      window.localStorage.getItem(RETURN_HASH_KEY);
    if (returnHash?.startsWith("#")) writeAppHash(returnHash, true);
    window.localStorage.removeItem(RETURN_HASH_KEY);
    if (url.searchParams.has("returnHash")) {
      url.searchParams.delete("returnHash");
      url.searchParams.delete("code");
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${window.location.hash}`,
      );
    }
  }, [session]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const loadMaintenance = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("maintenance_mode, maintenance_message, maintenance_started_at")
        .eq("id", "global")
        .maybeSingle();
      if (!active) return;
      if (data)
        setMaintenance({
          enabled: Boolean(data.maintenance_mode),
          message: data.maintenance_message,
          startedAt: data.maintenance_started_at,
        });
      setMaintenanceReady(true);
    };
    void loadMaintenance();
    const timer = window.setInterval(() => void loadMaintenance(), 10_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadMaintenance();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) return;
    let active = true;
    const loadProjectData = async () => {
      void supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", session.user.id);
      const { data: currentProfile } = await supabase
        .from("profiles")
        .select(
          "is_app_admin, display_name, name_confirmed_at, password_change_required",
        )
        .eq("id", session.user.id)
        .single();
      const currentDisplayName = currentProfile?.display_name?.trim();
      if (
        currentDisplayName &&
        session.user.user_metadata?.display_name !== currentDisplayName
      ) {
        void supabase.auth
          .updateUser({ data: { display_name: currentDisplayName } })
          .then(({ error }) => {
            if (error) console.warn("auth display name sync failed", error);
          });
      }
      if (active) {
        setIsAdmin(Boolean(currentProfile?.is_app_admin));
        setProfileReady(true);
        setProfileDisplayName(currentProfile?.display_name ?? null);
        const confirmedAt = currentProfile?.name_confirmed_at ?? null;
        setProfileNameConfirmedAt(confirmedAt);
        setPasswordChangeRequired(
          Boolean(currentProfile?.password_change_required),
        );
        setShowProfileDialog(!confirmedAt);
      }
      const { data: dbPieces, error: piecesError } = await supabase
        .from("pieces")
        .select("*")
        .eq("project_id", ACTIVE_PROJECT_ID)
        .eq("archived", false);
      if (piecesError || !dbPieces) {
        if (active) setToast("Supabase-Daten konnten nicht geladen werden");
        return;
      }

      const pieceIds = Object.fromEntries(
        dbPieces.flatMap((piece) => {
          const match = /^(?:xlsx|manual)-(\d+)$/.exec(piece.import_key ?? "");
          return match ? [[Number(match[1]), piece.id as string]] : [];
        }),
      ) as Record<number, string>;
      const localByRemote = new Map(
        Object.entries(pieceIds).map(([local, remote]) => [
          remote,
          Number(local),
        ]),
      );
      const remoteIds = Object.values(pieceIds);

      const [
        { data: ownRatings },
        { data: allPieceRatings },
        { data: dbSetlists },
        { data: dbSetlistRatings },
        { data: dbProfiles },
        { data: dbMemberships },
        { data: dbAllowedEmails },
      ] = await Promise.all([
        supabase
          .from("piece_ratings")
          .select("piece_id, stars, skipped, comment")
          .eq("user_id", session.user.id)
          .in("piece_id", remoteIds),
        supabase
          .from("piece_ratings")
          .select("piece_id, user_id, stars, skipped, comment")
          .in("piece_id", remoteIds),
        supabase
          .from("setlists")
          .select(
            "id, name, owner_id, state, setlist_items(piece_id, position)",
          )
          .eq("project_id", ACTIVE_PROJECT_ID),
        supabase
          .from("setlist_ratings")
          .select("setlist_id, user_id, stars, comment"),
        supabase
          .from("profiles")
          .select("id, email, display_name, is_app_admin, last_seen_at"),
        supabase
          .from("project_members")
          .select("user_id, status")
          .eq("project_id", ACTIVE_PROJECT_ID)
          .eq("status", "active"),
        currentProfile?.is_app_admin
          ? supabase.from("signup_allowed_emails").select("email, display_name")
          : Promise.resolve({
              data: [] as { email: string; display_name: string | null }[],
            }),
      ]);

      const profileNames = new Map(
        (dbProfiles ?? []).map((profile) => [profile.id, profile.display_name]),
      );
      const allSetlistRatings = dbSetlistRatings ?? [];

      if (!active) return;
      setRemotePieceIds(pieceIds);
      const mappedPieces = dbPieces
        .flatMap((piece) => {
          const match = /^(?:xlsx|manual)-(\d+)$/.exec(piece.import_key ?? "");
          if (!match) return [];
          const localId = Number(match[1]);
          return [
            {
              id: localId,
              title: piece.title,
              composer: piece.composer,
              durationSeconds: piece.duration_seconds,
              grade: Number(piece.grade),
              priceCents: piece.price_cents,
              owned: piece.owned,
              genres: piece.genres ?? [],
              sampleUrl: piece.sample_url,
              youtubeId: getYoutubeId(piece.sample_url),
              purchaseUrl: piece.purchase_url,
              soloStatus: piece.solo_status,
              solos: piece.solos,
              source: piece.source,
              subtitle: piece.subtitle,
              note: piece.note,
            } as Piece,
          ];
        })
        .sort((a, b) => a.title.localeCompare(b.title, "de"));
      setRemotePieces(mappedPieces);
      setPieceOverrides({});
      setRatings(
        Object.fromEntries(
          (ownRatings ?? []).flatMap((rating) => {
            const localId = localByRemote.get(rating.piece_id);
            return localId
              ? [
                  [
                    localId,
                    {
                      stars: rating.stars,
                      skipped: rating.skipped,
                      comment: rating.comment ?? "",
                    },
                  ],
                ]
              : [];
          }),
        ),
      );
      const grouped = new Map<
        number,
        { stars: number[]; comments: { author: string; text: string }[] }
      >();
      for (const rating of allPieceRatings ?? []) {
        const localId = localByRemote.get(rating.piece_id);
        if (!localId) continue;
        const item = grouped.get(localId) ?? { stars: [], comments: [] };
        if (rating.stars) item.stars.push(rating.stars);
        if (rating.comment?.trim())
          item.comments.push({
            author: profileNames.get(rating.user_id) ?? "Mitglied",
            text: rating.comment.trim(),
          });
        grouped.set(localId, item);
      }
      setGroupRatings(
        Object.fromEntries(
          [...grouped].map(([id, item]) => [
            id,
            {
              average: item.stars.length
                ? item.stars.reduce((sum, value) => sum + value, 0) /
                  item.stars.length
                : 0,
              count: item.stars.length,
              comments: item.comments,
            },
          ]),
        ),
      );
      const activeMemberIds = new Set(
        (dbMemberships ?? []).map((membership) => membership.user_id),
      );
      const ratingsCompleted = new Map<string, number>();
      for (const rating of allPieceRatings ?? [])
        ratingsCompleted.set(
          rating.user_id,
          (ratingsCompleted.get(rating.user_id) ?? 0) + 1,
        );
      setMembers(
        (dbProfiles ?? [])
          .filter((profile) => activeMemberIds.has(profile.id))
          .map((profile) => ({
            id: profile.id,
            email: profile.email,
            displayName: profile.display_name,
            isAdmin: profile.is_app_admin,
            lastSeenAt: profile.last_seen_at,
            ratingsCompleted: ratingsCompleted.get(profile.id) ?? 0,
          })),
      );
      setAllowedEmails(
        (dbAllowedEmails ?? []).map((entry) => ({
          email: String(entry.email),
          displayName: entry.display_name,
        })),
      );
      setSetlists(
        (dbSetlists ?? []).map((setlist) => {
          const listRatings = allSetlistRatings.filter(
            (rating) => rating.setlist_id === setlist.id,
          );
          const stars = listRatings.map((rating) => rating.stars);
          const orderedItems = [...(setlist.setlist_items ?? [])].sort(
            (a, b) => a.position - b.position,
          );
          return {
            id: setlist.id,
            name: setlist.name,
            ownerId: setlist.owner_id,
            owner: profileNames.get(setlist.owner_id) ?? "Mitglied",
            pieceIds: orderedItems.flatMap((item) => {
              const localId = localByRemote.get(item.piece_id);
              return localId ? [localId] : [];
            }),
            state: setlist.state as SetlistState,
            rating: stars.length
              ? stars.reduce((sum, value) => sum + value, 0) / stars.length
              : 0,
            ratingCount: stars.length,
            comments: listRatings.filter((rating) => rating.comment?.trim())
              .length,
            reviews: listRatings.map((rating) => ({
              userId: rating.user_id,
              author: profileNames.get(rating.user_id) ?? "Mitglied",
              stars: rating.stars,
              comment: rating.comment?.trim() ?? "",
            })),
          };
        }),
      );
      setSetlistRatings(
        Object.fromEntries(
          allSetlistRatings
            .filter((rating) => rating.user_id === session.user.id)
            .map((rating) => [
              rating.setlist_id,
              { stars: rating.stars, comment: rating.comment ?? "" },
            ]),
        ),
      );
      setProjectDataReady(true);
    };
    void loadProjectData();
    return () => {
      active = false;
    };
  }, [session, supabase]);

  useEffect(() => {
    if (!supabase || !session) return;
    const userId = session.user.id;
    const channel = supabase.channel(`project:${ACTIVE_PROJECT_ID}:presence`, {
      config: { presence: { key: userId, enabled: true } },
    });
    const syncPresence = () => {
      const state = channel.presenceState<{ user_id?: string }>();
      const ids = Object.values(state).flatMap((entries) =>
        entries
          .map((entry) => entry.user_id)
          .filter((id): id is string => Boolean(id)),
      );
      setOnlineMemberIds([...new Set(ids)]);
    };
    const track = () =>
      channel.track({ user_id: userId, online_at: new Date().toISOString() });
    const touchLastSeen = async () => {
      if (document.visibilityState !== "visible") return;
      const now = new Date().toISOString();
      setMembers((current) =>
        current.map((member) =>
          member.id === userId ? { ...member, lastSeenAt: now } : member,
        ),
      );
      await supabase
        .from("profiles")
        .update({ last_seen_at: now })
        .eq("id", userId);
    };
    channel
      .on("presence", { event: "sync" }, syncPresence)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void track();
          void touchLastSeen();
        }
      });
    const heartbeat = window.setInterval(() => void touchLastSeen(), 60_000);
    const visibility = () => {
      if (document.visibilityState === "visible") {
        void track();
        void touchLastSeen();
      } else void channel.untrack();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", visibility);
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [session, supabase]);

  useEffect(() => {
    if (!supabase || !session || !isAdmin) return;
    const refreshMemberActivity = async () => {
      const remoteIds = Object.values(remotePieceIds);
      const [{ data: profiles }, { data: ratingRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, display_name, is_app_admin, last_seen_at"),
        remoteIds.length
          ? supabase
              .from("piece_ratings")
              .select("user_id, piece_id")
              .in("piece_id", remoteIds)
          : Promise.resolve({
              data: [] as { user_id: string; piece_id: string }[],
            }),
      ]);
      if (!profiles) return;
      const counts = new Map<string, number>();
      for (const rating of ratingRows ?? [])
        counts.set(rating.user_id, (counts.get(rating.user_id) ?? 0) + 1);
      const latest = new Map(profiles.map((profile) => [profile.id, profile]));
      setMembers((current) =>
        current.map((member) => {
          const profile = latest.get(member.id);
          return profile
            ? {
                id: profile.id,
                email: profile.email,
                displayName: profile.display_name,
                isAdmin: profile.is_app_admin,
                lastSeenAt: profile.last_seen_at,
                ratingsCompleted: counts.get(profile.id) ?? 0,
              }
            : member;
        }),
      );
    };
    const timer = window.setInterval(
      () => void refreshMemberActivity(),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, [isAdmin, remotePieceIds, session, supabase]);

  const catalogue = useMemo(
    () =>
      (supabase ? remotePieces : pieces).map((piece) => ({
        ...piece,
        ...pieceOverrides[piece.id],
      })),
    [pieceOverrides, remotePieces, supabase],
  );
  const activePiece =
    catalogue.find((piece) => piece.id === activePieceId) ?? null;
  const activeSetlist =
    setlists.find((setlist) => setlist.id === activeSetlistId) ?? null;
  const adminPiece =
    catalogue.find((piece) => piece.id === adminEditId) ?? null;
  const builder = setlists.find((setlist) => setlist.id === builderId) ?? null;
  const completed = Object.keys(ratings).length;
  const progress = Math.round((completed / catalogue.length) * 100);
  const genres = [
    "Alle Genres",
    ...new Set(catalogue.flatMap((piece) => piece.genres)),
  ];
  const nextPiece = catalogue.find((piece) => !ratings[piece.id]);
  const email = session?.user.email?.toLocaleLowerCase("de") ?? "";
  const displayName =
    profileDisplayName ||
    session?.user.user_metadata?.display_name ||
    (email ? email.split("@")[0].split(".")[0] : "Demo");
  const friendlyName =
    String(displayName).charAt(0).toLocaleUpperCase("de") +
    String(displayName).slice(1);
  const suggestedProfileName = getSuggestedProfileName(
    profileDisplayName,
    email,
  );
  const publishedSetlists = useMemo(
    () => setlists.filter((item) => item.state !== "draft"),
    [setlists],
  );
  const pieceOccurrenceCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const setlist of publishedSetlists)
      for (const pieceId of new Set(setlist.pieceIds))
        counts[pieceId] = (counts[pieceId] ?? 0) + 1;
    return counts;
  }, [publishedSetlists]);

  useEffect(() => {
    if (!projectDataReady || builderId === null) return;
    const requested = setlists.find((setlist) => setlist.id === builderId);
    const mayEdit =
      requested?.state === "draft" &&
      (!session || requested.ownerId === session.user.id);
    if (mayEdit) return;
    const timer = window.setTimeout(() => {
      setBuilderId(null);
      if (requested && requested.state !== "draft") {
        setActiveSetlistId(requested.id);
        writeAppHash(
          `setlists/${encodeURIComponent(String(requested.id))}`,
          true,
        );
        setToast(
          "Diese Setlist ist bereits veröffentlicht und kann nicht mehr bearbeitet werden",
        );
      } else {
        setActiveSetlistId(null);
        writeAppHash(setlistsHash(setlistFilter, setlistSort), true);
        setToast("Diese private Setlist ist nicht verfügbar");
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // Die Route wird erst nach dem vollständig geladenen, RLS-gefilterten Datenbestand bewertet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderId, projectDataReady, session, setlists]);

  const filteredPieces = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de");
    const result = catalogue.filter(
      (piece) =>
        (!query ||
          `${piece.title} ${piece.composer}`
            .toLocaleLowerCase("de")
            .includes(query)) &&
        (genre === "Alle Genres" || piece.genres.includes(genre)) &&
        (!onlyOpen || !ratings[piece.id]),
    );
    const byTitle = (a: Piece, b: Piece) =>
      a.title.localeCompare(b.title, "de");
    if (pieceSort === "own-desc")
      return result.sort((a, b) => {
        const ownA = ratings[a.id];
        const ownB = ratings[b.id];
        const scoreA = ownA ? (ownA.skipped ? -1 : (ownA.stars ?? -1)) : -2;
        const scoreB = ownB ? (ownB.skipped ? -1 : (ownB.stars ?? -1)) : -2;
        return scoreB - scoreA || byTitle(a, b);
      });
    if (pieceSort === "group-desc")
      return result.sort((a, b) => {
        const visibleA = Boolean(ratings[a.id] && groupRatings[a.id]?.count);
        const visibleB = Boolean(ratings[b.id] && groupRatings[b.id]?.count);
        if (visibleA !== visibleB) return Number(visibleB) - Number(visibleA);
        if (visibleA && visibleB)
          return (
            groupRatings[b.id].average - groupRatings[a.id].average ||
            byTitle(a, b)
          );
        return byTitle(a, b);
      });
    if (pieceSort === "frequency-desc")
      return result.sort(
        (a, b) =>
          (pieceOccurrenceCounts[b.id] ?? 0) -
            (pieceOccurrenceCounts[a.id] ?? 0) || byTitle(a, b),
      );
    return result.sort(byTitle);
  }, [
    catalogue,
    genre,
    groupRatings,
    onlyOpen,
    pieceOccurrenceCounts,
    pieceSort,
    ratings,
    search,
  ]);
  const hasActivePieceFilters =
    Boolean(search.trim()) || genre !== "Alle Genres" || onlyOpen;
  const clearPieceFilters = () => {
    setSearch("");
    setGenre("Alle Genres");
    setOnlyOpen(false);
  };
  const navigateToView = (nextView: View) => {
    setView(nextView);
    setActivePieceId(null);
    setActiveSetlistId(null);
    setBuilderId(null);
    writeAppHash(
      nextView === "home"
        ? "uebersicht"
        : nextView === "pieces"
          ? piecesHash(search, genre, onlyOpen, pieceSort)
          : nextView === "setlists"
            ? setlistsHash(setlistFilter, setlistSort)
            : "admin",
    );
  };
  const openPiece = (pieceId: number) => {
    const preserveFilters = view === "pieces";
    setView("pieces");
    setActivePieceId(pieceId);
    setActiveSetlistId(null);
    setBuilderId(null);
    writeAppHash(
      pieceDetailHash(
        pieceId,
        preserveFilters ? search : "",
        preserveFilters ? genre : "Alle Genres",
        preserveFilters && onlyOpen,
        preserveFilters ? pieceSort : "title",
      ),
    );
  };
  const closePiece = () => {
    setActivePieceId(null);
    writeAppHash(piecesHash(search, genre, onlyOpen, pieceSort), true);
  };
  const openSetlist = (setlistId: number | string) => {
    setView("setlists");
    setActiveSetlistId(setlistId);
    setActivePieceId(null);
    setBuilderId(null);
    writeAppHash(`setlists/${encodeURIComponent(String(setlistId))}`);
  };
  const closeSetlist = () => {
    setActiveSetlistId(null);
    writeAppHash(setlistsHash(setlistFilter, setlistSort), true);
  };
  const showBuilder = (setlistId: number | string) => {
    setView("setlists");
    setSetlistSaveState("saved");
    setBuilderId(setlistId);
    setActivePieceId(null);
    setActiveSetlistId(null);
    writeAppHash(
      `setlists/${encodeURIComponent(String(setlistId))}/bearbeiten`,
    );
  };
  const openBuilder = (setlistId: number | string) => {
    const requested = setlists.find((setlist) => setlist.id === setlistId);
    if (
      !requested ||
      requested.state !== "draft" ||
      (session && requested.ownerId !== session.user.id)
    ) {
      if (requested && requested.state !== "draft") openSetlist(setlistId);
      else flash("Diese private Setlist ist nicht verfügbar");
      return;
    }
    showBuilder(setlistId);
  };
  const closeBuilder = () => {
    setBuilderId(null);
    writeAppHash(setlistsHash(setlistFilter, setlistSort), true);
  };
  const incompletePieceCount = catalogue.filter(
    (piece) => getMissingPieceFields(piece).length > 0,
  ).length;
  const adminPieces = useMemo(() => {
    const query = adminPieceSearch.trim().toLocaleLowerCase("de");
    return catalogue.filter((piece) => {
      const searchable =
        `${piece.title} ${piece.composer} ${piece.source} ${piece.genres.join(" ")}`.toLocaleLowerCase(
          "de",
        );
      return (
        (!query || searchable.includes(query)) &&
        (!adminOnlyIncomplete || getMissingPieceFields(piece).length > 0)
      );
    });
  }, [adminOnlyIncomplete, adminPieceSearch, catalogue]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };
  const flushSetlistSaves = async () => {
    if (!supabase || setlistSaveRunning.current) return;
    setlistSaveRunning.current = true;
    setSetlistSaveState("saving");
    while (pendingSetlistSave.current) {
      const save = pendingSetlistSave.current;
      pendingSetlistSave.current = null;
      const { error } = await supabase.rpc("save_own_setlist_draft", {
        requested_setlist_id: save.setlistId,
        requested_name: save.name,
        requested_piece_ids: save.pieceIds,
        requested_publish: save.publish,
      });
      if (error) {
        console.error("setlist save failed", error);
        pendingSetlistSave.current ??= save;
        setlistSaveRunning.current = false;
        setSetlistSaveState("error");
        flash(
          "Setlist konnte nicht gespeichert werden – deine letzte Änderung ist nur lokal sichtbar",
        );
        return;
      }
    }
    setlistSaveRunning.current = false;
    setSetlistSaveState("saved");
  };
  const queueSetlistSave = (setlist: Setlist) => {
    if (!supabase || typeof setlist.id !== "string") {
      setSetlistSaveState("saved");
      return;
    }
    if (!setlist.name.trim()) {
      pendingSetlistSave.current = null;
      setSetlistSaveState("error");
      return;
    }
    const pieceIds = setlist.pieceIds.flatMap((pieceId) =>
      remotePieceIds[pieceId] ? [remotePieceIds[pieceId]] : [],
    );
    if (pieceIds.length !== setlist.pieceIds.length) {
      setSetlistSaveState("error");
      flash(
        "Setlist konnte nicht gespeichert werden – ein Stück ist nicht mehr verfügbar",
      );
      return;
    }
    pendingSetlistSave.current = {
      setlistId: setlist.id,
      name: setlist.name,
      pieceIds,
      publish: setlist.state === "published",
    };
    setSetlistSaveState("saving");
    void flushSetlistSaves();
  };
  const saveProfileName = async (name: string): Promise<string | null> => {
    if (!supabase || !session)
      return "Dein Profil ist gerade nicht erreichbar.";
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (normalizedName.length < 2)
      return "Bitte gib mindestens zwei Zeichen ein.";
    if (normalizedName.length > 80)
      return "Der Name darf höchstens 80 Zeichen lang sein.";
    const confirmedAt = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: normalizedName,
        name_confirmed_at: confirmedAt,
        updated_at: confirmedAt,
      })
      .eq("id", session.user.id);
    if (error)
      return "Der Name konnte nicht gespeichert werden. Bitte versuche es erneut.";
    const { error: authMetadataError } = await supabase.auth.updateUser({
      data: { display_name: normalizedName },
    });
    setProfileDisplayName(normalizedName);
    setProfileNameConfirmedAt(confirmedAt);
    setMembers((current) =>
      current.map((member) =>
        member.id === session.user.id
          ? { ...member, displayName: normalizedName }
          : member,
      ),
    );
    if (authMetadataError)
      return "Der Name ist in der App gespeichert, konnte aber nicht in die Kontometadaten übernommen werden. Bitte versuche das Speichern noch einmal.";
    setShowProfileDialog(false);
    flash(`Willkommen, ${normalizedName}!`);
    return null;
  };
  const changeOwnPassword = async (
    password: string,
  ): Promise<string | null> => {
    if (!supabase || !session) return "Dein Konto ist gerade nicht erreichbar.";
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return friendlyAuthError(error.message, error.code);
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        password_change_required: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);
    if (profileError)
      return "Das Passwort wurde geändert, aber die Bestätigung konnte nicht gespeichert werden. Bitte lade die App neu.";
    setPasswordChangeRequired(false);
    return null;
  };
  const saveRating = async (pieceId: number, rating: Rating) => {
    const previousRating = ratings[pieceId];
    setRatings((current) => ({ ...current, [pieceId]: rating }));
    if (supabase && session && remotePieceIds[pieceId]) {
      const { error } = await supabase
        .from("piece_ratings")
        .upsert(
          {
            piece_id: remotePieceIds[pieceId],
            user_id: session.user.id,
            ...rating,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "piece_id,user_id" },
        );
      if (error) {
        setRatings((current) => {
          const next = { ...current };
          if (previousRating) next[pieceId] = previousRating;
          else delete next[pieceId];
          return next;
        });
        console.error("piece rating save failed", error);
        flash(
          "Bewertung konnte nicht gespeichert werden – bitte erneut versuchen",
        );
        return false;
      }
      const { data: refreshed, error: refreshError } = await supabase
        .from("piece_ratings")
        .select("user_id, stars, comment")
        .eq("piece_id", remotePieceIds[pieceId]);
      if (!refreshError) {
        const stars = (refreshed ?? []).flatMap((item) =>
          item.stars ? [item.stars] : [],
        );
        const memberNames = new Map(
          members.map((member) => [member.id, member.displayName]),
        );
        setGroupRatings((current) => ({
          ...current,
          [pieceId]: {
            average: stars.length
              ? stars.reduce((sum, value) => sum + value, 0) / stars.length
              : 0,
            count: stars.length,
            comments: (refreshed ?? []).flatMap((item) =>
              item.comment?.trim()
                ? [
                    {
                      author: memberNames.get(item.user_id) ?? "Mitglied",
                      text: item.comment.trim(),
                    },
                  ]
                : [],
            ),
          },
        }));
      }
      if (!previousRating)
        setMembers((current) =>
          current.map((member) =>
            member.id === session.user.id
              ? { ...member, ratingsCompleted: member.ratingsCompleted + 1 }
              : member,
          ),
        );
    }
    flash("Bewertung gespeichert");
    return true;
  };
  const resetPieceRating = async (pieceId: number) => {
    const previousRating = ratings[pieceId];
    if (!previousRating) return true;
    if (supabase && session && remotePieceIds[pieceId]) {
      const { error } = await supabase
        .from("piece_ratings")
        .delete()
        .eq("piece_id", remotePieceIds[pieceId])
        .eq("user_id", session.user.id);
      if (error) {
        console.error("piece rating reset failed", error);
        flash("Bewertung konnte nicht zurückgesetzt werden");
        return false;
      }
    }
    setRatings((current) => {
      const next = { ...current };
      delete next[pieceId];
      return next;
    });
    setGroupRatings((current) => {
      const next = { ...current };
      delete next[pieceId];
      return next;
    });
    if (session)
      setMembers((current) =>
        current.map((member) =>
          member.id === session.user.id
            ? {
                ...member,
                ratingsCompleted: Math.max(0, member.ratingsCompleted - 1),
              }
            : member,
        ),
      );
    flash("Bewertung zurückgesetzt – das Stück ist wieder offen");
    return true;
  };
  const createSetlist = async () => {
    const name = uniqueSetlistName(setlists.map((item) => item.name));
    if (supabase && session) {
      const { data, error } = await supabase
        .from("setlists")
        .insert({
          project_id: ACTIVE_PROJECT_ID,
          owner_id: session.user.id,
          name,
          state: "draft",
        })
        .select("id")
        .single();
      if (error || !data) {
        flash("Entwurf konnte nicht angelegt werden");
        return;
      }
      const setlist: Setlist = {
        id: data.id,
        name,
        ownerId: session.user.id,
        owner: friendlyName,
        pieceIds: [],
        state: "draft",
        rating: 0,
        ratingCount: 0,
        comments: 0,
        reviews: [],
      };
      setSetlists((current) => [...current, setlist]);
      showBuilder(data.id);
      return;
    }
    const numericIds = setlists
      .map((item) => item.id)
      .filter((id): id is number => typeof id === "number");
    const nextId = Math.max(...numericIds, 0) + 1;
    const setlist: Setlist = {
      id: nextId,
      name,
      ownerId: null,
      owner: friendlyName,
      pieceIds: [],
      state: "draft",
      rating: 0,
      ratingCount: 0,
      comments: 0,
      reviews: [],
    };
    setSetlists((current) => [...current, setlist]);
    showBuilder(nextId);
  };
  const duplicateSetlist = async (source: Setlist) => {
    const baseName = source.name.split(" – Variante")[0];
    let variant = 2;
    const used = new Set(
      setlists.map((item) => item.name.toLocaleLowerCase("de")),
    );
    while (
      used.has(`${baseName} – Variante ${variant}`.toLocaleLowerCase("de"))
    )
      variant += 1;
    const name = `${baseName} – Variante ${variant}`;
    if (supabase && session) {
      const { data, error } = await supabase
        .from("setlists")
        .insert({
          project_id: ACTIVE_PROJECT_ID,
          owner_id: session.user.id,
          name,
          state: "draft",
          derived_from: typeof source.id === "string" ? source.id : null,
        })
        .select("id")
        .single();
      if (error || !data) {
        flash("Variante konnte nicht angelegt werden");
        return;
      }
      const items = source.pieceIds.flatMap((pieceId, index) =>
        remotePieceIds[pieceId]
          ? [
              {
                setlist_id: data.id,
                piece_id: remotePieceIds[pieceId],
                position: index + 1,
              },
            ]
          : [],
      );
      if (items.length) await supabase.from("setlist_items").insert(items);
      const duplicate: Setlist = {
        ...source,
        id: data.id,
        name,
        ownerId: session.user.id,
        owner: friendlyName,
        state: "draft",
        rating: 0,
        ratingCount: 0,
        comments: 0,
        reviews: [],
        pieceIds: [...source.pieceIds],
      };
      setSetlists((current) => [...current, duplicate]);
      showBuilder(data.id);
      flash("Variante als Entwurf angelegt");
      return;
    }
    const numericIds = setlists
      .map((item) => item.id)
      .filter((id): id is number => typeof id === "number");
    const nextId = Math.max(...numericIds, 0) + 1;
    const duplicate: Setlist = {
      ...source,
      id: nextId,
      name,
      ownerId: null,
      owner: friendlyName,
      state: "draft",
      rating: 0,
      ratingCount: 0,
      comments: 0,
      reviews: [],
      pieceIds: [...source.pieceIds],
    };
    setSetlists((current) => [...current, duplicate]);
    showBuilder(nextId);
    flash("Variante als Entwurf angelegt");
  };
  const deleteSetlist = async (setlist: Setlist) => {
    const canDelete =
      !supabase ||
      Boolean(session && (setlist.ownerId === session.user.id || isAdmin));
    if (!canDelete) return;
    const isPublished = setlist.state !== "draft";
    const consequence = isPublished
      ? `\n\nDabei werden auch ${setlist.ratingCount} ${setlist.ratingCount === 1 ? "Bewertung" : "Bewertungen"} und alle Kommentare zu dieser Setlist gelöscht.`
      : "";
    if (
      !window.confirm(
        `${isPublished ? "Die veröffentlichte Setlist" : "Den Entwurf"} „${setlist.name}“ wirklich löschen?${consequence}`,
      )
    )
      return;
    if (supabase && session && typeof setlist.id === "string") {
      const { data, error } = await supabase
        .from("setlists")
        .delete()
        .eq("id", setlist.id)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        console.error("setlist delete failed", error);
        flash("Setlist konnte nicht gelöscht werden");
        return;
      }
    }
    setSetlists((current) => current.filter((item) => item.id !== setlist.id));
    setSetlistRatings((current) => {
      const next = { ...current };
      delete next[String(setlist.id)];
      return next;
    });
    if (builderId === setlist.id || activeSetlistId === setlist.id) {
      setBuilderId(null);
      setActiveSetlistId(null);
      writeAppHash(setlistsHash(setlistFilter, setlistSort), true);
    }
    flash(
      isPublished
        ? "Setlist und zugehörige Rückmeldungen gelöscht"
        : "Entwurf gelöscht",
    );
  };
  const patchBuilder = (patch: Partial<Setlist>) => {
    if (!builderId) return;
    const current = setlists.find((item) => item.id === builderId);
    if (!current) return;
    const next = { ...current, ...patch };
    setSetlists((items) =>
      items.map((item) => (item.id === builderId ? next : item)),
    );
    queueSetlistSave(next);
  };
  const addPieceToDraft = (pieceId: number, draft: Setlist) => {
    if (
      draft.state !== "draft" ||
      (session && draft.ownerId !== session.user.id) ||
      draft.pieceIds.includes(pieceId)
    )
      return;
    const next = { ...draft, pieceIds: [...draft.pieceIds, pieceId] };
    setSetlists((items) =>
      items.map((item) => (item.id === draft.id ? next : item)),
    );
    queueSetlistSave(next);
    setAddPieceToSetlistId(null);
    flash(`Zu „${draft.name}“ hinzugefügt`);
  };
  const markSetlist = (
    id: number | string,
    state: "published" | "finalist" | "final",
  ) => {
    setSetlists((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, state }
          : state === "final" && item.state === "final"
            ? { ...item, state: "finalist" }
            : item,
      ),
    );
    if (supabase && typeof id === "string")
      void (async () => {
        if (state === "final")
          await supabase
            .from("setlists")
            .update({ state: "finalist" })
            .eq("project_id", ACTIVE_PROJECT_ID)
            .eq("state", "final");
        await supabase
          .from("setlists")
          .update({ state, updated_at: new Date().toISOString() })
          .eq("id", id);
      })();
    flash(
      state === "final"
        ? "Finale Setlist festgelegt"
        : state === "finalist"
          ? "Zur Finalrunde hinzugefügt"
          : "Markierung zurückgesetzt",
    );
  };
  const saveSetlistRating = async (setlist: Setlist, rating: SetlistRating) => {
    if (supabase && session && typeof setlist.id === "string") {
      const { error } = await supabase
        .from("setlist_ratings")
        .upsert(
          { setlist_id: setlist.id, user_id: session.user.id, ...rating },
          { onConflict: "setlist_id,user_id" },
        );
      if (error) {
        flash("Setlist-Bewertung konnte nicht gespeichert werden");
        return;
      }
    }
    const userId = session?.user.id ?? "demo-current";
    setSetlistRatings((current) => ({
      ...current,
      [String(setlist.id)]: rating,
    }));
    setSetlists((current) =>
      current.map((item) => {
        if (item.id !== setlist.id) return item;
        const reviews = [
          ...item.reviews.filter((review) => review.userId !== userId),
          { userId, author: friendlyName, ...rating },
        ];
        const stars = reviews.map((review) => review.stars);
        return {
          ...item,
          reviews,
          rating: stars.reduce((sum, value) => sum + value, 0) / stars.length,
          ratingCount: stars.length,
          comments: reviews.filter((review) => review.comment.trim()).length,
        };
      }),
    );
    flash("Setlist-Bewertung gespeichert");
  };
  const resetSetlistRating = async (setlist: Setlist) => {
    const key = String(setlist.id);
    if (!setlistRatings[key]) return true;
    const userId = session?.user.id ?? "demo-current";
    if (supabase && session && typeof setlist.id === "string") {
      const { error } = await supabase
        .from("setlist_ratings")
        .delete()
        .eq("setlist_id", setlist.id)
        .eq("user_id", session.user.id);
      if (error) {
        console.error("setlist rating reset failed", error);
        flash("Setlist-Bewertung konnte nicht zurückgesetzt werden");
        return false;
      }
    }
    setSetlistRatings((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSetlists((current) =>
      current.map((item) => {
        if (item.id !== setlist.id) return item;
        const reviews = item.reviews.filter(
          (review) => review.userId !== userId,
        );
        const stars = reviews.map((review) => review.stars);
        return {
          ...item,
          reviews,
          rating: stars.length
            ? stars.reduce((sum, value) => sum + value, 0) / stars.length
            : 0,
          ratingCount: stars.length,
          comments: reviews.filter((review) => review.comment.trim()).length,
        };
      }),
    );
    flash("Setlist-Bewertung zurückgesetzt");
    return true;
  };
  const addAllowedEmail = async () => {
    if (!supabase || !isAdmin) return;
    const entered = window
      .prompt("Welche E-Mail-Adresse soll freigeschaltet werden?")
      ?.trim()
      .toLocaleLowerCase("de");
    if (!entered) return;
    if (!/^\S+@\S+\.\S+$/.test(entered)) {
      flash("Bitte eine gültige E-Mail-Adresse eingeben");
      return;
    }
    const { error } = await supabase
      .from("signup_allowed_emails")
      .upsert({ email: entered }, { onConflict: "email" });
    if (error) {
      flash("E-Mail konnte nicht freigeschaltet werden");
      return;
    }
    setAllowedEmails((current) =>
      current.some((item) => item.email === entered)
        ? current
        : [...current, { email: entered, displayName: null }],
    );
    flash("E-Mail freigeschaltet");
  };
  const removeAllowedEmail = async (emailToRemove: string) => {
    if (
      !supabase ||
      !isAdmin ||
      !window.confirm(`${emailToRemove} von der Freigabeliste entfernen?`)
    )
      return;
    const { error } = await supabase
      .from("signup_allowed_emails")
      .delete()
      .eq("email", emailToRemove);
    if (error) {
      flash("Freigabe konnte nicht entfernt werden");
      return;
    }
    setAllowedEmails((current) =>
      current.filter((item) => item.email !== emailToRemove),
    );
    flash("Freigabe entfernt");
  };
  const deleteMember = async (member: Member) => {
    const warning = `${member.displayName} wirklich vollständig löschen?\n\nDabei werden auch alle Bewertungen, Kommentare und eigenen Setlists dieses Kontos unwiderruflich gelöscht.`;
    if (
      !supabase ||
      !isAdmin ||
      member.id === session?.user.id ||
      !window.confirm(warning)
    )
      return;
    const { data: authData } = await supabase.auth.getSession();
    if (!authData.session) {
      flash("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
      return;
    }
    const { data, error } = await supabase.functions.invoke(
      "admin-delete-user",
      {
        body: { userId: member.id },
        headers: { Authorization: `Bearer ${authData.session.access_token}` },
      },
    );
    if (error || !data?.ok) {
      let reason = data?.error as string | undefined;
      const response = (error as { context?: Response } | null)?.context;
      if (!reason && response)
        reason = await response
          .clone()
          .json()
          .then((body) => (body?.error ?? body?.message) as string | undefined)
          .catch(() => undefined);
      flash(reason || "Nutzer konnte nicht gelöscht werden");
      return;
    }
    setMembers((current) => current.filter((item) => item.id !== member.id));
    flash("Nutzer gelöscht");
  };
  const resetMemberPassword = async (member: Member) => {
    if (
      !supabase ||
      !isAdmin ||
      member.id === session?.user.id ||
      !window.confirm(
        `Für ${member.displayName} ein neues temporäres Passwort erzeugen? Das bisherige Passwort funktioniert danach nicht mehr.`,
      )
    )
      return;
    const { data: authData } = await supabase.auth.getSession();
    if (!authData.session) {
      flash("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
      return;
    }
    const { data, error } = await supabase.functions.invoke(
      "admin-reset-password",
      {
        body: { userId: member.id },
        headers: { Authorization: `Bearer ${authData.session.access_token}` },
      },
    );
    if (error || !data?.ok || typeof data?.temporaryPassword !== "string") {
      let reason = data?.error as string | undefined;
      const response = (error as { context?: Response } | null)?.context;
      if (!reason && response)
        reason = await response
          .clone()
          .json()
          .then((body) => (body?.error ?? body?.message) as string | undefined)
          .catch(() => undefined);
      flash(reason || "Temporäres Passwort konnte nicht erzeugt werden");
      return;
    }
    setTemporaryPassword({ member, password: data.temporaryPassword });
  };
  const savePieceMetadata = async (piece: Piece, patch: AdminPiecePatch) => {
    if (supabase && remotePieceIds[piece.id]) {
      const { error } = await supabase
        .from("pieces")
        .update({
          title: patch.title,
          composer: patch.composer,
          genres: patch.genres,
          sample_url: patch.sampleUrl,
          purchase_url: patch.purchaseUrl,
          solo_status: patch.soloStatus,
          solos: patch.solos,
          duration_seconds: patch.durationSeconds,
          grade: patch.grade,
          price_cents: patch.priceCents,
          owned: patch.owned,
          source: patch.source,
          subtitle: patch.subtitle,
          note: patch.note,
          updated_at: new Date().toISOString(),
        })
        .eq("id", remotePieceIds[piece.id]);
      if (error) {
        console.error("piece metadata save failed", error);
        flash("Metadaten konnten nicht gespeichert werden");
        return false;
      }
    }
    setPieceOverrides((current) => ({
      ...current,
      [piece.id]: {
        ...current[piece.id],
        ...patch,
        youtubeId: getYoutubeId(patch.sampleUrl),
      },
    }));
    setAdminEditId(null);
    flash("Metadaten gespeichert");
    return true;
  };
  const createPiece = async (patch: AdminPiecePatch) => {
    if (!supabase || !session || !isAdmin) return false;
    const localId = Math.max(0, ...catalogue.map((piece) => piece.id)) + 1;
    const { data, error } = await supabase
      .from("pieces")
      .insert({
        project_id: ACTIVE_PROJECT_ID,
        import_key: `manual-${localId}`,
        title: patch.title,
        composer: patch.composer,
        genres: patch.genres,
        sample_url: patch.sampleUrl,
        purchase_url: patch.purchaseUrl,
        solo_status: patch.soloStatus,
        solos: patch.solos,
        duration_seconds: patch.durationSeconds,
        grade: patch.grade,
        price_cents: patch.priceCents,
        owned: patch.owned,
        source: patch.source,
        subtitle: patch.subtitle,
        note: patch.note,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("piece creation failed", error);
      flash("Stück konnte nicht angelegt werden");
      return false;
    }
    const createdPiece: Piece = {
      id: localId,
      ...patch,
      youtubeId: getYoutubeId(patch.sampleUrl),
    };
    setRemotePieces((current) =>
      [...current, createdPiece].sort((a, b) =>
        a.title.localeCompare(b.title, "de"),
      ),
    );
    setRemotePieceIds((current) => ({
      ...current,
      [localId]: data.id as string,
    }));
    setAdminCreatingPiece(false);
    flash("Stück angelegt");
    return true;
  };
  const toggleMaintenance = async () => {
    if (!supabase || !session || !isAdmin) return;
    const nextEnabled = !maintenance.enabled;
    const otherOnline = onlineMemberIds.filter(
      (id) =>
        id !== session.user.id && members.some((member) => member.id === id),
    ).length;
    if (nextEnabled) {
      const warning = otherOnline
        ? `Noch ${otherOnline} ${otherOnline === 1 ? "Person ist" : "Personen sind"} online. Wartungsmodus trotzdem einschalten?`
        : "Wartungsmodus einschalten? Mitglieder sehen dann sofort die Wartungsseite.";
      if (!window.confirm(warning)) return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("app_settings")
      .update({
        maintenance_mode: nextEnabled,
        maintenance_started_at: nextEnabled ? now : null,
        maintenance_started_by: nextEnabled ? session.user.id : null,
        updated_at: now,
      })
      .eq("id", "global");
    if (error) {
      flash("Wartungsmodus konnte nicht geändert werden");
      return;
    }
    setMaintenance((current) => ({
      ...current,
      enabled: nextEnabled,
      startedAt: nextEnabled ? now : null,
    }));
    flash(
      nextEnabled
        ? "Wartungsmodus ist aktiv"
        : "App ist wieder für alle geöffnet",
    );
  };
  const openPieceCount = Math.max(0, catalogue.length - completed);
  const unratedSetlistCount = publishedSetlists.filter(
    (item) => !setlistRatings[String(item.id)],
  ).length;
  const isOwn = (item: Setlist) =>
    session ? item.ownerId === session.user.id : item.owner === friendlyName;
  const ownDraftCount = setlists.filter(
    (item) => item.state === "draft" && isOwn(item),
  ).length;
  const ownPublishedCount = publishedSetlists.filter(isOwn).length;
  const ratingTarget = supabase ? members.length : 6;
  const visibleSetlists = setlists
    .filter(
      (item) =>
        setlistFilter === "all" ||
        (setlistFilter === "finalists" &&
          (item.state === "finalist" || item.state === "final")) ||
        (setlistFilter === "mine" && item.state === "draft" && isOwn(item)) ||
        (setlistFilter === "mine-published" &&
          item.state !== "draft" &&
          isOwn(item)),
    )
    .sort((a, b) => {
      if (setlistSort === "name") return a.name.localeCompare(b.name, "de");
      if (a.state === "final" || b.state === "final")
        return Number(b.state === "final") - Number(a.state === "final");
      if (a.state === "draft" || b.state === "draft")
        return Number(a.state === "draft") - Number(b.state === "draft");
      if (setlistSort === "progress-desc")
        return (
          (ratingTarget
            ? b.ratingCount / ratingTarget - a.ratingCount / ratingTarget
            : 0) || b.rating - a.rating
        );
      if (setlistSort === "agreement-desc")
        return (
          (getSetlistAgreement(b, publishedSetlists) ?? -1) -
            (getSetlistAgreement(a, publishedSetlists) ?? -1) ||
          b.rating - a.rating
        );
      return (
        b.rating - a.rating ||
        b.ratingCount - a.ratingCount ||
        a.name.localeCompare(b.name, "de")
      );
    });
  const finalist =
    setlists.find((item) => item.state === "final") ??
    setlists.find((item) => item.state === "finalist");
  const onlineMembers = members.filter((member) =>
    onlineMemberIds.includes(member.id),
  );
  const sortedMembers = [...members].sort(
    (a, b) =>
      Number(onlineMemberIds.includes(b.id)) -
        Number(onlineMemberIds.includes(a.id)) ||
      a.displayName.localeCompare(b.displayName, "de"),
  );
  const navItems: { id: View; label: string; icon: typeof Music2 }[] = [
    { id: "home", label: "Übersicht", icon: BarChart3 },
    { id: "pieces", label: "Stücke", icon: FileMusic },
    { id: "setlists", label: "Setlists", icon: ListMusic },
    ...(isAdmin
      ? [{ id: "admin" as View, label: "Admin", icon: Settings }]
      : []),
  ];

  if (!authReady || !maintenanceReady || (supabase && session && !profileReady))
    return (
      <div className="auth-loading">
        <AppMark />
        <strong>Setlist-o-Mat stimmt sich …</strong>
      </div>
    );
  if (supabase && maintenance.enabled && (!session || !isAdmin))
    return (
      <MaintenanceScreen status={maintenance} signedIn={Boolean(session)} />
    );
  if (supabase && !session)
    return <LoginScreen supabase={supabase} initialMessage={authMessage} />;
  if (supabase && session && passwordChangeRequired)
    return (
      <RequiredPasswordScreen
        email={email}
        onSave={changeOwnPassword}
        onSignOut={() => void supabase.auth.signOut()}
      />
    );

  return (
    <main className="app-shell">
      <aside className="side-nav">
        <div className="brand-block">
          <AppMark />
          <div>
            <strong>Setlist-o-Mat</strong>
            <span>Gemeinsam. Klingt besser.</span>
          </div>
        </div>
        <nav aria-label="Hauptnavigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const count =
              item.id === "pieces"
                ? openPieceCount
                : item.id === "setlists"
                  ? unratedSetlistCount
                  : 0;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => navigateToView(item.id)}
              >
                <Icon />
                {item.label}
                {count > 0 && <span className="nav-count">{count}</span>}
              </button>
            );
          })}
        </nav>
        <div className="side-project">
          <span>Aktives Projekt</span>
          <button>
            <span>
              <Music2 /> Jahreskonzert 2027
            </span>
            <ChevronDown />
          </button>
        </div>
        <div
          className="side-online"
          title={
            onlineMembers.length
              ? onlineMembers.map((member) => member.displayName).join(", ")
              : "Niemand online"
          }
        >
          <span className="presence-dot online" />
          <strong>{onlineMembers.length} online</strong>
          <small>
            {onlineMembers.length === 1
              ? onlineMembers[0].displayName
              : onlineMembers.length
                ? "gerade in der App"
                : "gerade niemand"}
          </small>
        </div>
        <div className="side-user">
          <div className="avatar">
            {friendlyName.slice(0, 2).toLocaleUpperCase("de")}
          </div>
          <button
            className="profile-trigger"
            onClick={() => setShowProfileDialog(true)}
            aria-label="Profilnamen ändern"
          >
            <strong>{friendlyName}</strong>
            <span>{isAdmin ? "Administrator" : "Mitglied"}</span>
          </button>
          <button
            className="icon-button logout-button"
            title="Abmelden"
            aria-label="Abmelden"
            onClick={() => supabase?.auth.signOut()}
          >
            <LogOut />
          </button>
        </div>
      </aside>

      <section className="main-stage">
        <header className="mobile-header">
          <div className="mobile-brand">
            <AppMark />
            <strong>Setlist-o-Mat</strong>
          </div>
          <div className="mobile-header-actions">
            <span
              className="mobile-online"
              title={`${onlineMembers.length} online`}
            >
              <i />
              {onlineMembers.length}
            </span>
            <button
              className="icon-button"
              aria-label="Profilnamen ändern"
              onClick={() => setShowProfileDialog(true)}
            >
              <UserRound />
            </button>
            <button
              className="icon-button logout-button"
              title="Abmelden"
              aria-label="Abmelden"
              onClick={() => supabase?.auth.signOut()}
            >
              <LogOut />
            </button>
          </div>
        </header>

        {view === "home" && (
          <div className="page dashboard-page">
            <div className="page-heading home-heading">
              <div>
                <span className="eyebrow">
                  <Sparkles /> Jahreskonzert 2027
                </span>
                <h1>Hallo {friendlyName}, was klingt gut?</h1>
                <p>
                  Noch {catalogue.length - completed} Stücke warten auf deine
                  Ohren. Danach darfst du bei den anderen spicken.
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() => navigateToView("pieces")}
              >
                <Headphones /> Weiter bewerten
              </button>
            </div>
            <div className="dashboard-grid">
              <article className="hero-card progress-card">
                <div className="card-topline">
                  <span>Dein Bewertungsfortschritt</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="big-progress">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="progress-copy">
                  <strong>
                    {completed} von {catalogue.length}
                  </strong>
                  <span>
                    Noch {catalogue.length - completed} Hörproben – eine gute
                    Playlistlänge.
                  </span>
                </div>
                <button
                  onClick={() => {
                    setOnlyOpen(true);
                    setView("pieces");
                    writeAppHash(piecesHash(search, genre, true, pieceSort));
                  }}
                >
                  Offene Stücke ansehen <ChevronRight />
                </button>
                <div className="vinyl-art" aria-hidden="true">
                  <span />
                  <Music2 />
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-icon purple">
                  <Users />
                </div>
                <div>
                  <span>Teilnehmer</span>
                  <strong>{supabase ? members.length : 6}</strong>
                  <small>
                    {supabase ? "im aktuellen Projekt" : "5 zuletzt aktiv"}
                  </small>
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-icon coral">
                  <ListMusic />
                </div>
                <div>
                  <span>Veröffentlichte Setlists</span>
                  <strong>{publishedSetlists.length}</strong>
                  <small>
                    {
                      setlists.filter(
                        (item) =>
                          item.state === "finalist" || item.state === "final",
                      ).length
                    }{" "}
                    in der Finalrunde
                  </small>
                </div>
              </article>
              {finalist ? (
                <article className="content-card finalist-card">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">
                        <Trophy /> Finalrunde
                      </span>
                      <h2>{finalist.name}</h2>
                    </div>
                    <span className="status-pill finalist">
                      {finalist.state === "final" ? "Final" : "Finalist"}
                    </span>
                  </div>
                  <p className="muted">
                    von {finalist.owner} · {finalist.pieceIds.length} Stücke
                  </p>
                  <TimeSignal
                    duration={getMetrics(finalist.pieceIds, catalogue).duration}
                  />
                  <div className="mini-stats">
                    <span>
                      <Star fill="currentColor" />{" "}
                      {finalist.rating.toFixed(1).replace(".", ",")}{" "}
                      <small>
                        ({finalist.ratingCount}/{Math.max(members.length, 6)})
                      </small>
                    </span>
                    <span>
                      <MessageCircle /> {finalist.comments} Kommentare
                    </span>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => openSetlist(finalist.id)}
                  >
                    Jetzt bewerten <ChevronRight />
                  </button>
                </article>
              ) : (
                <article className="content-card finalist-card">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">
                        <Trophy /> Finalrunde
                      </span>
                      <h2>Noch alles offen</h2>
                    </div>
                  </div>
                  <p className="muted">
                    Sobald eine Setlist markiert ist, erscheint sie hier.
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => navigateToView("setlists")}
                  >
                    Setlists ansehen <ChevronRight />
                  </button>
                </article>
              )}
              {nextPiece && (
                <article className="content-card next-up-card">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">
                        <Headphones /> Als Nächstes
                      </span>
                      <h2>{nextPiece.title}</h2>
                    </div>
                  </div>
                  <p>{nextPiece.composer}</p>
                  <div className="piece-facts">
                    <span>
                      <Clock3 /> {formatDuration(nextPiece.durationSeconds)}
                    </span>
                    <span>Grade {nextPiece.grade}</span>
                    <span className="genre-chip">
                      {nextPiece.genres[0] ?? "Genre offen"}
                    </span>
                  </div>
                  <button
                    className="play-button"
                    onClick={() => openPiece(nextPiece.id)}
                  >
                    <Play fill="currentColor" /> Hörprobe starten
                  </button>
                </article>
              )}
            </div>
          </div>
        )}

        {view === "pieces" && (
          <div className="page pieces-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  <Headphones /> Stücke bewerten
                </span>
                <h1>Deine Ohren, deine Meinung.</h1>
                <p>
                  Bewerte erst selbst – danach siehst du, was die anderen
                  denken.
                </p>
              </div>
              <div className="compact-progress">
                <strong>
                  {completed}/{catalogue.length}
                </strong>
                <div>
                  <span style={{ width: `${progress}%` }} />
                </div>
                <small>bearbeitet</small>
              </div>
            </div>
            <div className="filter-bar">
              <div className="search-field" role="search">
                <Search />
                <input
                  aria-label="Titel oder Arrangeur suchen"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Titel oder Arrangeur suchen"
                />
                {search && (
                  <button
                    className="clear-search-button"
                    onClick={() => setSearch("")}
                    aria-label="Suchtext löschen"
                  >
                    <X />
                  </button>
                )}
              </div>
              <label className="select-field">
                <Filter />
                <select
                  aria-label="Genre filtern"
                  value={genre}
                  onChange={(event) => setGenre(event.target.value)}
                >
                  {genres.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <ChevronDown />
              </label>
              <label className="select-field sort-field">
                <BarChart3 />
                <select
                  aria-label="Stücke sortieren"
                  value={pieceSort}
                  onChange={(event) =>
                    setPieceSort(event.target.value as PieceSort)
                  }
                >
                  <option value="title">Titel A–Z</option>
                  <option value="own-desc">Meine Bewertung</option>
                  <option value="group-desc">Gruppenbewertung</option>
                  {showConsensus && (
                    <option value="frequency-desc">
                      In Setlists vertreten
                    </option>
                  )}
                </select>
                <ChevronDown />
              </label>
              <button
                className={onlyOpen ? "toggle active" : "toggle"}
                aria-pressed={onlyOpen}
                onClick={() => setOnlyOpen((current) => !current)}
              >
                <span /> Nur offene
              </button>
              {hasActivePieceFilters && (
                <button className="clear-filters" onClick={clearPieceFilters}>
                  <X /> Filter löschen
                </button>
              )}
            </div>
            <div className="piece-list-head">
              <span>{filteredPieces.length} Stücke</span>
              <span>
                {pieceSort === "title"
                  ? "Titel A–Z"
                  : pieceSort === "own-desc"
                    ? "Meine Bewertung · höchste zuerst"
                    : pieceSort === "group-desc"
                      ? "Gruppenbewertung · höchste zuerst"
                      : "Am häufigsten in Setlists"}
              </span>
            </div>
            <div className="piece-list">
              {filteredPieces.map((piece) => {
                const own = ratings[piece.id];
                const group = groupRatings[piece.id];
                return (
                  <article
                    className={`piece-row ${own ? "rated" : ""}`}
                    key={piece.id}
                  >
                    <button
                      className="piece-play"
                      onClick={() => openPiece(piece.id)}
                      disabled={!piece.youtubeId}
                      aria-label={`Hörprobe ${piece.title}`}
                    >
                      <Play fill="currentColor" />
                    </button>
                    <button
                      className="piece-main"
                      onClick={() => openPiece(piece.id)}
                    >
                      <div className="piece-title-line">
                        <h3>{piece.title}</h3>
                        {own && (
                          <span className="rated-pill">
                            <Check /> {own.skipped ? "Bearbeitet" : "Bewertet"}
                          </span>
                        )}
                        {piece.owned && (
                          <span className="owned-pill">
                            <BadgeCheck /> Im Bestand
                          </span>
                        )}
                        {showConsensus && (
                          <HotnessIndicator
                            count={pieceOccurrenceCounts[piece.id] ?? 0}
                            total={publishedSetlists.length}
                            compact
                          />
                        )}
                      </div>
                      <p>{piece.composer}</p>
                      <div className="piece-facts">
                        <span>
                          <Clock3 /> {formatDuration(piece.durationSeconds)}
                        </span>
                        <span>Grade {piece.grade}</span>
                        <span>
                          <Euro /> {formatPiecePrice(piece)}
                        </span>
                        <span className="genre-chip">
                          {piece.genres[0] ?? "Genre offen"}
                        </span>
                        {piece.soloStatus === "available" && (
                          <span className="solo-chip">
                            <UserRound /> Solo
                          </span>
                        )}
                        {piece.soloStatus === "unknown" && (
                          <span className="solo-chip unknown">
                            <CircleHelp /> Soli?
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="rating-cell">
                      {own ? (
                        <>
                          {own.skipped ? (
                            <span className="skipped-rating">
                              <CircleHelp /> Nicht beurteilt
                            </span>
                          ) : (
                            <Stars value={own.stars} small />
                          )}
                          <span className="average-note">
                            {group?.count
                              ? `Ø Gruppe ${group.average.toFixed(1).replace(".", ",")}`
                              : "Noch keine Gruppenwertung"}
                          </span>
                          <PieceCommentsToggle
                            rating={own}
                            groupRating={group}
                          />
                        </>
                      ) : (
                        <>
                          <span className="locked-rating">
                            <Lock /> Gruppe noch verborgen
                          </span>
                          <button onClick={() => openPiece(piece.id)}>
                            Bewerten
                          </button>
                        </>
                      )}
                    </div>
                    <ChevronRight className="row-chevron" />
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {view === "setlists" && (
          <div className="page setlists-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  <ListMusic /> Setlists
                </span>
                <h1>30 Minuten. Unendlich viele Möglichkeiten.</h1>
                <p>
                  Baue Varianten, veröffentliche deine Favoriten und finde
                  gemeinsam das beste Programm.
                </p>
              </div>
              <button className="primary-button" onClick={createSetlist}>
                <Plus /> Neue Setlist
              </button>
            </div>
            <div
              className="setlist-tabs"
              role="tablist"
              aria-label="Setlists filtern"
            >
              <button
                role="tab"
                aria-selected={setlistFilter === "all"}
                className={setlistFilter === "all" ? "active" : ""}
                onClick={() => {
                  setSetlistFilter("all");
                  writeAppHash(setlistsHash("all", setlistSort), true);
                }}
              >
                Alle <span>{setlists.length}</span>
              </button>
              <button
                role="tab"
                aria-selected={setlistFilter === "finalists"}
                className={setlistFilter === "finalists" ? "active" : ""}
                onClick={() => {
                  setSetlistFilter("finalists");
                  writeAppHash(setlistsHash("finalists", setlistSort), true);
                }}
              >
                Finalrunde{" "}
                <span>
                  {
                    setlists.filter(
                      (item) =>
                        item.state === "finalist" || item.state === "final",
                    ).length
                  }
                </span>
              </button>
              <button
                role="tab"
                aria-selected={setlistFilter === "mine"}
                className={setlistFilter === "mine" ? "active" : ""}
                onClick={() => {
                  setSetlistFilter("mine");
                  writeAppHash(setlistsHash("mine", setlistSort), true);
                }}
              >
                Meine Entwürfe <span>{ownDraftCount}</span>
              </button>
              <button
                role="tab"
                aria-selected={setlistFilter === "mine-published"}
                className={setlistFilter === "mine-published" ? "active" : ""}
                onClick={() => {
                  setSetlistFilter("mine-published");
                  writeAppHash(
                    setlistsHash("mine-published", setlistSort),
                    true,
                  );
                }}
              >
                Meine veröffentlichten <span>{ownPublishedCount}</span>
              </button>
            </div>
            <div className="setlist-list-controls">
              <label className="select-field sort-field">
                <BarChart3 />
                <select
                  aria-label="Setlists sortieren"
                  value={setlistSort}
                  onChange={(event) =>
                    setSetlistSort(event.target.value as SetlistSort)
                  }
                >
                  <option value="rating-desc">Gruppenbewertung</option>
                  <option value="progress-desc">Bewertungsfortschritt</option>
                  {showConsensus && (
                    <option value="agreement-desc">Übereinstimmung</option>
                  )}
                  <option value="name">Name A–Z</option>
                </select>
                <ChevronDown />
              </label>
              <button
                className={`consensus-toggle ${showConsensus ? "active" : ""}`}
                aria-pressed={showConsensus}
                onClick={() => {
                  const next = !showConsensus;
                  setShowConsensus(next);
                  localStorage.setItem(
                    "setlist-o-mat:consensus",
                    next ? "on" : "off",
                  );
                  if (!next && pieceSort === "frequency-desc")
                    setPieceSort("title");
                  if (!next && setlistSort === "agreement-desc")
                    setSetlistSort("rating-desc");
                }}
              >
                {showConsensus ? <Eye /> : <EyeOff />} Konsenshinweise
              </button>
            </div>
            {visibleSetlists.length ? (
              <div className="setlist-grid">
                {visibleSetlists.map((setlist) => {
                  const metrics = getMetrics(setlist.pieceIds, catalogue);
                  const ownSetlistRating = setlistRatings[String(setlist.id)];
                  const isOwnSetlist =
                    !session || setlist.ownerId === session.user.id;
                  const agreement = getSetlistAgreement(
                    setlist,
                    publishedSetlists,
                  );
                  return (
                    <article
                      className={`setlist-card state-${setlist.state}`}
                      key={setlist.id}
                    >
                      <div className="setlist-card-head">
                        <div>
                          {setlist.state === "draft" ? (
                            <Lock />
                          ) : setlist.state === "finalist" ||
                            setlist.state === "final" ? (
                            <Trophy />
                          ) : (
                            <ListMusic />
                          )}
                        </div>
                        <span className={`status-pill ${setlist.state}`}>
                          {setlist.state === "draft"
                            ? isOwnSetlist
                              ? "Mein Entwurf"
                              : "Fremder Entwurf"
                            : setlist.state === "finalist"
                              ? "Finalrunde"
                              : setlist.state === "final"
                                ? "Finale Setlist"
                                : "Veröffentlicht"}
                        </span>
                      </div>
                      <h2>
                        {setlist.state !== "draft" ? (
                          <button
                            className="setlist-title-link"
                            onClick={() => openSetlist(setlist.id)}
                          >
                            {setlist.name}
                          </button>
                        ) : isOwnSetlist ? (
                          <button
                            className="setlist-title-link"
                            onClick={() => openBuilder(setlist.id)}
                          >
                            {setlist.name}
                          </button>
                        ) : (
                          setlist.name
                        )}
                      </h2>
                      <p>
                        {isOwnSetlist ? "von dir" : `von ${setlist.owner}`} ·{" "}
                        {setlist.pieceIds.length} Stücke
                      </p>
                      <TimeSignal duration={metrics.duration} compact />
                      <div className="setlist-piece-preview">
                        {metrics.selected.map((piece, index) => (
                          <span key={piece.id}>
                            <b>{index + 1}</b>
                            <span className="setlist-preview-title">
                              {piece.title}
                              {piece.soloStatus === "available" && (
                                <em className="setlist-preview-solo">
                                  <UserRound /> Solo
                                </em>
                              )}
                              {piece.soloStatus === "unknown" && (
                                <em className="setlist-preview-solo unknown">
                                  <CircleHelp /> Soli?
                                </em>
                              )}
                            </span>
                            {showConsensus && (
                              <HotnessIndicator
                                count={pieceOccurrenceCounts[piece.id] ?? 0}
                                total={publishedSetlists.length}
                                compact
                              />
                            )}
                            <small>
                              {formatDuration(piece.durationSeconds)}
                            </small>
                          </span>
                        ))}
                      </div>
                      <div className="genre-line">
                        {metrics.genres.map((item) => (
                          <span className="genre-chip" key={item}>
                            {item}
                          </span>
                        ))}
                      </div>
                      {showConsensus && (
                        <AgreementIndicator value={agreement} compact />
                      )}
                      <div className="setlist-footer">
                        {setlist.state === "draft" ? (
                          isOwnSetlist ? (
                            <button
                              className="setlist-continue-button"
                              onClick={() => openBuilder(setlist.id)}
                            >
                              <Pencil /> Weiterbauen
                            </button>
                          ) : (
                            <span className="readonly-draft">
                              <Lock /> Schreibgeschützt
                            </span>
                          )
                        ) : (
                          <button
                            className="setlist-score score-button setlist-card-rating"
                            onClick={() => openSetlist(setlist.id)}
                          >
                            <span className="setlist-rating-row group">
                              <span title="Gruppe" aria-label="Gruppe"><Users /></span>
                              <DisplayStars
                                value={setlist.ratingCount ? setlist.rating : 0}
                              />
                              <strong>
                                {setlist.ratingCount
                                  ? setlist.rating.toFixed(1).replace(".", ",")
                                  : "–"}
                              </strong>
                              <small>
                                ({setlist.ratingCount}/{ratingTarget || "–"})
                              </small>
                            </span>
                            <span className="setlist-rating-row own">
                              <span title="Du" aria-label="Du"><UserRound /></span>
                              {ownSetlistRating ? (
                                <>
                                  <DisplayStars
                                    value={ownSetlistRating.stars}
                                  />
                                  <small>deine Bewertung</small>
                                </>
                              ) : (
                                <small>noch nicht bewertet</small>
                              )}
                            </span>
                            <span className="setlist-rating-progress">
                              <i
                                style={{
                                  width: `${ratingTarget ? Math.min(100, (setlist.ratingCount / ratingTarget) * 100) : 0}%`,
                                }}
                              />
                            </span>
                          </button>
                        )}
                      </div>
                      {isAdmin && setlist.state !== "draft" && (
                        <div className="admin-setlist-actions">
                          <span>Admin-Auswahl</span>
                          {setlist.state !== "finalist" &&
                            setlist.state !== "final" && (
                              <button
                                onClick={() =>
                                  markSetlist(setlist.id, "finalist")
                                }
                              >
                                <Trophy /> Finalrunde
                              </button>
                            )}
                          {setlist.state === "finalist" && (
                            <button
                              onClick={() => markSetlist(setlist.id, "final")}
                            >
                              <BadgeCheck /> Als final festlegen
                            </button>
                          )}
                          {(setlist.state === "finalist" ||
                            setlist.state === "final") && (
                            <button
                              onClick={() =>
                                markSetlist(setlist.id, "published")
                              }
                            >
                              <X /> Zurücksetzen
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-setlists">
                <ListMusic />
                <strong>Hier ist noch nichts gelandet.</strong>
                <span>
                  {setlistFilter === "mine"
                    ? "Lege eine neue Setlist an – sie bleibt bis zur Veröffentlichung privat."
                    : setlistFilter === "mine-published"
                      ? "Du hast noch keine eigene Setlist veröffentlicht."
                      : "Sobald eine Setlist für diese Auswahl passt, erscheint sie hier."}
                </span>
              </div>
            )}
          </div>
        )}

        {view === "admin" && isAdmin && (
          <div className="page admin-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  <Settings /> Adminbereich
                </span>
                <h1>Alles im Takt halten.</h1>
                <p>
                  Metadaten vervollständigen, Teilnehmer verwalten und den
                  Auswahlprozess steuern.
                </p>
              </div>
            </div>
            <article
              className={`maintenance-card ${maintenance.enabled ? "active" : ""}`}
            >
              <div className="maintenance-icon">
                {maintenance.enabled ? <Construction /> : <Power />}
              </div>
              <div>
                <span className="eyebrow">Wartung</span>
                <h2>
                  {maintenance.enabled
                    ? "Die App ist für Mitglieder gesperrt."
                    : "Die App ist geöffnet."}
                </h2>
                <p>
                  {maintenance.enabled
                    ? "Bestehende Sitzungen bleiben erhalten. Mitglieder gelangen automatisch zurück, sobald du die Wartung beendest."
                    : `${onlineMembers.filter((member) => member.id !== session?.user.id).length} weitere Personen sind gerade online. Vor einem Datenbank-Update am besten warten, bis hier 0 steht.`}
                </p>
              </div>
              <button
                className={
                  maintenance.enabled
                    ? "primary-button maintenance-off"
                    : "secondary-button"
                }
                onClick={() => void toggleMaintenance()}
              >
                {maintenance.enabled ? (
                  <>
                    <Power /> Wartung beenden
                  </>
                ) : (
                  <>
                    <Construction /> Wartung starten
                  </>
                )}
              </button>
            </article>
            <div className="admin-metrics">
              <article>
                <div className="metric-icon coral">
                  <CircleHelp />
                </div>
                <div>
                  <strong>
                    {
                      catalogue.filter(
                        (piece) => piece.soloStatus === "unknown",
                      ).length
                    }
                  </strong>
                  <span>Soli noch offen</span>
                </div>
              </article>
              <article>
                <div className="metric-icon yellow">
                  <Filter />
                </div>
                <div>
                  <strong>
                    {
                      catalogue.filter((piece) => piece.genres.length === 0)
                        .length
                    }
                  </strong>
                  <span>Genres fehlen</span>
                </div>
              </article>
              <article>
                <div className="metric-icon purple">
                  <Activity />
                </div>
                <div>
                  <strong>{onlineMembers.length}</strong>
                  <span>Gerade online</span>
                </div>
              </article>
              <article>
                <div className="metric-icon green">
                  <BadgeCheck />
                </div>
                <div>
                  <strong>
                    {catalogue.filter((piece) => piece.owned).length}
                  </strong>
                  <span>Stücke im Bestand</span>
                </div>
              </article>
            </div>
            <div className="admin-columns">
              <article className="content-card admin-table-card">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">Stückdaten</span>
                    <h2>Gesamter Katalog</h2>
                  </div>
                  <div className="admin-catalog-actions">
                    <span className="status-pill draft">
                      {incompletePieceCount} unvollständig
                    </span>
                    <button
                      className="icon-button"
                      onClick={() => setAdminCreatingPiece(true)}
                      title="Neues Stück"
                      aria-label="Neues Stück anlegen"
                    >
                      <Plus />
                    </button>
                  </div>
                </div>
                <div className="admin-piece-controls">
                  <label className="search-field">
                    <Search />
                    <input
                      value={adminPieceSearch}
                      onChange={(event) =>
                        setAdminPieceSearch(event.target.value)
                      }
                      placeholder="Titel, Komponist, Quelle …"
                    />
                  </label>
                  <button
                    className={adminOnlyIncomplete ? "toggle active" : "toggle"}
                    onClick={() => setAdminOnlyIncomplete((value) => !value)}
                  >
                    <Filter /> Nur unvollständige
                  </button>
                </div>
                <div className="admin-piece-list">
                  {adminPieces.map((piece) => {
                    const missing = getMissingPieceFields(piece);
                    return (
                      <button
                        key={piece.id}
                        onClick={() => setAdminEditId(piece.id)}
                      >
                        <div>
                          <strong>{piece.title}</strong>
                          <span>{piece.composer}</span>
                        </div>
                        <div className="missing-tags">
                          {missing.length ? (
                            missing
                              .slice(0, 2)
                              .map((field) => (
                                <em key={field}>{field} fehlt</em>
                              ))
                          ) : (
                            <em className="complete">Vollständig</em>
                          )}
                          {missing.length > 2 && <em>+{missing.length - 2}</em>}
                          <Pencil />
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!adminPieces.length && (
                  <p className="admin-empty">
                    Keine passenden Stücke gefunden.
                  </p>
                )}
              </article>
              <article className="content-card member-card">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">Teilnehmer</span>
                    <h2>Wer ist dabei?</h2>
                  </div>
                  <button
                    className="icon-button"
                    onClick={addAllowedEmail}
                    aria-label="E-Mail freigeben"
                  >
                    <Plus />
                  </button>
                </div>
                {sortedMembers.map((member, index) => {
                  const online = onlineMemberIds.includes(member.id);
                  const ratingProgress = catalogue.length
                    ? Math.round(
                        (member.ratingsCompleted / catalogue.length) * 100,
                      )
                    : 0;
                  return (
                    <div
                      className={`member-row ${online ? "member-online" : ""}`}
                      key={member.id}
                    >
                      <div className={`avatar color-${index}`}>
                        {member.displayName
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toLocaleUpperCase("de")}
                      </div>
                      <div className="member-copy">
                        <strong>
                          <span
                            className={`presence-dot ${online ? "online" : "offline"}`}
                          />
                          {member.displayName}
                        </strong>
                        <span>{member.email}</span>
                        <span>
                          {member.isAdmin ? "Administrator" : "Mitglied"} ·{" "}
                          {online
                            ? "jetzt online"
                            : `zuletzt ${formatLastActive(member.lastSeenAt)}`}
                        </span>
                        <div className="member-progress">
                          <i>
                            <b style={{ width: `${ratingProgress}%` }} />
                          </i>
                          <small>
                            {member.ratingsCompleted} von {catalogue.length}{" "}
                            Stücken bearbeitet
                          </small>
                        </div>
                      </div>
                      {member.id !== session?.user.id ? (
                        <div className="member-actions">
                          <button
                            className="icon-button"
                            title="Temporäres Passwort erzeugen"
                            aria-label={`Temporäres Passwort für ${member.displayName} erzeugen`}
                            onClick={() => void resetMemberPassword(member)}
                          >
                            <KeyRound />
                          </button>
                          <button
                            className="icon-button danger"
                            title="Nutzer vollständig löschen"
                            aria-label={`${member.displayName} löschen`}
                            onClick={() => void deleteMember(member)}
                          >
                            <Trash2 />
                          </button>
                        </div>
                      ) : (
                        <span className="self-label">Du</span>
                      )}
                    </div>
                  );
                })}
                {allowedEmails
                  .filter(
                    (entry) =>
                      !members.some(
                        (member) =>
                          member.email.toLocaleLowerCase("de") ===
                          entry.email.toLocaleLowerCase("de"),
                      ),
                  )
                  .map((entry, index) => (
                    <div className="member-row" key={entry.email}>
                      <div
                        className={`avatar color-${(members.length + index) % 6}`}
                      >
                        ?
                      </div>
                      <div>
                        <strong>{entry.displayName || entry.email}</strong>
                        <span>Freigabeliste · noch nie angemeldet</span>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`${entry.email} entfernen`}
                        onClick={() => void removeAllowedEmail(entry.email)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  ))}
              </article>
            </div>
          </div>
        )}
      </section>

      <nav className="bottom-nav" aria-label="Mobile Navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const count =
            item.id === "pieces"
              ? openPieceCount
              : item.id === "setlists"
                ? unratedSetlistCount
                : 0;
          return (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => navigateToView(item.id)}
            >
              <Icon />
              <span>{item.label}</span>
              {count > 0 && <i>{count}</i>}
            </button>
          );
        })}
      </nav>
      {activePiece && (
        <PieceDialog
          piece={activePiece}
          rating={ratings[activePiece.id]}
          groupRating={groupRatings[activePiece.id]}
          onAddToSetlist={() => setAddPieceToSetlistId(activePiece.id)}
          onClose={closePiece}
          onReset={() => resetPieceRating(activePiece.id)}
          onSave={(rating) => saveRating(activePiece.id, rating)}
        />
      )}
      {activeSetlist && (
        <SetlistDialog
          catalogue={catalogue}
          setlist={activeSetlist}
          rating={setlistRatings[String(activeSetlist.id)]}
          pieceRatings={ratings}
          groupRatings={groupRatings}
          occurrenceCounts={pieceOccurrenceCounts}
          publishedCount={publishedSetlists.length}
          agreement={getSetlistAgreement(activeSetlist, publishedSetlists)}
          showConsensus={showConsensus}
          currentUserId={session?.user.id ?? "demo-current"}
          canDelete={
            !supabase || activeSetlist.ownerId === session?.user.id || isAdmin
          }
          onClose={closeSetlist}
          onDelete={() => void deleteSetlist(activeSetlist)}
          onDuplicate={() => void duplicateSetlist(activeSetlist)}
          onReset={() => resetSetlistRating(activeSetlist)}
          onSave={(rating) => {
            void saveSetlistRating(activeSetlist, rating);
            closeSetlist();
          }}
        />
      )}
      {builder &&
        builder.state === "draft" &&
        (!session || builder.ownerId === session.user.id) && (
          <BuilderDialog
            catalogue={catalogue}
            setlist={builder}
            pieceRatings={ratings}
            groupRatings={groupRatings}
            occurrenceCounts={pieceOccurrenceCounts}
            publishedCount={publishedSetlists.length}
            agreement={getSetlistAgreement(builder, publishedSetlists)}
            showConsensus={showConsensus}
            saveState={setlistSaveState}
            onRetry={() => void flushSetlistSaves()}
            onClose={closeBuilder}
            onDelete={() => void deleteSetlist(builder)}
            onDuplicate={() => void duplicateSetlist(builder)}
            onRandomizeName={() =>
              patchBuilder({
                name: uniqueSetlistName(
                  setlists
                    .filter((item) => item.id !== builder.id)
                    .map((item) => item.name),
                ),
              })
            }
            onPatch={patchBuilder}
            onPublish={() => {
              patchBuilder({ state: "published" });
              closeBuilder();
              flash("Setlist veröffentlicht – jetzt darf bewertet werden");
            }}
          />
        )}
      {addPieceToSetlistId !== null && (
        <AddPieceToSetlistDialog
          piece={
            catalogue.find((item) => item.id === addPieceToSetlistId) ?? null
          }
          drafts={setlists.filter(
            (item) =>
              item.state === "draft" &&
              (!session || item.ownerId === session.user.id),
          )}
          onClose={() => setAddPieceToSetlistId(null)}
          onAdd={(draft) => addPieceToDraft(addPieceToSetlistId, draft)}
          onOpenSetlists={() => {
            setAddPieceToSetlistId(null);
            navigateToView("setlists");
          }}
        />
      )}
      {adminPiece && (
        <AdminPieceDialog
          piece={adminPiece}
          onClose={() => setAdminEditId(null)}
          onSave={(patch) => savePieceMetadata(adminPiece, patch)}
        />
      )}
      {adminCreatingPiece && (
        <AdminPieceDialog
          piece={emptyPiece}
          creating
          onClose={() => setAdminCreatingPiece(false)}
          onSave={createPiece}
        />
      )}
      {showProfileDialog && supabase && session && (
        <ProfileNameDialog
          initialName={suggestedProfileName}
          required={!profileNameConfirmedAt}
          email={email}
          onClose={() => setShowProfileDialog(false)}
          onSave={saveProfileName}
          onChangePassword={changeOwnPassword}
        />
      )}
      {temporaryPassword && (
        <TemporaryPasswordDialog
          result={temporaryPassword}
          onClose={() => setTemporaryPassword(null)}
          onCopied={() => flash("Temporäres Passwort kopiert")}
        />
      )}
      {availableVersion && (
        <aside className="update-banner" role="status">
          <RefreshCw />
          <span>
            <strong>Neue Version verfügbar</strong>
            <small>
              Einmal aktualisieren, dann bist du wieder auf dem neuesten Stand.
            </small>
          </span>
          <button onClick={() => reloadForVersion(availableVersion)}>
            Jetzt aktualisieren
          </button>
        </aside>
      )}
      {toast && (
        <div className="toast">
          <Check /> {toast}
        </div>
      )}
    </main>
  );
}

function AddPieceToSetlistDialog({
  piece,
  drafts,
  onClose,
  onAdd,
  onOpenSetlists,
}: {
  piece: Piece | null;
  drafts: Setlist[];
  onClose: () => void;
  onAdd: (draft: Setlist) => void;
  onOpenSetlists: () => void;
}) {
  if (!piece) return null;
  return (
    <div
      className="dialog-backdrop mini-dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="dialog add-piece-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${piece.title} zu einer Setlist hinzufügen`}
      >
        <button className="dialog-close" onClick={onClose}>
          <X />
        </button>
        <span className="eyebrow">
          <ListPlus /> Zu Setlist hinzufügen
        </span>
        <h2>{piece.title}</h2>
        <p>Wähle einen deiner privaten Entwürfe.</p>
        <div className="draft-choice-list">
          {drafts.map((draft) => {
            const included = draft.pieceIds.includes(piece.id);
            return (
              <button
                key={draft.id}
                disabled={included}
                onClick={() => onAdd(draft)}
              >
                <ListMusic />
                <span>
                  <strong>{draft.name}</strong>
                  <small>
                    {draft.pieceIds.length} Stücke
                    {included ? " · bereits enthalten" : ""}
                  </small>
                </span>
                <ChevronRight />
              </button>
            );
          })}
        </div>
        {!drafts.length && (
          <div className="empty-draft-choice">
            <Lock />
            <span>Du hast aktuell keinen privaten Entwurf.</span>
            <button className="secondary-button" onClick={onOpenSetlists}>
              Zu den Setlists
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function MaintenanceScreen({
  status,
  signedIn,
}: {
  status: MaintenanceStatus;
  signedIn: boolean;
}) {
  return (
    <main className="auth-page maintenance-page">
      <section className="maintenance-screen">
        <div className="maintenance-screen-mark">
          <AppMark />
          <Construction />
        </div>
        <span className="eyebrow">
          <Sparkles /> Kurze Generalpause
        </span>
        <h1>Der Setlist-o-Mat wird gerade gestimmt.</h1>
        <p>{status.message}</p>
        <div className="maintenance-wait">
          <Activity />
          <span>
            {signedIn
              ? "Du bleibst angemeldet und gelangst automatisch zurück, sobald alles fertig ist."
              : "Die Anmeldung öffnet sich automatisch wieder, sobald alles fertig ist."}
          </span>
        </div>
        {status.startedAt && (
          <small>
            Wartung seit{" "}
            {new Date(status.startedAt).toLocaleTimeString("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            Uhr
          </small>
        )}
      </section>
    </main>
  );
}

function LoginScreen({
  supabase,
  initialMessage,
}: {
  supabase: SupabaseClient;
  initialMessage: string | null;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(initialMessage);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    const normalizedEmail = email.trim().toLocaleLowerCase("de");
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          })
        : await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: {
                display_name: displayName.trim().replace(/\s+/g, " "),
                signup_code: signupCode.trim().toLocaleUpperCase("de"),
              },
            },
          });
    setBusy(false);
    if (result.error) {
      setMessage(friendlyAuthError(result.error.message, result.error.code));
      return;
    }
    if (mode === "signup" && !result.data.session)
      setMessage(
        "Das Konto wurde angelegt, wartet aber noch auf eine Bestätigung. Bitte melde dich kurz bei Fabian.",
      );
  };

  const signupReady =
    mode === "signin" ||
    (displayName.trim().length >= 2 && signupCode.trim().length >= 6);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <AppMark />
          <div>
            <strong>Setlist-o-Mat</strong>
            <span>Gemeinsam. Klingt besser.</span>
          </div>
        </div>
        <div className="auth-art" aria-hidden="true">
          <Music2 />
          <span>♪</span>
          <i>✦</i>
        </div>
        <div className="auth-copy">
          <span className="eyebrow">
            <Sparkles /> Jahreskonzert 2027
          </span>
          <h1>
            {mode === "signin" ? "Willkommen zurück." : "Komm in die Runde."}
          </h1>
          <p>
            {mode === "signin"
              ? "Melde dich mit deiner E-Mail-Adresse und deinem Passwort an. Dafür wird keine Mail verschickt."
              : "Lege deinen Namen und ein Passwort fest. Du kannst danach sofort loslegen – ganz ohne Bestätigungsmail."}
          </p>
          <div
            className="auth-tabs"
            role="tablist"
            aria-label="Anmeldung oder Registrierung"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={mode === "signin" ? "active" : ""}
              onClick={() => {
                setMode("signin");
                setMessage(null);
              }}
            >
              Anmelden
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "active" : ""}
              onClick={() => {
                setMode("signup");
                setMessage(null);
              }}
            >
              Neu registrieren
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {mode === "signup" && (
              <label>
                <span>Dein Name</span>
                <input
                  autoComplete="name"
                  type="text"
                  required
                  minLength={2}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Fabian Rademacher"
                />
              </label>
            )}
            <label>
              <span>E-Mail-Adresse</span>
              <input
                autoComplete="email"
                inputMode="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@beispiel.de"
              />
            </label>
            <label>
              <span>
                Passwort <small>mindestens 8 Zeichen</small>
              </span>
              <input
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mindestens 8 Zeichen"
              />
            </label>
            {mode === "signup" && (
              <label>
                <span>
                  Gruppencode <small>aus der WhatsApp-Gruppe</small>
                </span>
                <input
                  autoComplete="off"
                  spellCheck={false}
                  type="text"
                  required
                  value={signupCode}
                  onChange={(event) =>
                    setSignupCode(event.target.value.toLocaleUpperCase("de"))
                  }
                  placeholder="TAKT-……"
                />
              </label>
            )}
            <button
              className="primary-button"
              disabled={
                busy || !email.trim() || password.length < 8 || !signupReady
              }
            >
              {busy
                ? "Einen Moment …"
                : mode === "signin"
                  ? "Anmelden"
                  : "Konto anlegen"}
              <ChevronRight />
            </button>
          </form>
          {message && (
            <div className="auth-message">
              <CircleHelp />
              {message}
            </div>
          )}
          <div className="auth-hint">
            <BadgeCheck />
            <span>
              <strong>@musikverein-verl.de</strong> ist automatisch
              freigeschaltet. Andere Adressen müssen zusätzlich auf der
              Freigabeliste stehen.
            </span>
          </div>
          <p className="auth-support">
            Passwort vergessen oder bisher nur per Mail-Link angemeldet? Melde
            dich kurz bei Fabian.
          </p>
        </div>
      </section>
    </main>
  );
}

function RequiredPasswordScreen({
  email,
  onSave,
  onSignOut,
}: {
  email: string;
  onSave: (password: string) => Promise<string | null>;
  onSignOut: () => void;
}) {
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submit = async () => {
    setMessage(null);
    if (password.length < 8) {
      setMessage("Das Passwort muss mindestens acht Zeichen lang sein.");
      return;
    }
    if (password !== passwordRepeat) {
      setMessage("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    const error = await onSave(password);
    setBusy(false);
    if (error) setMessage(error);
  };
  return (
    <main className="auth-page">
      <section className="password-required-card">
        <div className="profile-icon">
          <KeyRound />
        </div>
        <span className="eyebrow">
          <Sparkles /> Einmaliger Sicherheitscheck
        </span>
        <h1>Lege dein eigenes Passwort fest.</h1>
        <p>
          Du hast dich mit einem temporären Passwort angemeldet. Bevor es
          weitergeht, ersetze es durch ein persönliches Passwort.
        </p>
        <small>{email}</small>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            <span>Neues Passwort</span>
            <input
              autoComplete="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mindestens 8 Zeichen"
            />
          </label>
          <label>
            <span>Passwort wiederholen</span>
            <input
              autoComplete="new-password"
              type="password"
              required
              minLength={8}
              value={passwordRepeat}
              onChange={(event) => setPasswordRepeat(event.target.value)}
              placeholder="Noch einmal eingeben"
            />
          </label>
          {message && (
            <div className="auth-message">
              <CircleHelp /> {message}
            </div>
          )}
          <button
            className="primary-button"
            disabled={busy || !password || !passwordRepeat}
          >
            {busy ? "Wird gespeichert …" : "Neues Passwort speichern"}
            <Check />
          </button>
          <button type="button" className="text-button" onClick={onSignOut}>
            Abmelden
          </button>
        </form>
      </section>
    </main>
  );
}

function TemporaryPasswordDialog({
  result,
  onClose,
  onCopied,
}: {
  result: { member: Member; password: string };
  onClose: () => void;
  onCopied: () => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.password);
      onCopied();
    } catch {
      window.prompt("Temporäres Passwort kopieren:", result.password);
    }
  };
  return (
    <div className="dialog-backdrop profile-backdrop">
      <section
        className="dialog temporary-password-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Temporäres Passwort"
      >
        <button
          className="dialog-close"
          onClick={onClose}
          aria-label="Schließen"
        >
          <X />
        </button>
        <div className="profile-icon">
          <KeyRound />
        </div>
        <span className="dialog-kicker">
          <Sparkles /> Einmalig anzeigen
        </span>
        <h2>Temporäres Passwort</h2>
        <p>
          Schicke dieses Passwort an{" "}
          <strong>{result.member.displayName}</strong> über WhatsApp. Nach der
          Anmeldung muss es sofort geändert werden.
        </p>
        <label>
          <span>{result.member.email}</span>
          <div className="temporary-password-value">
            <code>{result.password}</code>
            <button type="button" onClick={() => void copy()}>
              <Copy /> Kopieren
            </button>
          </div>
        </label>
        <div className="profile-success">
          <BadgeCheck /> Das bisherige Passwort ist nicht mehr gültig.
        </div>
        <div className="dialog-actions">
          <button className="primary-button" onClick={onClose}>
            Fertig
          </button>
        </div>
      </section>
    </div>
  );
}

function ProfileNameDialog({
  initialName,
  required,
  email,
  onClose,
  onSave,
  onChangePassword,
}: {
  initialName: string;
  required: boolean;
  email: string;
  onClose: () => void;
  onSave: (name: string) => Promise<string | null>;
  onChangePassword: (password: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const normalizedName = name.trim().replace(/\s+/g, " ");
  const save = async () => {
    setBusy(true);
    setError(null);
    const saveError = await onSave(normalizedName);
    setBusy(false);
    if (saveError) setError(saveError);
  };
  const changePassword = async () => {
    setPasswordMessage(null);
    if (password.length < 8) {
      setPasswordMessage(
        "Das Passwort muss mindestens acht Zeichen lang sein.",
      );
      return;
    }
    if (password !== passwordRepeat) {
      setPasswordMessage("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    setPasswordBusy(true);
    const passwordError = await onChangePassword(password);
    setPasswordBusy(false);
    if (passwordError) {
      setPasswordMessage(passwordError);
      return;
    }
    setPassword("");
    setPasswordRepeat("");
    setPasswordMessage(
      "Passwort gespeichert. Du kannst dich künftig ohne Mail anmelden.",
    );
  };
  return (
    <div
      className="dialog-backdrop profile-backdrop"
      onMouseDown={(event) =>
        !required && event.target === event.currentTarget && onClose()
      }
    >
      <section
        className="dialog profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={required ? "Profil vervollständigen" : "Profil bearbeiten"}
      >
        {!required && (
          <button
            className="dialog-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X />
          </button>
        )}
        <div className="profile-icon">
          <UserRound />
        </div>
        <span className="dialog-kicker">
          <Sparkles /> {required ? "Fast geschafft" : "Dein Profil"}
        </span>
        <h2>
          {required ? "Wie dürfen wir dich nennen?" : "Name und Passwort"}
        </h2>
        <p className="profile-intro">
          Dieser Name erscheint bei deinen Bewertungen, Kommentaren und
          Setlists. Ein Vorname reicht vollkommen.
        </p>
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            <span>Anzeigename</span>
            <input
              autoFocus
              autoComplete="name"
              maxLength={80}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Zum Beispiel Fabian"
            />
          </label>
          <small className="profile-email">Angemeldet als {email}</small>
          {error && (
            <div className="profile-error">
              <CircleHelp /> {error}
            </div>
          )}
          <div className="dialog-actions profile-name-actions">
            {!required && (
              <button type="button" className="text-button" onClick={onClose}>
                Abbrechen
              </button>
            )}
            <button
              className="primary-button"
              disabled={busy || normalizedName.length < 2}
            >
              {busy ? "Wird gespeichert …" : "Name speichern"}
              <Check />
            </button>
          </div>
        </form>
        <div className="profile-password">
          <h3>Passwort festlegen oder ändern</h3>
          <p>Damit kannst du dich ohne Anmeldemail einloggen.</p>
          <label>
            <span>Neues Passwort</span>
            <input
              autoComplete="new-password"
              type="password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mindestens 8 Zeichen"
            />
          </label>
          <label>
            <span>Passwort wiederholen</span>
            <input
              autoComplete="new-password"
              type="password"
              minLength={8}
              value={passwordRepeat}
              onChange={(event) => setPasswordRepeat(event.target.value)}
              placeholder="Noch einmal eingeben"
            />
          </label>
          {passwordMessage && (
            <div
              className={
                passwordMessage.startsWith("Passwort gespeichert")
                  ? "profile-success"
                  : "profile-error"
              }
            >
              {passwordMessage.startsWith("Passwort gespeichert") ? (
                <Check />
              ) : (
                <CircleHelp />
              )}{" "}
              {passwordMessage}
            </div>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={passwordBusy || !password || !passwordRepeat}
            onClick={() => void changePassword()}
          >
            {passwordBusy ? "Wird gespeichert …" : "Passwort speichern"}
          </button>
        </div>
      </section>
    </div>
  );
}

function PieceDialog({
  piece,
  rating,
  groupRating,
  onAddToSetlist,
  onClose,
  onReset,
  onSave,
}: {
  piece: Piece;
  rating?: Rating;
  groupRating?: GroupRating;
  onAddToSetlist: () => void;
  onClose: () => void;
  onReset: () => Promise<boolean>;
  onSave: (rating: Rating) => Promise<boolean>;
}) {
  const [stars, setStars] = useState<number | null>(rating?.stars ?? null);
  const [skipped, setSkipped] = useState(rating?.skipped ?? false);
  const [comment, setComment] = useState(rating?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const addActionRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const actionRow = document.querySelector(
      ".piece-dialog .dialog-subtitle-row",
    );
    if (!actionRow) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dialog-link-button piece-dialog-add-button";
    button.textContent = "+ Zu Setlist";
    button.addEventListener("click", onAddToSetlist);
    actionRow.appendChild(button);
    addActionRef.current = button;
    return () => {
      button.removeEventListener("click", onAddToSetlist);
      button.remove();
      addActionRef.current = null;
    };
  }, [onAddToSetlist]);
  const submit = async () => {
    if (!stars && !skipped) return;
    setSaving(true);
    const saved = await onSave({ stars, skipped, comment });
    setSaving(false);
    if (saved) onClose();
  };
  const reset = async () => {
    if (
      !window.confirm(
        "Deine Bewertung und dein Kommentar werden gelöscht. Möchtest du wirklich zurücksetzen?",
      )
    )
      return;
    setSaving(true);
    const resetDone = await onReset();
    setSaving(false);
    if (resetDone) onClose();
  };
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) =>
        !saving && event.target === event.currentTarget && onClose()
      }
    >
      <section
        className="dialog piece-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${piece.title} bewerten`}
      >
        <button className="dialog-close" disabled={saving} onClick={onClose}>
          <X />
        </button>
        <div className="dialog-kicker">
          <Headphones /> Hörprobe & Bewertung
        </div>
        <h2>{piece.title}</h2>
        {piece.subtitle?.trim() && (
          <p className="piece-subtitle">{piece.subtitle}</p>
        )}
        <div className="dialog-subtitle-row">
          <p className="dialog-subtitle">{piece.composer}</p>
          {piece.purchaseUrl && (
            <a
              className="dialog-link-button"
              href={piece.purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink /> Kauflink
            </a>
          )}
        </div>
        <div className="dialog-facts">
          <span>
            <Clock3 /> {formatDuration(piece.durationSeconds)}
          </span>
          <span>Grade {piece.grade}</span>
          <span>
            <Euro /> {formatPiecePrice(piece)}
          </span>
          {piece.genres.map((item) => (
            <span className="genre-chip" key={item}>
              {item}
            </span>
          ))}
          {piece.owned && (
            <span className="owned-pill">
              <BadgeCheck /> Im Bestand
            </span>
          )}
          {piece.soloStatus === "available" && (
            <span className="solo-chip">
              <UserRound />{" "}
              {piece.solos ? `Solo · ${piece.solos}` : "Solo vorhanden"}
            </span>
          )}
          {piece.soloStatus === "unknown" && (
            <span className="solo-chip unknown">
              <CircleHelp /> Soli ungeprüft
            </span>
          )}
          {piece.soloStatus === "none" && (
            <span className="solo-chip none">
              <Check /> Keine Soli
            </span>
          )}
        </div>
        {(piece.source.trim() || piece.note?.trim()) && (
          <div className="piece-metadata">
            {piece.source.trim() && (
              <div>
                <span>Quelle</span>
                <strong>{piece.source}</strong>
              </div>
            )}
            {piece.note?.trim() && (
              <div className="piece-note">
                <span>Kommentar</span>
                <p>{piece.note}</p>
              </div>
            )}
          </div>
        )}
        {piece.youtubeId ? (
          <div className="youtube-wrap">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${piece.youtubeId}?rel=0`}
              title={`Hörprobe ${piece.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="no-sample">
            <Headphones />
            <strong>Keine Hörprobe hinterlegt</strong>
            <span>
              Du kannst das Stück trotzdem bewerten oder überspringen.
            </span>
          </div>
        )}
        <div className="rating-panel">
          <div className="rating-question">
            <span>Wie gut passt das Stück ins Konzert?</span>
            <Stars
              value={skipped ? null : stars}
              onChange={(value) => {
                setSkipped(false);
                setStars(value);
              }}
            />
          </div>
          <button
            className={skipped ? "skip-button active" : "skip-button"}
            onClick={() => {
              setSkipped(true);
              setStars(null);
            }}
          >
            <CircleHelp /> Kann ich nicht beurteilen
          </button>
          <label>
            <span>
              Dein Kommentar <small>optional</small>
            </span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Was spricht dafür oder dagegen? Soli, Wirkung, Besetzung …"
            />
          </label>
          {rating && groupRating?.count ? (
            <section className="group-peek">
              <div className="group-peek-summary">
                <div>
                  <Users />
                  <span>Gruppe · {groupRating.count} Bewertungen</span>
                </div>
                <DisplayStars value={groupRating.average} />
                <strong>
                  {groupRating.average.toFixed(1).replace(".", ",")}
                </strong>
              </div>
              {groupRating.comments.length > 0 && (
                <div className="group-piece-comments">
                  <h3>
                    Kommentare <span>{groupRating.comments.length}</span>
                  </h3>
                  {groupRating.comments.map((entry, index) => (
                    <article key={`${entry.author}-${index}`}>
                      <header>
                        <span className="group-comment-user">
                          <UserRound />
                          <strong>{entry.author}</strong>
                        </span>
                      </header>
                      <p>{entry.text}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : (
            rating && (
              <section className="group-peek">
                <div className="group-peek-summary">
                  <div>
                    <Users />
                    <span>Noch keine weitere Gruppenbewertung</span>
                  </div>
                </div>
              </section>
            )
          )}
        </div>
        <div className="dialog-actions">
          {rating && (
            <button
              className="dialog-danger-button"
              disabled={saving}
              onClick={() => void reset()}
            >
              <Trash2 /> Bewertung zurücksetzen
            </button>
          )}
          <button className="text-button" disabled={saving} onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="primary-button"
            disabled={saving || (!stars && !skipped)}
            onClick={() => void submit()}
          >
            <Check /> {saving ? "Wird gespeichert …" : "Bewertung speichern"}
          </button>
        </div>
      </section>
    </div>
  );
}

function DisplayStars({ value }: { value: number }) {
  return (
    <span
      className="display-stars"
      aria-label={`${value.toFixed(1).replace(".", ",")} von 5 Sternen`}
    >
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, value - index)) * 100;
        return (
          <i key={index}>
            <Star />
            <b style={{ width: `${fill}%` }}>
              <Star fill="currentColor" />
            </b>
          </i>
        );
      })}
    </span>
  );
}

function HotnessIndicator({
  count,
  total,
  compact = false,
}: {
  count: number;
  total: number;
  compact?: boolean;
}) {
  const ratio = total ? count / total : 0;
  const level = ratio >= 0.5 ? "hot" : ratio >= 0.25 ? "warm" : "cool";
  return (
    <span
      className={`hotness-indicator ${level} ${compact ? "compact" : ""}`}
      title={`In ${count} von ${total} veröffentlichten Setlists`}
    >
      <Flame />
      {count}
      {!compact && <small> von {total}</small>}
    </span>
  );
}

function AgreementIndicator({
  value,
  compact = false,
}: {
  value: number | null;
  compact?: boolean;
}) {
  return (
    <span
      className={`agreement-indicator ${compact ? "compact" : ""}`}
      title="Durchschnittliche Übereinstimmung mit den anderen veröffentlichten Setlists"
    >
      <Activity />
      {value === null ? "Noch kein Vergleich" : `${value}% Übereinstimmung`}
    </span>
  );
}

function PieceRatingBadges({
  rating,
  groupRating,
}: {
  rating?: Rating;
  groupRating?: GroupRating;
}) {
  return (
    <div className="piece-rating-badges">
      {rating ? (
        <>
          <span className="mine">
            <span className="rating-owner-icon" title="Du" aria-label="Du">
              <UserRound />
            </span>
            {rating.skipped ? (
              <small>Nicht beurteilt</small>
            ) : (
              <DisplayStars value={rating.stars ?? 0} />
            )}
          </span>
          <span className="group">
            <span
              className="rating-owner-icon"
              title="Gruppe"
              aria-label="Gruppe"
            >
              <Users />
            </span>
            {groupRating?.count ? (
              <>
                <DisplayStars value={groupRating.average} />
                <small>
                  {groupRating.average.toFixed(1).replace(".", ",")}
                </small>
                <small className="rating-count">({groupRating.count})</small>
              </>
            ) : (
              <small>Noch keine Gruppenwertung</small>
            )}
          </span>
        </>
      ) : (
        <span className="locked">
          <Lock /> Gruppenwertung nach deiner Bewertung
        </span>
      )}
    </div>
  );
}

function PieceCommentsToggle({
  rating,
  groupRating,
}: {
  rating?: Rating;
  groupRating?: GroupRating;
}) {
  const comments = rating ? (groupRating?.comments ?? []) : [];
  if (!comments.length) return null;
  return (
    <details
      className="piece-comments-toggle"
      onClick={(event) => event.stopPropagation()}
    >
      <summary title="Kommentare anzeigen">
        <MessageCircle /> {comments.length}
      </summary>
      <div>
        {comments.map((comment, index) => (
          <article key={`${comment.author}-${index}`}>
            <header>
              <UserRound />
              <strong>{comment.author}</strong>
            </header>
            <p>{comment.text}</p>
          </article>
        ))}
      </div>
    </details>
  );
}

function SetlistPlayer({
  pieces,
  compact = false,
  activePieceId,
  onActivePieceChange,
}: {
  pieces: Piece[];
  compact?: boolean;
  activePieceId: number | null;
  onActivePieceChange: (pieceId: number) => void;
}) {
  const playable = pieces.filter(
    (piece): piece is Piece & { youtubeId: string } => Boolean(piece.youtubeId),
  );
  const playlistKey = playable.map((piece) => piece.youtubeId).join(",");
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const activePieceIdRef = useRef<number | null>(activePieceId);
  const skipNextPropCueRef = useRef(false);
  const [apiFailed, setApiFailed] = useState(false);

  const reportActivePiece = (pieceId: number, alreadyHandled = false) => {
    skipNextPropCueRef.current = alreadyHandled;
    activePieceIdRef.current = pieceId;
    onActivePieceChange(pieceId);
  };

  useEffect(() => {
    activePieceIdRef.current = activePieceId;
    if (skipNextPropCueRef.current) {
      skipNextPropCueRef.current = false;
      return;
    }
    const index = playable.findIndex((piece) => piece.id === activePieceId);
    if (index >= 0)
      playerRef.current?.cuePlaylist(
        playable.map((piece) => piece.youtubeId),
        index,
        0,
      );
    // Die Playlist-Signatur ersetzt das abgeleitete Array als stabile Abhängigkeit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePieceId, playlistKey]);

  useEffect(() => {
    activePieceIdRef.current = activePieceId;
    if (activePieceId === null || !playable.length || !playerHostRef.current)
      return;
    let cancelled = false;
    const videoIds = playable.map((piece) => piece.youtubeId);
    const initialIndex = playable.findIndex(
      (piece) => piece.id === activePieceId,
    );
    if (initialIndex < 0) return;
    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !playerHostRef.current) return;
        playerRef.current = new YT.Player(playerHostRef.current, {
          width: "100%",
          height: "100%",
          videoId: videoIds[initialIndex],
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) =>
              event.target.cuePlaylist(videoIds, initialIndex, 0),
            onStateChange: (event) => {
              const index = event.target.getPlaylistIndex();
              if (index >= 0 && playable[index])
                reportActivePiece(playable[index].id, true);
            },
          },
        });
      })
      .catch(() => !cancelled && setApiFailed(true));
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // Die Signatur bildet exakt die für den Player relevante Reihenfolge ab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistKey, activePieceId !== null]);

  if (!playable.length) return null;
  const activePiece =
    playable.find((piece) => piece.id === activePieceId) ?? null;
  const missingSamples = pieces.length - playable.length;
  return (
    <section className={`setlist-player ${compact ? "compact" : ""}`}>
      <div
        className={`youtube-wrap ${activePiece ? "" : "player-placeholder"}`}
      >
        {activePiece ? (
          apiFailed ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${activePiece.youtubeId}?rel=0&playsinline=1`}
              title={`Hörprobe ${activePiece.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <div key={playlistKey} ref={playerHostRef} />
          )
        ) : (
          <>
            <Play />
            <strong>Hörprobe auswählen</strong>
            <span>
              Tippe oder klicke auf ein Stück der Setlist, um dessen Hörprobe zu
              laden.
            </span>
          </>
        )}
      </div>
      {missingSamples > 0 && (
        <p>
          <CircleHelp /> {missingSamples}{" "}
          {missingSamples === 1 ? "Stück hat" : "Stücke haben"} keine
          abspielbare Hörprobe und {missingSamples === 1 ? "wird" : "werden"}{" "}
          ausgelassen.
        </p>
      )}
    </section>
  );
}

function BuilderDialog({
  catalogue,
  setlist,
  pieceRatings,
  groupRatings,
  occurrenceCounts,
  publishedCount,
  agreement,
  showConsensus,
  saveState,
  onRetry,
  onClose,
  onDelete,
  onDuplicate,
  onRandomizeName,
  onPatch,
  onPublish,
}: {
  catalogue: Piece[];
  setlist: Setlist;
  pieceRatings: Record<number, Rating>;
  groupRatings: Record<number, GroupRating>;
  occurrenceCounts: Record<number, number>;
  publishedCount: number;
  agreement: number | null;
  showConsensus: boolean;
  saveState: SetlistSaveState;
  onRetry: () => void;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRandomizeName: () => void;
  onPatch: (patch: Partial<Setlist>) => void;
  onPublish: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showAddPieces, setShowAddPieces] = useState(false);
  const [activePreviewPieceId, setActivePreviewPieceId] = useState<
    number | null
  >(null);
  const metrics = getMetrics(setlist.pieceIds, catalogue);
  const candidates = catalogue.filter(
    (piece) =>
      !setlist.pieceIds.includes(piece.id) &&
      `${piece.title} ${piece.composer}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= setlist.pieceIds.length) return;
    const next = [...setlist.pieceIds];
    [next[index], next[target]] = [next[target], next[index]];
    onPatch({ pieceIds: next });
  };
  const saveLabel =
    saveState === "saving"
      ? "Wird gespeichert …"
      : saveState === "error"
        ? setlist.name.trim()
          ? "Nicht gespeichert · erneut versuchen"
          : "Name darf nicht leer sein"
        : "Gespeichert";
  const soloCount = metrics.selected.filter(
    (piece) => piece.soloStatus === "available",
  ).length;
  return (
    <div className="dialog-backdrop builder-backdrop">
      <section
        className="dialog builder-dialog setlist-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Setlist bearbeiten"
      >
        <header className="builder-header">
          <div>
            <span className="builder-draft-status">
              <Lock /> Privater Entwurf
            </span>
            <div className="builder-title-row">
              <ListMusic aria-hidden="true" />
              <input
                maxLength={120}
                value={setlist.name}
                onChange={(event) => onPatch({ name: event.target.value })}
                aria-label="Name der Setlist"
              />
            </div>
            <div className="builder-header-meta">
              <span className="builder-piece-count">
                {setlist.pieceIds.length} Stücke
              </span>
              {showConsensus && <AgreementIndicator value={agreement} />}
              {saveState === "error" && setlist.name.trim() ? (
                <button
                  className={`builder-save-state ${saveState}`}
                  onClick={onRetry}
                  aria-live="polite"
                >
                  <CircleHelp />
                  {saveLabel}
                </button>
              ) : (
                <span
                  className={`builder-save-state ${saveState}`}
                  aria-live="polite"
                >
                  {saveState === "saving" ? (
                    <Activity />
                  ) : saveState === "error" ? (
                    <CircleHelp />
                  ) : (
                    <Check />
                  )}
                  {saveLabel}
                </span>
              )}
              <button
                className="builder-art-name-button"
                type="button"
                onClick={onRandomizeName}
              >
                <Shuffle /> Kunstname würfeln
              </button>
              <div className="dialog-link-actions">
                <button
                  className="dialog-link-button"
                  onClick={() => printSetlistDocument(setlist.name)}
                >
                  <Printer /> Drucken / PDF
                </button>
                <button className="dialog-link-button" onClick={onDuplicate}>
                  <Copy /> Duplizieren
                </button>
              </div>
            </div>
          </div>
          <button className="dialog-close" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="builder-layout">
          <div className="builder-main">
            {metrics.selected.length > 0 && (
              <SetlistPlayer
                pieces={metrics.selected}
                compact
                activePieceId={activePreviewPieceId}
                onActivePieceChange={setActivePreviewPieceId}
              />
            )}
            <div className="builder-items">
              {metrics.selected.length === 0 && (
                <div className="empty-builder">
                  <ListMusic />
                  <strong>Deine Bühne ist noch leer.</strong>
                  <span>Füge unten die ersten Stücke hinzu.</span>
                </div>
              )}
              {metrics.selected.map((piece, index) => (
                <div
                  className={`builder-item ${activePreviewPieceId === piece.id ? "active-preview" : ""}`}
                  key={piece.id}
                  onClick={(event) => {
                    if (
                      piece.youtubeId &&
                      !(event.target as HTMLElement).closest("button, details")
                    )
                      setActivePreviewPieceId(piece.id);
                  }}
                >
                  <div className="builder-order-column">
                    <span className="order-number">{index + 1}</span>
                    {activePreviewPieceId === piece.id && (
                      <Play className="builder-playing" fill="currentColor" />
                    )}
                  </div>
                  <div className="builder-item-copy">
                    <strong className="builder-piece-title">
                      {piece.title}
                      <span title={`Schwierigkeit: Grade ${piece.grade}`}>
                        <BarChart3 /> {piece.grade}
                      </span>
                      {piece.genres[0] && (
                        <em className="builder-genre">{piece.genres[0]}</em>
                      )}
                    </strong>
                    <span>{piece.composer}</span>
                    <div>
                      {showConsensus && (
                        <HotnessIndicator count={occurrenceCounts[piece.id] ?? 0} total={publishedCount} compact />
                      )}
                      {piece.soloStatus === "available" && (
                        <em className="builder-solo">
                          <UserRound />{" "}
                          {piece.solos
                            ? `Solo · ${piece.solos}`
                            : "Solo vorhanden"}
                        </em>
                      )}
                      {piece.soloStatus === "unknown" && (
                        <em className="builder-solo unknown">
                          <CircleHelp /> Soli ungeprüft
                        </em>
                      )}
                    </div>
                  </div>
                  <div className="builder-item-actions">
                    <div className="builder-rating-line">
                      <PieceRatingBadges
                        rating={pieceRatings[piece.id]}
                        groupRating={groupRatings[piece.id]}
                      />
                      <PieceCommentsToggle
                        rating={pieceRatings[piece.id]}
                        groupRating={groupRatings[piece.id]}
                      />
                    </div>
                    <div className="builder-item-controls">
                      <div className="reorder">
                        <button
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                        >
                          <ArrowUp />
                        </button>
                        <button
                          onClick={() => move(index, 1)}
                          disabled={index === metrics.selected.length - 1}
                        >
                          <ArrowDown />
                        </button>
                      </div>
                      <button
                        className="remove-button"
                        onClick={() =>
                          onPatch({
                            pieceIds: setlist.pieceIds.filter(
                              (id) => id !== piece.id,
                            ),
                          })
                        }
                      >
                        <Trash2 />
                      </button>
                    </div>
                    <span className="builder-item-duration">
                      <Clock3 /> {formatDuration(piece.durationSeconds)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="add-pieces-toggle"
              type="button"
              aria-expanded={showAddPieces}
              onClick={() => setShowAddPieces((value) => !value)}
            >
              <Plus /> Stück hinzufügen{" "}
              <ChevronDown className={showAddPieces ? "open" : ""} />
            </button>
            {showAddPieces && (
              <div className="add-pieces">
                <div className="add-pieces-heading">
                  <h3>Stück hinzufügen</h3>
                  <span>{candidates.length} verfügbar</span>
                </div>
                <label className="search-field">
                  <Search />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Titel oder Komponist suchen"
                  />
                </label>
                <div className="candidate-list">
                  {candidates.map((piece) => (
                    <button
                      key={piece.id}
                      onClick={() =>
                        onPatch({ pieceIds: [...setlist.pieceIds, piece.id] })
                      }
                    >
                      <Plus />
                      <div>
                        <strong>{piece.title}</strong>
                        <span>{piece.composer}</span>
                        {piece.genres[0] && (
                          <em className="builder-genre candidate-genre">
                            {piece.genres[0]}
                          </em>
                        )}
                        <PieceRatingBadges
                          rating={pieceRatings[piece.id]}
                          groupRating={groupRatings[piece.id]}
                        />
                        {piece.soloStatus === "available" && (
                          <span className="candidate-solo">
                            <UserRound />{" "}
                            {piece.solos
                              ? `Solo · ${piece.solos}`
                              : "Solo vorhanden"}
                          </span>
                        )}
                        {piece.soloStatus === "unknown" && (
                          <span className="candidate-solo unknown">
                            <CircleHelp /> Soli ungeprüft
                          </span>
                        )}
                      </div>
                      <em>{formatDuration(piece.durationSeconds)}</em>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <aside className="builder-summary">
            <span className="eyebrow">Live-Check</span>
            <h3>Passt das Programm?</h3>
            <TimeSignal duration={metrics.duration} />
            <div className="summary-stat">
              <span>
                <Clock3 /> Dauer
              </span>
              <strong>{formatDuration(metrics.duration)}</strong>
            </div>
            <div className="summary-stat">
              <span>
                <BarChart3 /> Schwierigkeit
              </span>
              <strong>
                {metrics.minGrade || "–"}–{metrics.maxGrade || "–"}
              </strong>
              <small>
                Ø{" "}
                {metrics.avgGrade
                  ? metrics.avgGrade.toFixed(1).replace(".", ",")
                  : "–"}
              </small>
            </div>
            <div className="summary-stat">
              <span>
                <UserRound /> Solo-Stücke
              </span>
              <strong>{soloCount}</strong>
            </div>
            <div className="summary-stat">
              <span>
                <Euro /> Noch zu kaufen
              </span>
              <strong>{formatMoney(metrics.cost)}</strong>
            </div>
            <div className="summary-genres">
              <span>Genre-Mix</span>
              <div>
                {metrics.genres.length ? (
                  metrics.genres.map((item) => <em key={item}>{item}</em>)
                ) : (
                  <small>Noch keine Stücke gewählt</small>
                )}
              </div>
            </div>
            <button
              className="primary-button publish-button"
              disabled={setlist.pieceIds.length === 0 || saveState === "error"}
              onClick={onPublish}
            >
              <Sparkles /> Setlist veröffentlichen
            </button>
            <small className="publish-note">
              Danach ist die Zusammenstellung gesperrt. Varianten bleiben
              jederzeit möglich.
            </small>
            <button className="builder-delete-button" onClick={onDelete}>
              <Trash2 /> Entwurf löschen
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}

function SetlistDialog({
  catalogue,
  setlist,
  rating,
  pieceRatings,
  groupRatings,
  occurrenceCounts,
  publishedCount,
  agreement,
  showConsensus,
  currentUserId,
  canDelete,
  onClose,
  onDelete,
  onDuplicate,
  onReset,
  onSave,
}: {
  catalogue: Piece[];
  setlist: Setlist;
  rating?: SetlistRating;
  pieceRatings: Record<number, Rating>;
  groupRatings: Record<number, GroupRating>;
  occurrenceCounts: Record<number, number>;
  publishedCount: number;
  agreement: number | null;
  showConsensus: boolean;
  currentUserId: string;
  canDelete: boolean;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReset: () => Promise<boolean>;
  onSave: (rating: SetlistRating) => void;
}) {
  const [stars, setStars] = useState<number | null>(rating?.stars ?? null);
  const [comment, setComment] = useState(rating?.comment ?? "");
  const [resetting, setResetting] = useState(false);
  const [activePreviewPieceId, setActivePreviewPieceId] = useState<
    number | null
  >(null);
  const metrics = getMetrics(setlist.pieceIds, catalogue);
  const comments = setlist.reviews.filter((review) => review.comment);
  const isDraft = setlist.state === "draft";
  const soloCount = metrics.selected.filter(
    (piece) => piece.soloStatus === "available",
  ).length;
  const statusLabel = isDraft
    ? "Entwurf · schreibgeschützt"
    : setlist.state === "final"
      ? "Finale Setlist"
      : setlist.state === "finalist"
        ? "Finalist"
        : "Veröffentlicht";
  const reset = async () => {
    if (
      !window.confirm(
        "Deine Setlist-Bewertung und dein Kommentar werden gelöscht. Möchtest du wirklich zurücksetzen?",
      )
    )
      return;
    setResetting(true);
    const resetDone = await onReset();
    setResetting(false);
    if (resetDone) onClose();
  };
  return (
    <div
      className="dialog-backdrop builder-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`dialog builder-dialog setlist-dialog setlist-view-dialog ${isDraft ? "draft-preview" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${setlist.name} ${isDraft ? "ansehen" : "bewerten"}`}
      >
        <header className="builder-header">
          <div>
            <span
              className={`builder-draft-status setlist-state-${setlist.state}`}
            >
              {isDraft ? (
                <Lock />
              ) : setlist.state === "final" || setlist.state === "finalist" ? (
                <Trophy />
              ) : (
                <ListMusic />
              )}
              {statusLabel}
            </span>
            <div className="builder-title-row setlist-view-title">
              <ListMusic aria-hidden="true" />
              <h2>{setlist.name}</h2>
            </div>
            <div className="builder-header-meta">
              <span className="builder-piece-count">
                {setlist.pieceIds.length} Stücke
              </span>
              {showConsensus && <AgreementIndicator value={agreement} />}
              <span className="setlist-owner">von {setlist.owner}</span>
              <div className="dialog-link-actions">
                <button
                  className="dialog-link-button"
                  onClick={() => printSetlistDocument(setlist.name)}
                >
                  <Printer /> Drucken / PDF
                </button>
                <button className="dialog-link-button" onClick={onDuplicate}>
                  <Copy /> Duplizieren
                </button>
              </div>
            </div>
          </div>
          <button className="dialog-close" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="builder-layout">
          <div className="builder-main">
            {metrics.selected.length > 0 && (
              <SetlistPlayer
                pieces={metrics.selected}
                compact
                activePieceId={activePreviewPieceId}
                onActivePieceChange={setActivePreviewPieceId}
              />
            )}
            <div className="builder-items setlist-view-items">
              {metrics.selected.map((piece, index) => (
                <div
                  className={`builder-item setlist-view-item ${activePreviewPieceId === piece.id ? "active-preview" : ""}`}
                  key={piece.id}
                  onClick={() =>
                    piece.youtubeId && setActivePreviewPieceId(piece.id)
                  }
                >
                  <div className="builder-order-column">
                    <span className="order-number">{index + 1}</span>
                    {activePreviewPieceId === piece.id && (
                      <Play className="builder-playing" fill="currentColor" />
                    )}
                  </div>
                  <div className="builder-item-copy">
                    <strong className="builder-piece-title">
                      {piece.title}
                      <span title={`Schwierigkeit: Grade ${piece.grade}`}>
                        <BarChart3 /> {piece.grade}
                      </span>
                      {piece.genres[0] && (
                        <em className="builder-genre">{piece.genres[0]}</em>
                      )}
                    </strong>
                    <span>{piece.composer}</span>
                    <div>
                      {showConsensus && (
                        <HotnessIndicator count={occurrenceCounts[piece.id] ?? 0} total={publishedCount} compact />
                      )}
                      {piece.soloStatus === "available" && (
                        <em className="builder-solo">
                          <UserRound />{" "}
                          {piece.solos
                            ? `Solo · ${piece.solos}`
                            : "Solo vorhanden"}
                        </em>
                      )}
                      {piece.soloStatus === "unknown" && (
                        <em className="builder-solo unknown">
                          <CircleHelp /> Soli ungeprüft
                        </em>
                      )}
                    </div>
                  </div>
                  <div className="builder-item-actions">
                    <div className="builder-rating-line">
                      <PieceRatingBadges
                        rating={pieceRatings[piece.id]}
                        groupRating={groupRatings[piece.id]}
                      />
                      <PieceCommentsToggle
                        rating={pieceRatings[piece.id]}
                        groupRating={groupRatings[piece.id]}
                      />
                    </div>
                    <span className="builder-item-duration">
                      <Clock3 /> {formatDuration(piece.durationSeconds)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {!isDraft && (
              <>
                <section
                  className="setlist-rating-summary"
                  aria-label="Gruppenbewertung der Setlist"
                >
                  <div>
                    <Users />
                    <span>Gruppenurteil</span>
                  </div>
                  <DisplayStars
                    value={setlist.ratingCount ? setlist.rating : 0}
                  />
                  <strong>
                    {setlist.ratingCount
                      ? setlist.rating.toFixed(1).replace(".", ",")
                      : "–"}
                  </strong>
                  <small>({setlist.ratingCount})</small>
                </section>
                <section className="rating-panel setlist-own-rating">
                  <h3>Diese Setlist bewerten</h3>
                  <div className="rating-question">
                    <span>Wie gut funktioniert diese Reihenfolge?</span>
                    <Stars value={stars} onChange={setStars} />
                  </div>
                  <label>
                    <span>
                      Dein Kommentar <small>optional und später änderbar</small>
                    </span>
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="Dramaturgie, Dauer, Genre-Mix, Soli …"
                    />
                  </label>
                </section>
                <section className="setlist-comments" aria-label="Kommentare">
                  <h3>
                    Kommentare <span>{comments.length}</span>
                  </h3>
                  {comments.length ? (
                    <div className="discussion-comments">
                      {comments.map((review) => (
                        <article key={review.userId}>
                          <header>
                            <strong>
                              {review.userId === currentUserId
                                ? "Du"
                                : review.author}
                            </strong>
                            <span>
                              <Star fill="currentColor" /> {review.stars}/5
                            </span>
                          </header>
                          <p>{review.comment}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="discussion-empty">
                      Noch keine Kommentare – du kannst die Diskussion eröffnen.
                    </p>
                  )}
                </section>
              </>
            )}
            <div className="dialog-actions setlist-view-actions">
              <div className="dialog-danger-actions">
                {canDelete && (
                  <button
                    className="dialog-danger-button"
                    disabled={resetting}
                    onClick={onDelete}
                  >
                    <Trash2 /> Setlist löschen
                  </button>
                )}
                {rating && !isDraft && (
                  <button
                    className="dialog-danger-button"
                    disabled={resetting}
                    onClick={() => void reset()}
                  >
                    <X />{" "}
                    {resetting
                      ? "Wird zurückgesetzt …"
                      : "Bewertung zurücksetzen"}
                  </button>
                )}
              </div>
              <button
                className="text-button"
                disabled={resetting}
                onClick={onClose}
              >
                {isDraft ? "Schließen" : "Abbrechen"}
              </button>
              {!isDraft && (
                <button
                  className="primary-button"
                  disabled={resetting || !stars}
                  onClick={() => stars && onSave({ stars, comment })}
                >
                  <Check /> Bewertung speichern
                </button>
              )}
            </div>
          </div>
          <aside className="builder-summary">
            <span className="eyebrow">Live-Check</span>
            <h3>Passt das Programm?</h3>
            <TimeSignal duration={metrics.duration} />
            <div className="summary-stat">
              <span>
                <Clock3 /> Dauer
              </span>
              <strong>{formatDuration(metrics.duration)}</strong>
            </div>
            <div className="summary-stat">
              <span>
                <BarChart3 /> Schwierigkeit
              </span>
              <strong>
                {metrics.minGrade || "–"}–{metrics.maxGrade || "–"}
              </strong>
              <small>
                Ø{" "}
                {metrics.avgGrade
                  ? metrics.avgGrade.toFixed(1).replace(".", ",")
                  : "–"}
              </small>
            </div>
            <div className="summary-stat">
              <span>
                <UserRound /> Solo-Stücke
              </span>
              <strong>{soloCount}</strong>
            </div>
            <div className="summary-stat">
              <span>
                <Euro /> Noch zu kaufen
              </span>
              <strong>{formatMoney(metrics.cost)}</strong>
            </div>
            <div className="summary-genres">
              <span>Genre-Mix</span>
              <div>
                {metrics.genres.length ? (
                  metrics.genres.map((item) => <em key={item}>{item}</em>)
                ) : (
                  <small>Keine Genres hinterlegt</small>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function AdminPieceDialog({
  piece,
  creating = false,
  onClose,
  onSave,
}: {
  piece: Piece;
  creating?: boolean;
  onClose: () => void;
  onSave: (patch: AdminPiecePatch) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(creating ? "" : piece.title);
  const [subtitle, setSubtitle] = useState(piece.subtitle ?? "");
  const [composer, setComposer] = useState(piece.composer);
  const [genreText, setGenreText] = useState(piece.genres.join(", "));
  const [sampleUrl, setSampleUrl] = useState(piece.sampleUrl ?? "");
  const [purchaseUrl, setPurchaseUrl] = useState(piece.purchaseUrl ?? "");
  const [soloStatus, setSoloStatus] = useState<Piece["soloStatus"]>(
    piece.soloStatus,
  );
  const [solos, setSolos] = useState(piece.solos ?? "");
  const [duration, setDuration] = useState(
    piece.durationSeconds ? formatDuration(piece.durationSeconds) : "",
  );
  const [grade, setGrade] = useState(piece.grade ? String(piece.grade) : "");
  const [price, setPrice] = useState(
    (piece.priceCents / 100).toFixed(2).replace(".", ","),
  );
  const [owned, setOwned] = useState(piece.owned);
  const [source, setSource] = useState(piece.source);
  const [note, setNote] = useState(piece.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialForm] = useState(() => ({
    title: creating ? "" : piece.title,
    subtitle: piece.subtitle ?? "",
    composer: piece.composer,
    genreText: piece.genres.join(", "),
    sampleUrl: piece.sampleUrl ?? "",
    purchaseUrl: piece.purchaseUrl ?? "",
    soloStatus: piece.soloStatus,
    solos: piece.solos ?? "",
    duration: piece.durationSeconds
      ? formatDuration(piece.durationSeconds)
      : "",
    grade: piece.grade ? String(piece.grade) : "",
    price: (piece.priceCents / 100).toFixed(2).replace(".", ","),
    owned: piece.owned,
    source: piece.source,
    note: piece.note ?? "",
  }));
  const isDirty =
    title !== initialForm.title ||
    subtitle !== initialForm.subtitle ||
    composer !== initialForm.composer ||
    genreText !== initialForm.genreText ||
    sampleUrl !== initialForm.sampleUrl ||
    purchaseUrl !== initialForm.purchaseUrl ||
    soloStatus !== initialForm.soloStatus ||
    solos !== initialForm.solos ||
    duration !== initialForm.duration ||
    grade !== initialForm.grade ||
    price !== initialForm.price ||
    owned !== initialForm.owned ||
    source !== initialForm.source ||
    note !== initialForm.note;
  const requestClose = () => {
    if (saving) return;
    if (isDirty && !window.confirm("Ungespeicherte Änderungen verwerfen?"))
      return;
    onClose();
  };
  const changeSoloStatus = (nextStatus: Piece["soloStatus"]) => {
    if (nextStatus === soloStatus) return;
    if (
      nextStatus !== "available" &&
      solos.trim() &&
      !window.confirm(
        "Die eingetragenen Solo-Instrumente werden entfernt. Fortfahren?",
      )
    )
      return;
    if (nextStatus !== "available") setSolos("");
    setSoloStatus(nextStatus);
  };
  const save = async () => {
    const [minutes, seconds = "0"] = duration.split(":");
    const parsedDuration = Number(minutes) * 60 + Number(seconds);
    const parsedGrade = Number(grade);
    if (!title.trim()) {
      setError("Bitte einen Titel eingeben.");
      return;
    }
    if (
      !Number.isFinite(parsedDuration) ||
      parsedDuration <= 0 ||
      Number(seconds) < 0 ||
      Number(seconds) > 59
    ) {
      setError("Bitte die Dauer als mm:ss eingeben.");
      return;
    }
    if (!Number.isFinite(parsedGrade) || parsedGrade <= 0) {
      setError("Bitte einen gültigen Grade eingeben.");
      return;
    }
    setSaving(true);
    setError(null);
    const saved = await onSave({
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      composer: composer.trim(),
      genres: genreText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      sampleUrl: sampleUrl.trim() || null,
      purchaseUrl: purchaseUrl.trim() || null,
      soloStatus,
      solos: soloStatus === "available" ? solos.trim() || null : null,
      durationSeconds: parsedDuration,
      grade: parsedGrade,
      priceCents: Math.max(
        0,
        Math.round(Number(price.replace(",", ".")) * 100) || 0,
      ),
      owned,
      source: source.trim(),
      note: note.trim() || null,
    });
    setSaving(false);
    if (!saved) setError("Die Änderungen konnten nicht gespeichert werden.");
  };
  return (
    <div className="dialog-backdrop">
      <section className="dialog admin-dialog">
        <button
          className="dialog-close"
          disabled={saving}
          onClick={requestClose}
        >
          <X />
        </button>
        <span className="dialog-kicker">
          <Pencil /> Metadaten bearbeiten
        </span>
        <h2>{piece.title}</h2>
        <p className="dialog-subtitle">Alle Katalogdaten dieses Stücks</p>
        <div className="form-grid">
          <label className="full">
            <span>Titel</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="full subtitle-field">
            <span>Untertitel</span>
            <textarea
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder={"z. B. Dancing Queen\nMamma Mia\nFernando"}
            />
          </label>
          <div className="full composer-genre-row">
            <label>
              <span>Komponist / Arrangeur</span>
              <input
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
              />
            </label>
            <label>
              <span>Genre</span>
              <input
                value={genreText}
                onChange={(event) => setGenreText(event.target.value)}
                placeholder="z. B. Film, Rock/Pop"
              />
            </label>
          </div>
          <fieldset className="full solo-status-field">
            <legend>Soli-Status</legend>
            <div className="solo-status-picker">
              <button
                type="button"
                className={`solo-status-option unknown ${soloStatus === "unknown" ? "active" : ""}`}
                aria-pressed={soloStatus === "unknown"}
                onClick={() => changeSoloStatus("unknown")}
              >
                <CircleHelp />
                <span>Noch nicht geprüft</span>
              </button>
              <button
                type="button"
                className={`solo-status-option none ${soloStatus === "none" ? "active" : ""}`}
                aria-pressed={soloStatus === "none"}
                onClick={() => changeSoloStatus("none")}
              >
                <Check />
                <span>Keine Soli</span>
              </button>
              <button
                type="button"
                className={`solo-status-option available ${soloStatus === "available" ? "active" : ""}`}
                aria-pressed={soloStatus === "available"}
                onClick={() => changeSoloStatus("available")}
              >
                <UserRound />
                <span>Soli vorhanden</span>
              </button>
            </div>
          </fieldset>
          {soloStatus === "available" && (
            <label className="full solo-instruments-field">
              <span>
                Solo-Instrumente / Hinweise <small>optional</small>
              </span>
              <input
                value={solos}
                onChange={(event) => setSolos(event.target.value)}
                placeholder="z. B. Altsaxophon, Oboe, Posaune …"
              />
            </label>
          )}
          <div className="full piece-commercial-row">
            <label>
              <span>Dauer (mm:ss)</span>
              <input
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </label>
            <label>
              <span>Grade</span>
              <input
                type="number"
                step="0.5"
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
              />
            </label>
            <label>
              <span>Preis in Euro</span>
              <input
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={owned}
                onChange={(event) => setOwned(event.target.checked)}
              />
              <span>Bereits im Bestand</span>
            </label>
          </div>
          <label className="full">
            <span>Hörprobe (YouTube-URL)</span>
            <input
              type="url"
              value={sampleUrl}
              onChange={(event) => setSampleUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </label>
          <label className="full">
            <span>Kauflink</span>
            <input
              type="url"
              value={purchaseUrl}
              onChange={(event) => setPurchaseUrl(event.target.value)}
              placeholder="https://…"
            />
          </label>
          <label className="full">
            <span>Quelle</span>
            <input
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
          </label>
          <label className="full">
            <span>Kommentar</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
        {error && (
          <div className="profile-error">
            <CircleHelp /> {error}
          </div>
        )}
        <div className="dialog-actions">
          <button
            className="text-button"
            disabled={saving}
            onClick={requestClose}
          >
            Abbrechen
          </button>
          <button
            className="primary-button"
            disabled={saving}
            onClick={() => void save()}
          >
            <Check /> {saving ? "Wird gespeichert …" : "Speichern"}
          </button>
        </div>
      </section>
    </div>
  );
}
