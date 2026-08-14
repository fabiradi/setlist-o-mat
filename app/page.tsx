"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  Activity, ArrowDown, ArrowUp, BadgeCheck, BarChart3, Check, ChevronDown,
  ChevronRight, CircleHelp, Clock3, Copy, Euro, FileMusic, Filter,
  Construction, Headphones, ListMusic, Lock, LogOut, MessageCircle,
  Music2, Pencil, Play, Plus, Power, Search, Settings, Shuffle, Sparkles,
  Star, Trash2, Trophy, UserRound, Users, X,
} from "lucide-react";
import rawPieces from "./data/pieces.json";
import { getSupabaseBrowserClient } from "./lib/supabase";

type Piece = {
  id: number; title: string; composer: string; durationSeconds: number;
  grade: number; priceCents: number; owned: boolean; genres: string[];
  sampleUrl: string | null; youtubeId: string | null; purchaseUrl: string | null;
  soloStatus: "unknown" | "none" | "available"; solos: string | null;
  source: string; note: string | null;
};
type Rating = { stars: number | null; skipped: boolean; comment: string };
type View = "home" | "pieces" | "setlists" | "admin";
type SetlistState = "draft" | "published" | "finalist" | "final";
type SetlistFilter = "all" | "finalists" | "mine";
type SetlistReview = { userId: string; author: string; stars: number; comment: string };
type Setlist = { id: number | string; name: string; ownerId: string | null; owner: string; pieceIds: number[]; state: SetlistState; rating: number; ratingCount: number; comments: number; reviews: SetlistReview[] };
type SetlistRating = { stars: number; comment: string };
type GroupRating = { average: number; count: number; comments: { author: string; text: string }[] };
type Member = { id: string; email: string; displayName: string; isAdmin: boolean; lastSeenAt: string | null; ratingsCompleted: number };
type AllowedEmail = { email: string; displayName: string | null };
type AdminPiecePatch = Pick<Piece, "title" | "composer" | "genres" | "sampleUrl" | "purchaseUrl" | "soloStatus" | "solos" | "durationSeconds" | "grade" | "priceCents" | "owned" | "source" | "note">;
type MaintenanceStatus = { enabled: boolean; message: string; startedAt: string | null };
type SetlistSaveState = "idle" | "saving" | "saved" | "error";
type PendingSetlistSave = { setlistId: string; name: string; pieceIds: string[]; publish: boolean };

const pieces = rawPieces as Piece[];
const TARGET_MIN = 25 * 60;
const TARGET_MAX = 30 * 60;
const ACTIVE_PROJECT_ID = "20270000-0000-4000-8000-000000000001";
const initialRatings: Record<number, Rating> = {
  2: { stars: 4, skipped: false, comment: "Schöner Einstieg, aber recht lang." },
  4: { stars: 5, skipped: false, comment: "Klingt sofort nach Konzert!" },
  7: { stars: 4, skipped: false, comment: "Starker Sound, Soli bitte noch prüfen." },
  10: { stars: 3, skipped: false, comment: "Charmant, aber nicht mein Favorit." },
};
const initialSetlists: Setlist[] = [
  { id: 1, name: "Tanzende Tuba", ownerId: "demo-1", owner: "Demo-Mitglied 1", pieceIds: [1, 3, 5, 7, 9, 11], state: "finalist", rating: 4.5, ratingCount: 2, comments: 2, reviews: [{ userId: "demo-2", author: "Demo-Mitglied 2", stars: 5, comment: "Schöne Dramaturgie und ein starker Schluss." }, { userId: "demo-3", author: "Demo-Mitglied 3", stars: 4, comment: "Guter Mix, nur die Mitte könnte etwas ruhiger sein." }] },
  { id: 2, name: "Goldener Wirbelwind", ownerId: "demo-2", owner: "Demo-Mitglied 2", pieceIds: [2, 4, 6, 8, 10, 12], state: "published", rating: 4, ratingCount: 1, comments: 1, reviews: [{ userId: "demo-1", author: "Demo-Mitglied 1", stars: 4, comment: "Passt zeitlich gut und deckt viele Genres ab." }] },
  { id: 3, name: "Mitternachtsfanfare", ownerId: null, owner: "Demo", pieceIds: [1, 4, 7, 10, 12], state: "draft", rating: 0, ratingCount: 0, comments: 0, reviews: [] },
];
const artNames = ["Funkelnder Auftakt", "Fliegende Fermate", "Samtener Paukenschlag", "Tanzendes Tenorhorn", "Goldene Generalpause", "Wilde Holzbläser"];

function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function formatMoney(cents: number) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100); }
function formatPiecePrice(piece: Piece) { return piece.owned ? "Kaufpreis entfällt" : piece.priceCents > 0 ? `Preis ${formatMoney(piece.priceCents)}` : "Preis noch offen"; }
function getYoutubeId(url: string | null) { return url?.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/)?.[1] ?? null; }
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
  const candidate = currentName && currentName.toLocaleLowerCase("de") !== localPart.toLocaleLowerCase("de")
    ? currentName
    : localPart.split(/[._]+/)[0];
  return candidate ? candidate.charAt(0).toLocaleUpperCase("de") + candidate.slice(1) : "";
}
function formatLastActive(value: string | null) {
  if (!value) return "noch nie aktiv";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
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
  const selected = pieceIds.map((id) => catalogue.find((piece) => piece.id === id)).filter(Boolean) as Piece[];
  const duration = selected.reduce((sum, piece) => sum + piece.durationSeconds, 0);
  const grades = selected.map((piece) => piece.grade);
  return { selected, duration, minGrade: grades.length ? Math.min(...grades) : 0, maxGrade: grades.length ? Math.max(...grades) : 0, avgGrade: grades.length ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length : 0, cost: selected.reduce((sum, piece) => sum + (piece.owned ? 0 : piece.priceCents), 0), genres: [...new Set(selected.flatMap((piece) => piece.genres))] };
}

function Stars({ value, onChange, small = false }: { value: number | null; onChange?: (value: number) => void; small?: boolean }) {
  return <div className="stars" aria-label={value ? `${value} von 5 Sternen` : "Noch nicht bewertet"}>{[1, 2, 3, 4, 5].map((star) => <button className={small ? "star star-small" : "star"} type="button" key={star} onClick={() => onChange?.(star)} disabled={!onChange} aria-label={`${star} Sterne`}><Star fill={value && star <= value ? "currentColor" : "none"} /></button>)}</div>;
}

function TimeSignal({ duration, compact = false }: { duration: number; compact?: boolean }) {
  const state = duration < TARGET_MIN ? "short" : duration <= TARGET_MAX ? "good" : "long";
  const delta = state === "short" ? TARGET_MIN - duration : state === "long" ? duration - TARGET_MAX : TARGET_MAX - duration;
  const label = state === "short" ? `noch ${formatDuration(delta)}` : state === "long" ? `${formatDuration(delta)} zu lang` : `${formatDuration(delta)} Luft`;
  return <div className={`time-signal time-${state} ${compact ? "time-compact" : ""}`}><div className="time-signal-copy"><strong>{formatDuration(duration)}</strong><span>{label}</span></div><div className="time-track" aria-label={`${formatDuration(duration)} von maximal 30 Minuten`}><span style={{ width: `${Math.min((duration / TARGET_MAX) * 100, 100)}%` }} /></div></div>;
}

function AppMark() { return <div className="app-mark" aria-hidden="true"><Music2 /><span className="mark-spark">✦</span></div>; }

export default function Home() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [view, setView] = useState<View>("home");
  const [ratings, setRatings] = useState<Record<number, Rating>>(supabase ? {} : initialRatings);
  const [setlists, setSetlists] = useState<Setlist[]>(supabase ? [] : initialSetlists);
  const [activePieceId, setActivePieceId] = useState<number | null>(null);
  const [activeSetlistId, setActiveSetlistId] = useState<number | string | null>(null);
  const [setlistRatings, setSetlistRatings] = useState<Record<string, SetlistRating>>({});
  const [setlistFilter, setSetlistFilter] = useState<SetlistFilter>("all");
  const [builderId, setBuilderId] = useState<number | string | null>(null);
  const [remotePieceIds, setRemotePieceIds] = useState<Record<number, string>>({});
  const [remotePieces, setRemotePieces] = useState<Piece[]>([]);
  const [pieceOverrides, setPieceOverrides] = useState<Record<number, Partial<Piece>>>({});
  const [groupRatings, setGroupRatings] = useState<Record<number, GroupRating>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmail[]>([]);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [profileNameConfirmedAt, setProfileNameConfirmedAt] = useState<string | null | undefined>(undefined);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Alle Genres");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [adminEditId, setAdminEditId] = useState<number | null>(null);
  const [adminPieceSearch, setAdminPieceSearch] = useState("");
  const [adminOnlyIncomplete, setAdminOnlyIncomplete] = useState(false);
  const [setlistSaveState, setSetlistSaveState] = useState<SetlistSaveState>("idle");
  const pendingSetlistSave = useRef<PendingSetlistSave | null>(null);
  const setlistSaveRunning = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(!supabase);
  const [profileReady, setProfileReady] = useState(!supabase);
  const [onlineMemberIds, setOnlineMemberIds] = useState<string[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceStatus>({ enabled: false, message: "Der Setlist-o-Mat wird gerade gestimmt. Gleich geht es weiter!", startedAt: null });
  const [maintenanceReady, setMaintenanceReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setAuthReady(true); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession((current) => {
        if (current?.user.id !== nextSession?.user.id) {
          setProfileReady(false);
          setIsAdmin(false);
          setOnlineMemberIds([]);
          setProfileDisplayName(null);
          setProfileNameConfirmedAt(undefined);
        }
        return nextSession;
      });
      setAuthReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const loadMaintenance = async () => {
      const { data } = await supabase.from("app_settings").select("maintenance_mode, maintenance_message, maintenance_started_at").eq("id", "global").maybeSingle();
      if (!active) return;
      if (data) setMaintenance({ enabled: Boolean(data.maintenance_mode), message: data.maintenance_message, startedAt: data.maintenance_started_at });
      setMaintenanceReady(true);
    };
    void loadMaintenance();
    const timer = window.setInterval(() => void loadMaintenance(), 10_000);
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void loadMaintenance(); };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) return;
    let active = true;
    const loadProjectData = async () => {
      void supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", session.user.id);
      const { data: currentProfile } = await supabase
        .from("profiles").select("is_app_admin, display_name, name_confirmed_at").eq("id", session.user.id).single();
      if (active) {
        setIsAdmin(Boolean(currentProfile?.is_app_admin));
        setProfileReady(true);
        setProfileDisplayName(currentProfile?.display_name ?? null);
        const confirmedAt = currentProfile?.name_confirmed_at ?? null;
        setProfileNameConfirmedAt(confirmedAt);
        setShowProfileDialog(!confirmedAt);
      }
      const { data: dbPieces, error: piecesError } = await supabase
        .from("pieces").select("*").eq("project_id", ACTIVE_PROJECT_ID).eq("archived", false);
      if (piecesError || !dbPieces) { if (active) setToast("Supabase-Daten konnten nicht geladen werden"); return; }

      const pieceIds = Object.fromEntries(dbPieces.flatMap((piece) => {
        const match = /^xlsx-(\d+)$/.exec(piece.import_key ?? "");
        return match ? [[Number(match[1]), piece.id as string]] : [];
      })) as Record<number, string>;
      const localByRemote = new Map(Object.entries(pieceIds).map(([local, remote]) => [remote, Number(local)]));
      const remoteIds = Object.values(pieceIds);

      const [{ data: ownRatings }, { data: allPieceRatings }, { data: dbSetlists }, { data: dbSetlistRatings }, { data: dbProfiles }, { data: dbMemberships }, { data: dbAllowedEmails }] = await Promise.all([
        supabase.from("piece_ratings").select("piece_id, stars, skipped, comment").eq("user_id", session.user.id).in("piece_id", remoteIds),
        supabase.from("piece_ratings").select("piece_id, user_id, stars, skipped, comment").in("piece_id", remoteIds),
        supabase.from("setlists").select("id, name, owner_id, state, setlist_items(piece_id, position)").eq("project_id", ACTIVE_PROJECT_ID),
        supabase.from("setlist_ratings").select("setlist_id, user_id, stars, comment"),
        supabase.from("profiles").select("id, email, display_name, is_app_admin, last_seen_at"),
        supabase.from("project_members").select("user_id, status").eq("project_id", ACTIVE_PROJECT_ID).eq("status", "active"),
        currentProfile?.is_app_admin ? supabase.from("signup_allowed_emails").select("email, display_name") : Promise.resolve({ data: [] as { email: string; display_name: string | null }[] }),
      ]);

      const profileNames = new Map((dbProfiles ?? []).map((profile) => [profile.id, profile.display_name]));
      const allSetlistRatings = dbSetlistRatings ?? [];

      if (!active) return;
      setRemotePieceIds(pieceIds);
      const mappedPieces = dbPieces.flatMap((piece) => {
        const match = /^xlsx-(\d+)$/.exec(piece.import_key ?? "");
        if (!match) return [];
        const localId = Number(match[1]);
        return [{
          id: localId,
          title: piece.title, composer: piece.composer, durationSeconds: piece.duration_seconds,
          grade: Number(piece.grade), priceCents: piece.price_cents, owned: piece.owned,
          genres: piece.genres ?? [], sampleUrl: piece.sample_url, youtubeId: getYoutubeId(piece.sample_url),
          purchaseUrl: piece.purchase_url, soloStatus: piece.solo_status, solos: piece.solos,
          source: piece.source, note: piece.note,
        } as Piece];
      }).sort((a, b) => a.title.localeCompare(b.title, "de"));
      setRemotePieces(mappedPieces);
      setPieceOverrides({});
      setRatings(Object.fromEntries((ownRatings ?? []).flatMap((rating) => {
        const localId = localByRemote.get(rating.piece_id);
        return localId ? [[localId, { stars: rating.stars, skipped: rating.skipped, comment: rating.comment ?? "" }]] : [];
      })));
      const grouped = new Map<number, { stars: number[]; comments: { author: string; text: string }[] }>();
      for (const rating of allPieceRatings ?? []) {
        const localId = localByRemote.get(rating.piece_id);
        if (!localId) continue;
        const item = grouped.get(localId) ?? { stars: [], comments: [] };
        if (rating.stars) item.stars.push(rating.stars);
        if (rating.comment?.trim()) item.comments.push({ author: profileNames.get(rating.user_id) ?? "Mitglied", text: rating.comment.trim() });
        grouped.set(localId, item);
      }
      setGroupRatings(Object.fromEntries([...grouped].map(([id, item]) => [id, {
        average: item.stars.length ? item.stars.reduce((sum, value) => sum + value, 0) / item.stars.length : 0,
        count: item.stars.length,
        comments: item.comments,
      }])));
      const activeMemberIds = new Set((dbMemberships ?? []).map((membership) => membership.user_id));
      const ratingsCompleted = new Map<string, number>();
      for (const rating of allPieceRatings ?? []) ratingsCompleted.set(rating.user_id, (ratingsCompleted.get(rating.user_id) ?? 0) + 1);
      setMembers((dbProfiles ?? []).filter((profile) => activeMemberIds.has(profile.id)).map((profile) => ({
        id: profile.id,
        email: profile.email,
        displayName: profile.display_name,
        isAdmin: profile.is_app_admin,
        lastSeenAt: profile.last_seen_at,
        ratingsCompleted: ratingsCompleted.get(profile.id) ?? 0,
      })));
      setAllowedEmails((dbAllowedEmails ?? []).map((entry) => ({ email: String(entry.email), displayName: entry.display_name })));
      setSetlists((dbSetlists ?? []).map((setlist) => {
        const listRatings = allSetlistRatings.filter((rating) => rating.setlist_id === setlist.id);
        const stars = listRatings.map((rating) => rating.stars);
        const orderedItems = [...(setlist.setlist_items ?? [])].sort((a, b) => a.position - b.position);
        return {
          id: setlist.id,
          name: setlist.name,
          ownerId: setlist.owner_id,
          owner: profileNames.get(setlist.owner_id) ?? "Mitglied",
          pieceIds: orderedItems.flatMap((item) => { const localId = localByRemote.get(item.piece_id); return localId ? [localId] : []; }),
          state: setlist.state as SetlistState,
          rating: stars.length ? stars.reduce((sum, value) => sum + value, 0) / stars.length : 0,
          ratingCount: stars.length,
          comments: listRatings.filter((rating) => rating.comment?.trim()).length,
          reviews: listRatings.map((rating) => ({
            userId: rating.user_id,
            author: profileNames.get(rating.user_id) ?? "Mitglied",
            stars: rating.stars,
            comment: rating.comment?.trim() ?? "",
          })),
        };
      }));
      setSetlistRatings(Object.fromEntries(allSetlistRatings.filter((rating) => rating.user_id === session.user.id).map((rating) => [rating.setlist_id, { stars: rating.stars, comment: rating.comment ?? "" }])));
    };
    void loadProjectData();
    return () => { active = false; };
  }, [session, supabase]);

  useEffect(() => {
    if (!supabase || !session) return;
    const userId = session.user.id;
    const channel = supabase.channel(`project:${ACTIVE_PROJECT_ID}:presence`, {
      config: { presence: { key: userId, enabled: true } },
    });
    const syncPresence = () => {
      const state = channel.presenceState<{ user_id?: string }>();
      const ids = Object.values(state).flatMap((entries) => entries.map((entry) => entry.user_id).filter((id): id is string => Boolean(id)));
      setOnlineMemberIds([...new Set(ids)]);
    };
    const track = () => channel.track({ user_id: userId, online_at: new Date().toISOString() });
    const touchLastSeen = async () => {
      if (document.visibilityState !== "visible") return;
      const now = new Date().toISOString();
      setMembers((current) => current.map((member) => member.id === userId ? { ...member, lastSeenAt: now } : member));
      await supabase.from("profiles").update({ last_seen_at: now }).eq("id", userId);
    };
    channel.on("presence", { event: "sync" }, syncPresence).subscribe((status) => {
      if (status === "SUBSCRIBED") { void track(); void touchLastSeen(); }
    });
    const heartbeat = window.setInterval(() => void touchLastSeen(), 60_000);
    const visibility = () => {
      if (document.visibilityState === "visible") { void track(); void touchLastSeen(); }
      else void channel.untrack();
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
        supabase.from("profiles").select("id, email, display_name, is_app_admin, last_seen_at"),
        remoteIds.length
          ? supabase.from("piece_ratings").select("user_id, piece_id").in("piece_id", remoteIds)
          : Promise.resolve({ data: [] as { user_id: string; piece_id: string }[] }),
      ]);
      if (!profiles) return;
      const counts = new Map<string, number>();
      for (const rating of ratingRows ?? []) counts.set(rating.user_id, (counts.get(rating.user_id) ?? 0) + 1);
      const latest = new Map(profiles.map((profile) => [profile.id, profile]));
      setMembers((current) => current.map((member) => {
        const profile = latest.get(member.id);
        return profile ? { id: profile.id, email: profile.email, displayName: profile.display_name, isAdmin: profile.is_app_admin, lastSeenAt: profile.last_seen_at, ratingsCompleted: counts.get(profile.id) ?? 0 } : member;
      }));
    };
    const timer = window.setInterval(() => void refreshMemberActivity(), 60_000);
    return () => window.clearInterval(timer);
  }, [isAdmin, remotePieceIds, session, supabase]);

  const catalogue = useMemo(() => (supabase ? remotePieces : pieces).map((piece) => ({ ...piece, ...pieceOverrides[piece.id] })), [pieceOverrides, remotePieces, supabase]);
  const activePiece = catalogue.find((piece) => piece.id === activePieceId) ?? null;
  const activeSetlist = setlists.find((setlist) => setlist.id === activeSetlistId) ?? null;
  const adminPiece = catalogue.find((piece) => piece.id === adminEditId) ?? null;
  const builder = setlists.find((setlist) => setlist.id === builderId) ?? null;
  const completed = Object.keys(ratings).length;
  const progress = Math.round((completed / catalogue.length) * 100);
  const genres = ["Alle Genres", ...new Set(catalogue.flatMap((piece) => piece.genres))];
  const nextPiece = catalogue.find((piece) => !ratings[piece.id]);
  const email = session?.user.email?.toLocaleLowerCase("de") ?? "";
  const displayName = profileDisplayName || session?.user.user_metadata?.display_name || (email ? email.split("@")[0].split(".")[0] : "Demo");
  const friendlyName = String(displayName).charAt(0).toLocaleUpperCase("de") + String(displayName).slice(1);
  const suggestedProfileName = getSuggestedProfileName(profileDisplayName, email);

  const filteredPieces = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de");
    return catalogue.filter((piece) => (!query || `${piece.title} ${piece.composer}`.toLocaleLowerCase("de").includes(query)) && (genre === "Alle Genres" || piece.genres.includes(genre)) && (!onlyOpen || !ratings[piece.id]));
  }, [catalogue, genre, onlyOpen, ratings, search]);
  const hasActivePieceFilters = Boolean(search.trim()) || genre !== "Alle Genres" || onlyOpen;
  const clearPieceFilters = () => { setSearch(""); setGenre("Alle Genres"); setOnlyOpen(false); };
  const incompletePieceCount = catalogue.filter((piece) => getMissingPieceFields(piece).length > 0).length;
  const adminPieces = useMemo(() => {
    const query = adminPieceSearch.trim().toLocaleLowerCase("de");
    return catalogue.filter((piece) => {
      const searchable = `${piece.title} ${piece.composer} ${piece.source} ${piece.genres.join(" ")}`.toLocaleLowerCase("de");
      return (!query || searchable.includes(query)) && (!adminOnlyIncomplete || getMissingPieceFields(piece).length > 0);
    });
  }, [adminOnlyIncomplete, adminPieceSearch, catalogue]);

  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2400); };
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
        pendingSetlistSave.current = null;
        setlistSaveRunning.current = false;
        setSetlistSaveState("error");
        flash("Setlist konnte nicht gespeichert werden – deine letzte Änderung ist nur lokal sichtbar");
        return;
      }
    }
    setlistSaveRunning.current = false;
    setSetlistSaveState("saved");
  };
  const queueSetlistSave = (setlist: Setlist) => {
    if (!supabase || typeof setlist.id !== "string") { setSetlistSaveState("saved"); return; }
    const pieceIds = setlist.pieceIds.flatMap((pieceId) => remotePieceIds[pieceId] ? [remotePieceIds[pieceId]] : []);
    if (pieceIds.length !== setlist.pieceIds.length) {
      setSetlistSaveState("error");
      flash("Setlist konnte nicht gespeichert werden – ein Stück ist nicht mehr verfügbar");
      return;
    }
    pendingSetlistSave.current = { setlistId: setlist.id, name: setlist.name, pieceIds, publish: setlist.state === "published" };
    setSetlistSaveState("saving");
    void flushSetlistSaves();
  };
  const saveProfileName = async (name: string): Promise<string | null> => {
    if (!supabase || !session) return "Dein Profil ist gerade nicht erreichbar.";
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (normalizedName.length < 2) return "Bitte gib mindestens zwei Zeichen ein.";
    if (normalizedName.length > 80) return "Der Name darf höchstens 80 Zeichen lang sein.";
    const confirmedAt = new Date().toISOString();
    const { error } = await supabase.from("profiles").update({
      display_name: normalizedName,
      name_confirmed_at: confirmedAt,
      updated_at: confirmedAt,
    }).eq("id", session.user.id);
    if (error) return "Der Name konnte nicht gespeichert werden. Bitte versuche es erneut.";
    setProfileDisplayName(normalizedName);
    setProfileNameConfirmedAt(confirmedAt);
    setShowProfileDialog(false);
    setMembers((current) => current.map((member) => member.id === session.user.id ? { ...member, displayName: normalizedName } : member));
    flash(`Willkommen, ${normalizedName}!`);
    return null;
  };
  const saveRating = async (pieceId: number, rating: Rating) => {
    const previousRating = ratings[pieceId];
    setRatings((current) => ({ ...current, [pieceId]: rating }));
    if (supabase && session && remotePieceIds[pieceId]) {
      const { error } = await supabase.from("piece_ratings").upsert({ piece_id: remotePieceIds[pieceId], user_id: session.user.id, ...rating, updated_at: new Date().toISOString() }, { onConflict: "piece_id,user_id" });
      if (error) {
        setRatings((current) => {
          const next = { ...current };
          if (previousRating) next[pieceId] = previousRating; else delete next[pieceId];
          return next;
        });
        console.error("piece rating save failed", error);
        flash("Bewertung konnte nicht gespeichert werden – bitte erneut versuchen");
        return false;
      }
      const { data: refreshed, error: refreshError } = await supabase.from("piece_ratings").select("user_id, stars, comment").eq("piece_id", remotePieceIds[pieceId]);
      if (!refreshError) {
        const stars = (refreshed ?? []).flatMap((item) => item.stars ? [item.stars] : []);
        const memberNames = new Map(members.map((member) => [member.id, member.displayName]));
        setGroupRatings((current) => ({ ...current, [pieceId]: {
          average: stars.length ? stars.reduce((sum, value) => sum + value, 0) / stars.length : 0,
          count: stars.length,
          comments: (refreshed ?? []).flatMap((item) => item.comment?.trim() ? [{ author: memberNames.get(item.user_id) ?? "Mitglied", text: item.comment.trim() }] : []),
        } }));
      }
      if (!previousRating) setMembers((current) => current.map((member) => member.id === session.user.id ? { ...member, ratingsCompleted: member.ratingsCompleted + 1 } : member));
    }
    flash("Bewertung gespeichert");
    return true;
  };
  const createSetlist = async () => {
    const name = artNames[setlists.length % artNames.length];
    if (supabase && session) {
      const { data, error } = await supabase.from("setlists").insert({ project_id: ACTIVE_PROJECT_ID, owner_id: session.user.id, name, state: "draft" }).select("id").single();
      if (error || !data) { flash("Entwurf konnte nicht angelegt werden"); return; }
      const setlist: Setlist = { id: data.id, name, ownerId: session.user.id, owner: friendlyName, pieceIds: [], state: "draft", rating: 0, ratingCount: 0, comments: 0, reviews: [] };
      setSetlists((current) => [...current, setlist]); setSetlistSaveState("saved"); setBuilderId(data.id); setView("setlists"); return;
    }
    const numericIds = setlists.map((item) => item.id).filter((id): id is number => typeof id === "number");
    const nextId = Math.max(...numericIds, 0) + 1;
    const setlist: Setlist = { id: nextId, name, ownerId: null, owner: friendlyName, pieceIds: [], state: "draft", rating: 0, ratingCount: 0, comments: 0, reviews: [] };
    setSetlists((current) => [...current, setlist]); setSetlistSaveState("saved"); setBuilderId(nextId); setView("setlists");
  };
  const duplicateSetlist = async (source: Setlist) => {
    const variants = setlists.filter((item) => item.name.startsWith(source.name.split(" – Variante")[0])).length;
    const baseName = source.name.split(" – Variante")[0];
    const name = `${baseName} – Variante ${Math.max(variants, 1) + 1}`;
    if (supabase && session) {
      const { data, error } = await supabase.from("setlists").insert({ project_id: ACTIVE_PROJECT_ID, owner_id: session.user.id, name, state: "draft", derived_from: typeof source.id === "string" ? source.id : null }).select("id").single();
      if (error || !data) { flash("Variante konnte nicht angelegt werden"); return; }
      const items = source.pieceIds.flatMap((pieceId, index) => remotePieceIds[pieceId] ? [{ setlist_id: data.id, piece_id: remotePieceIds[pieceId], position: index + 1 }] : []);
      if (items.length) await supabase.from("setlist_items").insert(items);
      const duplicate: Setlist = { ...source, id: data.id, name, ownerId: session.user.id, owner: friendlyName, state: "draft", rating: 0, ratingCount: 0, comments: 0, reviews: [], pieceIds: [...source.pieceIds] };
      setSetlists((current) => [...current, duplicate]); setSetlistSaveState("saved"); setBuilderId(data.id); flash("Variante als Entwurf angelegt"); return;
    }
    const numericIds = setlists.map((item) => item.id).filter((id): id is number => typeof id === "number");
    const nextId = Math.max(...numericIds, 0) + 1;
    const duplicate: Setlist = { ...source, id: nextId, name: `${baseName} – Variante ${Math.max(variants, 1) + 1}`, ownerId: null, owner: friendlyName, state: "draft", rating: 0, ratingCount: 0, comments: 0, reviews: [], pieceIds: [...source.pieceIds] };
    setSetlists((current) => [...current, duplicate]); setSetlistSaveState("saved"); setBuilderId(nextId); flash("Variante als Entwurf angelegt");
  };
  const deleteSetlist = async (setlist: Setlist) => {
    const isOwnDraft = setlist.state === "draft" && (!session || setlist.ownerId === session.user.id);
    if (!isOwnDraft || !window.confirm(`Den Entwurf „${setlist.name}“ wirklich löschen?`)) return;
    if (supabase && session && typeof setlist.id === "string") {
      const { data, error } = await supabase.from("setlists").delete().eq("id", setlist.id).eq("owner_id", session.user.id).eq("state", "draft").select("id").maybeSingle();
      if (error || !data) { flash("Entwurf konnte nicht gelöscht werden"); return; }
    }
    setSetlists((current) => current.filter((item) => item.id !== setlist.id));
    if (builderId === setlist.id) setBuilderId(null);
    if (activeSetlistId === setlist.id) setActiveSetlistId(null);
    flash("Entwurf gelöscht");
  };
  const patchBuilder = (patch: Partial<Setlist>) => {
    if (!builderId) return;
    const current = setlists.find((item) => item.id === builderId);
    if (!current) return;
    const next = { ...current, ...patch };
    setSetlists((items) => items.map((item) => item.id === builderId ? next : item));
    queueSetlistSave(next);
  };
  const markSetlist = (id: number | string, state: "published" | "finalist" | "final") => {
    setSetlists((current) => current.map((item) => item.id === id ? { ...item, state } : state === "final" && item.state === "final" ? { ...item, state: "finalist" } : item));
    if (supabase && typeof id === "string") void (async () => {
      if (state === "final") await supabase.from("setlists").update({ state: "finalist" }).eq("project_id", ACTIVE_PROJECT_ID).eq("state", "final");
      await supabase.from("setlists").update({ state, updated_at: new Date().toISOString() }).eq("id", id);
    })();
    flash(state === "final" ? "Finale Setlist festgelegt" : state === "finalist" ? "Zur Finalrunde hinzugefügt" : "Markierung zurückgesetzt");
  };
  const saveSetlistRating = async (setlist: Setlist, rating: SetlistRating) => {
    if (supabase && session && typeof setlist.id === "string") {
      const { error } = await supabase.from("setlist_ratings").upsert({ setlist_id: setlist.id, user_id: session.user.id, ...rating }, { onConflict: "setlist_id,user_id" });
      if (error) { flash("Setlist-Bewertung konnte nicht gespeichert werden"); return; }
    }
    const userId = session?.user.id ?? "demo-current";
    setSetlistRatings((current) => ({ ...current, [String(setlist.id)]: rating }));
    setSetlists((current) => current.map((item) => {
      if (item.id !== setlist.id) return item;
      const reviews = [...item.reviews.filter((review) => review.userId !== userId), { userId, author: friendlyName, ...rating }];
      const stars = reviews.map((review) => review.stars);
      return {
        ...item,
        reviews,
        rating: stars.reduce((sum, value) => sum + value, 0) / stars.length,
        ratingCount: stars.length,
        comments: reviews.filter((review) => review.comment.trim()).length,
      };
    }));
    flash("Setlist-Bewertung gespeichert");
  };
  const addAllowedEmail = async () => {
    if (!supabase || !isAdmin) return;
    const entered = window.prompt("Welche E-Mail-Adresse soll freigeschaltet werden?")?.trim().toLocaleLowerCase("de");
    if (!entered) return;
    if (!/^\S+@\S+\.\S+$/.test(entered)) { flash("Bitte eine gültige E-Mail-Adresse eingeben"); return; }
    const { error } = await supabase.from("signup_allowed_emails").upsert({ email: entered }, { onConflict: "email" });
    if (error) { flash("E-Mail konnte nicht freigeschaltet werden"); return; }
    setAllowedEmails((current) => current.some((item) => item.email === entered) ? current : [...current, { email: entered, displayName: null }]);
    flash("E-Mail freigeschaltet");
  };
  const removeAllowedEmail = async (emailToRemove: string) => {
    if (!supabase || !isAdmin || !window.confirm(`${emailToRemove} von der Freigabeliste entfernen?`)) return;
    const { error } = await supabase.from("signup_allowed_emails").delete().eq("email", emailToRemove);
    if (error) { flash("Freigabe konnte nicht entfernt werden"); return; }
    setAllowedEmails((current) => current.filter((item) => item.email !== emailToRemove));
    flash("Freigabe entfernt");
  };
  const deleteMember = async (member: Member) => {
    if (!supabase || !isAdmin || member.id === session?.user.id || !window.confirm(`${member.displayName} wirklich vollständig löschen?`)) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { userId: member.id } });
    if (error || !data?.ok) {
      let reason = data?.error as string | undefined;
      const response = (error as { context?: Response } | null)?.context;
      if (!reason && response) reason = await response.clone().json().then((body) => body?.error as string | undefined).catch(() => undefined);
      flash(reason || "Nutzer konnte nicht gelöscht werden");
      return;
    }
    setMembers((current) => current.filter((item) => item.id !== member.id));
    flash("Nutzer gelöscht");
  };
  const savePieceMetadata = async (piece: Piece, patch: AdminPiecePatch) => {
    if (supabase && remotePieceIds[piece.id]) {
      const { error } = await supabase.from("pieces").update({
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
        note: patch.note,
        updated_at: new Date().toISOString(),
      }).eq("id", remotePieceIds[piece.id]);
      if (error) { console.error("piece metadata save failed", error); flash("Metadaten konnten nicht gespeichert werden"); return false; }
    }
    setPieceOverrides((current) => ({ ...current, [piece.id]: { ...current[piece.id], ...patch, youtubeId: getYoutubeId(patch.sampleUrl) } }));
    setAdminEditId(null);
    flash("Metadaten gespeichert");
    return true;
  };
  const toggleMaintenance = async () => {
    if (!supabase || !session || !isAdmin) return;
    const nextEnabled = !maintenance.enabled;
    const otherOnline = onlineMemberIds.filter((id) => id !== session.user.id && members.some((member) => member.id === id)).length;
    if (nextEnabled) {
      const warning = otherOnline
        ? `Noch ${otherOnline} ${otherOnline === 1 ? "Person ist" : "Personen sind"} online. Wartungsmodus trotzdem einschalten?`
        : "Wartungsmodus einschalten? Mitglieder sehen dann sofort die Wartungsseite.";
      if (!window.confirm(warning)) return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase.from("app_settings").update({
      maintenance_mode: nextEnabled,
      maintenance_started_at: nextEnabled ? now : null,
      maintenance_started_by: nextEnabled ? session.user.id : null,
      updated_at: now,
    }).eq("id", "global");
    if (error) { flash("Wartungsmodus konnte nicht geändert werden"); return; }
    setMaintenance((current) => ({ ...current, enabled: nextEnabled, startedAt: nextEnabled ? now : null }));
    flash(nextEnabled ? "Wartungsmodus ist aktiv" : "App ist wieder für alle geöffnet");
  };
  const publishedSetlists = setlists.filter((item) => item.state !== "draft");
  const ownDraftCount = setlists.filter((item) => item.state === "draft" && (session ? item.ownerId === session.user.id : item.owner === friendlyName)).length;
  const visibleSetlists = setlists.filter((item) => setlistFilter === "all" || (setlistFilter === "finalists" ? item.state === "finalist" || item.state === "final" : item.state === "draft" && (session ? item.ownerId === session.user.id : item.owner === friendlyName)));
  const finalist = setlists.find((item) => item.state === "final") ?? setlists.find((item) => item.state === "finalist");
  const onlineMembers = members.filter((member) => onlineMemberIds.includes(member.id));
  const sortedMembers = [...members].sort((a, b) => Number(onlineMemberIds.includes(b.id)) - Number(onlineMemberIds.includes(a.id)) || a.displayName.localeCompare(b.displayName, "de"));
  const navItems: { id: View; label: string; icon: typeof Music2 }[] = [
    { id: "home", label: "Übersicht", icon: BarChart3 }, { id: "pieces", label: "Stücke", icon: FileMusic }, { id: "setlists", label: "Setlists", icon: ListMusic }, ...(isAdmin ? [{ id: "admin" as View, label: "Admin", icon: Settings }] : []),
  ];

  if (!authReady || !maintenanceReady || (supabase && session && !profileReady)) return <div className="auth-loading"><AppMark /><strong>Setlist-o-Mat stimmt sich …</strong></div>;
  if (supabase && maintenance.enabled && (!session || !isAdmin)) return <MaintenanceScreen status={maintenance} signedIn={Boolean(session)} />;
  if (supabase && !session) return <LoginScreen supabase={supabase} />;

  return <main className="app-shell">
    <aside className="side-nav">
      <div className="brand-block"><AppMark /><div><strong>Setlist-o-Mat</strong><span>Gemeinsam. Klingt besser.</span></div></div>
      <nav aria-label="Hauptnavigation">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon />{item.label}{item.id === "pieces" && <span className="nav-count">{catalogue.length - completed}</span>}</button>; })}</nav>
      <div className="side-project"><span>Aktives Projekt</span><button><span><Music2 /> Jahreskonzert 2027</span><ChevronDown /></button></div>
      <div className="side-online" title={onlineMembers.length ? onlineMembers.map((member) => member.displayName).join(", ") : "Niemand online"}><span className="presence-dot online" /><strong>{onlineMembers.length} online</strong><small>{onlineMembers.length === 1 ? onlineMembers[0].displayName : onlineMembers.length ? "gerade in der App" : "gerade niemand"}</small></div>
      <div className="side-user"><div className="avatar">{friendlyName.slice(0, 2).toLocaleUpperCase("de")}</div><button className="profile-trigger" onClick={() => setShowProfileDialog(true)} aria-label="Profilnamen ändern"><strong>{friendlyName}</strong><span>{isAdmin ? "Administrator" : "Mitglied"}</span></button><button className="icon-button logout-button" title="Abmelden" aria-label="Abmelden" onClick={() => supabase?.auth.signOut()}><LogOut /></button></div>
    </aside>

    <section className="main-stage">
      <header className="mobile-header"><div className="mobile-brand"><AppMark /><strong>Setlist-o-Mat</strong></div><div className="mobile-header-actions"><span className="mobile-online" title={`${onlineMembers.length} online`}><i />{onlineMembers.length}</span><button className="icon-button" aria-label="Profilnamen ändern" onClick={() => setShowProfileDialog(true)}><UserRound /></button><button className="icon-button logout-button" title="Abmelden" aria-label="Abmelden" onClick={() => supabase?.auth.signOut()}><LogOut /></button></div></header>

      {view === "home" && <div className="page dashboard-page">
        <div className="page-heading home-heading"><div><span className="eyebrow"><Sparkles /> Jahreskonzert 2027</span><h1>Hallo {friendlyName}, was klingt gut?</h1><p>Noch {catalogue.length - completed} Stücke warten auf deine Ohren. Danach darfst du bei den anderen spicken.</p></div><button className="primary-button" onClick={() => setView("pieces")}><Headphones /> Weiter bewerten</button></div>
        <div className="dashboard-grid">
          <article className="hero-card progress-card"><div className="card-topline"><span>Dein Bewertungsfortschritt</span><strong>{progress}%</strong></div><div className="big-progress"><span style={{ width: `${progress}%` }} /></div><div className="progress-copy"><strong>{completed} von {catalogue.length}</strong><span>Noch {catalogue.length - completed} Hörproben – eine gute Playlistlänge.</span></div><button onClick={() => { setOnlyOpen(true); setView("pieces"); }}>Offene Stücke ansehen <ChevronRight /></button><div className="vinyl-art" aria-hidden="true"><span /><Music2 /></div></article>
          <article className="metric-card"><div className="metric-icon purple"><Users /></div><div><span>Teilnehmer</span><strong>{supabase ? members.length : 6}</strong><small>{supabase ? "im aktuellen Projekt" : "5 zuletzt aktiv"}</small></div></article>
          <article className="metric-card"><div className="metric-icon coral"><ListMusic /></div><div><span>Veröffentlichte Setlists</span><strong>{publishedSetlists.length}</strong><small>{setlists.filter((item) => item.state === "finalist" || item.state === "final").length} in der Finalrunde</small></div></article>
          {finalist ? <article className="content-card finalist-card"><div className="section-title"><div><span className="eyebrow"><Trophy /> Finalrunde</span><h2>{finalist.name}</h2></div><span className="status-pill finalist">{finalist.state === "final" ? "Final" : "Finalist"}</span></div><p className="muted">von {finalist.owner} · {finalist.pieceIds.length} Stücke</p><TimeSignal duration={getMetrics(finalist.pieceIds, catalogue).duration} /><div className="mini-stats"><span><Star fill="currentColor" /> {finalist.rating.toFixed(1).replace(".", ",")} <small>({finalist.ratingCount}/{Math.max(members.length, 6)})</small></span><span><MessageCircle /> {finalist.comments} Kommentare</span></div><button className="secondary-button" onClick={() => setView("setlists")}>Jetzt bewerten <ChevronRight /></button></article> : <article className="content-card finalist-card"><div className="section-title"><div><span className="eyebrow"><Trophy /> Finalrunde</span><h2>Noch alles offen</h2></div></div><p className="muted">Sobald eine Setlist markiert ist, erscheint sie hier.</p><button className="secondary-button" onClick={() => setView("setlists")}>Setlists ansehen <ChevronRight /></button></article>}
          {nextPiece && <article className="content-card next-up-card"><div className="section-title"><div><span className="eyebrow"><Headphones /> Als Nächstes</span><h2>{nextPiece.title}</h2></div></div><p>{nextPiece.composer}</p><div className="piece-facts"><span><Clock3 /> {formatDuration(nextPiece.durationSeconds)}</span><span>Grade {nextPiece.grade}</span><span className="genre-chip">{nextPiece.genres[0] ?? "Genre offen"}</span></div><button className="play-button" onClick={() => { setActivePieceId(nextPiece.id); setView("pieces"); }}><Play fill="currentColor" /> Hörprobe starten</button></article>}
        </div>
      </div>}

      {view === "pieces" && <div className="page pieces-page">
        <div className="page-heading"><div><span className="eyebrow"><Headphones /> Stücke bewerten</span><h1>Deine Ohren, deine Meinung.</h1><p>Bewerte erst selbst – danach siehst du, was die anderen denken.</p></div><div className="compact-progress"><strong>{completed}/{catalogue.length}</strong><div><span style={{ width: `${progress}%` }} /></div><small>bearbeitet</small></div></div>
        <div className="filter-bar"><div className="search-field" role="search"><Search /><input aria-label="Titel oder Arrangeur suchen" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Titel oder Arrangeur suchen" />{search && <button className="clear-search-button" onClick={() => setSearch("")} aria-label="Suchtext löschen"><X /></button>}</div><label className="select-field"><Filter /><select value={genre} onChange={(event) => setGenre(event.target.value)}>{genres.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label><button className={onlyOpen ? "toggle active" : "toggle"} aria-pressed={onlyOpen} onClick={() => setOnlyOpen((current) => !current)}><span /> Nur offene</button>{hasActivePieceFilters && <button className="clear-filters" onClick={clearPieceFilters}><X /> Filter löschen</button>}</div>
        <div className="piece-list-head"><span>{filteredPieces.length} Stücke</span><span>Sortiert nach Titel</span></div>
        <div className="piece-list">{filteredPieces.map((piece) => { const own = ratings[piece.id]; const group = groupRatings[piece.id]; return <article className={`piece-row ${own ? "rated" : ""}`} key={piece.id}><button className="piece-play" onClick={() => setActivePieceId(piece.id)} disabled={!piece.youtubeId} aria-label={`Hörprobe ${piece.title}`}><Play fill="currentColor" /></button><button className="piece-main" onClick={() => setActivePieceId(piece.id)}><div className="piece-title-line"><h3>{piece.title}</h3>{own && <span className="rated-pill"><Check /> {own.skipped ? "Bearbeitet" : "Bewertet"}</span>}{piece.owned && <span className="owned-pill"><BadgeCheck /> Im Bestand</span>}</div><p>{piece.composer}</p><div className="piece-facts"><span><Clock3 /> {formatDuration(piece.durationSeconds)}</span><span>Grade {piece.grade}</span><span><Euro /> {formatPiecePrice(piece)}</span><span className="genre-chip">{piece.genres[0] ?? "Genre offen"}</span>{piece.soloStatus === "available" && <span className="solo-chip"><UserRound /> Solo</span>}</div></button><div className="rating-cell">{own ? <>{own.skipped ? <span className="skipped-rating"><CircleHelp /> Nicht beurteilt</span> : <Stars value={own.stars} small />}<span className="average-note">{group?.count ? `Ø Gruppe ${group.average.toFixed(1).replace(".", ",")}` : "Noch keine Gruppenwertung"}</span></> : <><span className="locked-rating"><Lock /> Gruppe noch verborgen</span><button onClick={() => setActivePieceId(piece.id)}>Bewerten</button></>}</div><ChevronRight className="row-chevron" /></article>; })}</div>
      </div>}

      {view === "setlists" && <div className="page setlists-page">
        <div className="page-heading"><div><span className="eyebrow"><ListMusic /> Setlists</span><h1>30 Minuten. Unendlich viele Möglichkeiten.</h1><p>Baue Varianten, veröffentliche deine Favoriten und finde gemeinsam das beste Programm.</p></div><button className="primary-button" onClick={createSetlist}><Plus /> Neue Setlist</button></div>
        <div className="setlist-tabs" role="tablist" aria-label="Setlists filtern">
          <button role="tab" aria-selected={setlistFilter === "all"} className={setlistFilter === "all" ? "active" : ""} onClick={() => setSetlistFilter("all")}>Alle <span>{setlists.length}</span></button>
          <button role="tab" aria-selected={setlistFilter === "finalists"} className={setlistFilter === "finalists" ? "active" : ""} onClick={() => setSetlistFilter("finalists")}>Finalrunde <span>{setlists.filter((item) => item.state === "finalist" || item.state === "final").length}</span></button>
          <button role="tab" aria-selected={setlistFilter === "mine"} className={setlistFilter === "mine" ? "active" : ""} onClick={() => setSetlistFilter("mine")}>Meine Entwürfe <span>{ownDraftCount}</span></button>
        </div>
        {visibleSetlists.length ? <div className="setlist-grid">{visibleSetlists.map((setlist) => {
          const metrics = getMetrics(setlist.pieceIds, catalogue);
          const ownSetlistRating = setlistRatings[String(setlist.id)];
          const canDeleteDraft = setlist.state === "draft" && (!session || setlist.ownerId === session.user.id);
          return <article className={`setlist-card state-${setlist.state}`} key={setlist.id}>
            <div className="setlist-card-head"><div>{setlist.state === "draft" ? <Lock /> : setlist.state === "finalist" || setlist.state === "final" ? <Trophy /> : <ListMusic />}</div><span className={`status-pill ${setlist.state}`}>{setlist.state === "draft" ? "Privater Entwurf" : setlist.state === "finalist" ? "Finalrunde" : setlist.state === "final" ? "Finale Setlist" : "Veröffentlicht"}</span></div>
            <h2>{setlist.name}</h2><p>von {setlist.owner} · {setlist.pieceIds.length} Stücke</p><TimeSignal duration={metrics.duration} compact />
            <div className="setlist-piece-preview">{metrics.selected.slice(0, 4).map((piece, index) => <span key={piece.id}><b>{index + 1}</b>{piece.title}<small>{formatDuration(piece.durationSeconds)}</small></span>)}{metrics.selected.length > 4 && <em>+{metrics.selected.length - 4} weitere</em>}</div>
            <div className="genre-line">{metrics.genres.slice(0, 3).map((item) => <span className="genre-chip" key={item}>{item}</span>)}</div>
            <div className="setlist-footer">{setlist.state === "draft" ? <button className="secondary-button" onClick={() => { setSetlistSaveState("saved"); setBuilderId(setlist.id); }}><Pencil /> Weiterbauen</button> : <button className="setlist-score score-button" onClick={() => setActiveSetlistId(setlist.id)}><Star fill={setlist.ratingCount ? "currentColor" : "none"} /><strong>{setlist.ratingCount ? setlist.rating.toFixed(1).replace(".", ",") : "–"}</strong><small>{ownSetlistRating ? `Du: ${ownSetlistRating.stars}/5 · Diskussion öffnen` : `${setlist.ratingCount}/${Math.max(members.length, 6)} bewertet`}</small></button>}<button className="text-button" onClick={() => duplicateSetlist(setlist)}><Copy /> Duplizieren</button>{canDeleteDraft && <button className="text-button danger-button" onClick={() => void deleteSetlist(setlist)}><Trash2 /> Löschen</button>}</div>
            {isAdmin && setlist.state !== "draft" && <div className="admin-setlist-actions"><span>Admin-Auswahl</span>{setlist.state !== "finalist" && setlist.state !== "final" && <button onClick={() => markSetlist(setlist.id, "finalist")}><Trophy /> Finalrunde</button>}{setlist.state === "finalist" && <button onClick={() => markSetlist(setlist.id, "final")}><BadgeCheck /> Als final festlegen</button>}{(setlist.state === "finalist" || setlist.state === "final") && <button onClick={() => markSetlist(setlist.id, "published")}><X /> Zurücksetzen</button>}</div>}
          </article>;
        })}</div> : <div className="empty-setlists"><ListMusic /><strong>Hier ist noch nichts gelandet.</strong><span>{setlistFilter === "mine" ? "Lege eine neue Setlist an – sie bleibt bis zur Veröffentlichung privat." : "Sobald eine Setlist für diese Auswahl passt, erscheint sie hier."}</span></div>}
      </div>}

      {view === "admin" && isAdmin && <div className="page admin-page">
        <div className="page-heading"><div><span className="eyebrow"><Settings /> Adminbereich</span><h1>Alles im Takt halten.</h1><p>Metadaten vervollständigen, Teilnehmer verwalten und den Auswahlprozess steuern.</p></div><button className="secondary-button"><FileMusic /> Excel importieren</button></div>
        <article className={`maintenance-card ${maintenance.enabled ? "active" : ""}`}><div className="maintenance-icon">{maintenance.enabled ? <Construction /> : <Power />}</div><div><span className="eyebrow">Wartung</span><h2>{maintenance.enabled ? "Die App ist für Mitglieder gesperrt." : "Die App ist geöffnet."}</h2><p>{maintenance.enabled ? "Bestehende Sitzungen bleiben erhalten. Mitglieder gelangen automatisch zurück, sobald du die Wartung beendest." : `${onlineMembers.filter((member) => member.id !== session?.user.id).length} weitere Personen sind gerade online. Vor einem Datenbank-Update am besten warten, bis hier 0 steht.`}</p></div><button className={maintenance.enabled ? "primary-button maintenance-off" : "secondary-button"} onClick={() => void toggleMaintenance()}>{maintenance.enabled ? <><Power /> Wartung beenden</> : <><Construction /> Wartung starten</>}</button></article>
        <div className="admin-metrics"><article><div className="metric-icon coral"><CircleHelp /></div><div><strong>{catalogue.filter((piece) => piece.soloStatus === "unknown").length}</strong><span>Soli noch offen</span></div></article><article><div className="metric-icon yellow"><Filter /></div><div><strong>{catalogue.filter((piece) => piece.genres.length === 0).length}</strong><span>Genres fehlen</span></div></article><article><div className="metric-icon purple"><Activity /></div><div><strong>{onlineMembers.length}</strong><span>Gerade online</span></div></article><article><div className="metric-icon green"><BadgeCheck /></div><div><strong>{catalogue.filter((piece) => piece.owned).length}</strong><span>Stücke im Bestand</span></div></article></div>
        <div className="admin-columns">
          <article className="content-card admin-table-card">
            <div className="section-title"><div><span className="eyebrow">Stückdaten</span><h2>Gesamter Katalog</h2></div><span className="status-pill draft">{incompletePieceCount} unvollständig</span></div>
            <div className="admin-piece-controls"><label className="search-field"><Search /><input value={adminPieceSearch} onChange={(event) => setAdminPieceSearch(event.target.value)} placeholder="Titel, Komponist, Quelle …" /></label><button className={adminOnlyIncomplete ? "toggle active" : "toggle"} onClick={() => setAdminOnlyIncomplete((value) => !value)}><Filter /> Nur unvollständige</button></div>
            <div className="admin-piece-list">{adminPieces.map((piece) => { const missing = getMissingPieceFields(piece); return <button key={piece.id} onClick={() => setAdminEditId(piece.id)}><div><strong>{piece.title}</strong><span>{piece.composer}</span></div><div className="missing-tags">{missing.length ? missing.slice(0, 2).map((field) => <em key={field}>{field} fehlt</em>) : <em className="complete">Vollständig</em>}{missing.length > 2 && <em>+{missing.length - 2}</em>}<Pencil /></div></button>; })}</div>
            {!adminPieces.length && <p className="admin-empty">Keine passenden Stücke gefunden.</p>}
          </article>
          <article className="content-card member-card"><div className="section-title"><div><span className="eyebrow">Teilnehmer</span><h2>Wer ist dabei?</h2></div><button className="icon-button" onClick={addAllowedEmail} aria-label="E-Mail freigeben"><Plus /></button></div>{sortedMembers.map((member, index) => { const online = onlineMemberIds.includes(member.id); const ratingProgress = catalogue.length ? Math.round(member.ratingsCompleted / catalogue.length * 100) : 0; return <div className={`member-row ${online ? "member-online" : ""}`} key={member.id}><div className={`avatar color-${index}`}>{member.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("de")}</div><div className="member-copy"><strong><span className={`presence-dot ${online ? "online" : "offline"}`} />{member.displayName}</strong><span>{member.email}</span><span>{member.isAdmin ? "Administrator" : "Mitglied"} · {online ? "jetzt online" : `zuletzt ${formatLastActive(member.lastSeenAt)}`}</span><div className="member-progress"><i><b style={{ width: `${ratingProgress}%` }} /></i><small>{member.ratingsCompleted} von {catalogue.length} Stücken bearbeitet</small></div></div>{member.id !== session?.user.id ? <button className="icon-button" aria-label={`${member.displayName} löschen`} onClick={() => void deleteMember(member)}><Trash2 /></button> : <span className="self-label">Du</span>}</div>; })}{allowedEmails.filter((entry) => !members.some((member) => member.email.toLocaleLowerCase("de") === entry.email.toLocaleLowerCase("de"))).map((entry, index) => <div className="member-row" key={entry.email}><div className={`avatar color-${(members.length + index) % 6}`}>?</div><div><strong>{entry.displayName || entry.email}</strong><span>Freigabeliste · noch nie angemeldet</span></div><button className="icon-button" aria-label={`${entry.email} entfernen`} onClick={() => void removeAllowedEmail(entry.email)}><Trash2 /></button></div>)}</article>
        </div>
      </div>}
    </section>

    <nav className="bottom-nav" aria-label="Mobile Navigation">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon /><span>{item.label}</span>{item.id === "pieces" && <i>{catalogue.length - completed}</i>}</button>; })}</nav>
    {activePiece && <PieceDialog piece={activePiece} rating={ratings[activePiece.id]} groupRating={groupRatings[activePiece.id]} onClose={() => setActivePieceId(null)} onSave={(rating) => saveRating(activePiece.id, rating)} />}
    {activeSetlist && <SetlistDialog catalogue={catalogue} setlist={activeSetlist} rating={setlistRatings[String(activeSetlist.id)]} currentUserId={session?.user.id ?? "demo-current"} onClose={() => setActiveSetlistId(null)} onSave={(rating) => { void saveSetlistRating(activeSetlist, rating); setActiveSetlistId(null); }} />}
    {builder && <BuilderDialog catalogue={catalogue} setlist={builder} saveState={setlistSaveState} onClose={() => setBuilderId(null)} onPatch={patchBuilder} onPublish={() => { patchBuilder({ state: "published" }); setBuilderId(null); flash("Setlist veröffentlicht – jetzt darf bewertet werden"); }} />}
    {adminPiece && <AdminPieceDialog piece={adminPiece} onClose={() => setAdminEditId(null)} onSave={(patch) => savePieceMetadata(adminPiece, patch)} />}
    {showProfileDialog && supabase && session && <ProfileNameDialog initialName={suggestedProfileName} required={!profileNameConfirmedAt} email={email} onClose={() => setShowProfileDialog(false)} onSave={saveProfileName} />}
    {toast && <div className="toast"><Check /> {toast}</div>}
  </main>;
}

function MaintenanceScreen({ status, signedIn }: { status: MaintenanceStatus; signedIn: boolean }) {
  return <main className="auth-page maintenance-page"><section className="maintenance-screen"><div className="maintenance-screen-mark"><AppMark /><Construction /></div><span className="eyebrow"><Sparkles /> Kurze Generalpause</span><h1>Der Setlist-o-Mat wird gerade gestimmt.</h1><p>{status.message}</p><div className="maintenance-wait"><Activity /><span>{signedIn ? "Du bleibst angemeldet und gelangst automatisch zurück, sobald alles fertig ist." : "Die Anmeldung öffnet sich automatisch wieder, sobald alles fertig ist."}</span></div>{status.startedAt && <small>Wartung seit {new Date(status.startedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</small>}</section></main>;
}

function LoginScreen({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const requestCode = async () => {
    setBusy(true); setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.href.split(/[?#]/)[0] },
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setSent(true);
  };
  const verifyCode = async () => {
    setBusy(true); setMessage(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setMessage("Der Code ist ungültig oder abgelaufen. Bitte fordere einen neuen an.");
  };

  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><AppMark /><div><strong>Setlist-o-Mat</strong><span>Gemeinsam. Klingt besser.</span></div></div><div className="auth-art" aria-hidden="true"><Music2 /><span>♪</span><i>✦</i></div><div className="auth-copy"><span className="eyebrow"><Sparkles /> Jahreskonzert 2027</span><h1>{sent ? "Schau kurz ins Postfach." : "Reinhören. Bewerten. Programm bauen."}</h1><p>{sent ? `Wir haben einen Anmeldelink an ${email} geschickt. Öffne ihn direkt – falls die Mail stattdessen einen sechsstelligen Code enthält, kannst du ihn hier eingeben.` : "Ohne Passwort: E-Mail eingeben und den Anmeldelink oder Code aus der Mail verwenden."}</p>{!sent ? <form onSubmit={(event) => { event.preventDefault(); requestCode(); }}><label><span>E-Mail-Adresse</span><input autoComplete="email" inputMode="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@beispiel.de" /></label><button className="primary-button" disabled={busy || !email.trim()}>{busy ? "Wird gesendet …" : "Anmeldemail senden"}<ChevronRight /></button></form> : <form onSubmit={(event) => { event.preventDefault(); verifyCode(); }}><label><span>Sechsstelliger Code <small>falls in der Mail enthalten</small></span><input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" /></label><button className="primary-button" disabled={busy || code.length !== 6}>{busy ? "Wird geprüft …" : "Code verwenden"}<ChevronRight /></button><button type="button" className="text-button" onClick={() => { setSent(false); setCode(""); setMessage(null); }}>Andere E-Mail verwenden</button></form>}{message && <div className="auth-message"><CircleHelp />{message}</div>}<div className="auth-hint"><BadgeCheck /><span><strong>@musikverein-verl.de</strong> ist automatisch freigeschaltet. Andere Adressen müssen auf der Freigabeliste stehen – im Zweifel kurz per WhatsApp melden.</span></div></div></section></main>;
}

function ProfileNameDialog({ initialName, required, email, onClose, onSave }: { initialName: string; required: boolean; email: string; onClose: () => void; onSave: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedName = name.trim().replace(/\s+/g, " ");
  const save = async () => {
    setBusy(true); setError(null);
    const saveError = await onSave(normalizedName);
    setBusy(false);
    if (saveError) setError(saveError);
  };
  return <div className="dialog-backdrop profile-backdrop" onMouseDown={(event) => !required && event.target === event.currentTarget && onClose()}><section className="dialog profile-dialog" role="dialog" aria-modal="true" aria-label={required ? "Anzeigenamen festlegen" : "Anzeigenamen ändern"}>{!required && <button className="dialog-close" onClick={onClose} aria-label="Schließen"><X /></button>}<div className="profile-icon"><UserRound /></div><span className="dialog-kicker"><Sparkles /> {required ? "Fast geschafft" : "Dein Profil"}</span><h2>{required ? "Wie dürfen wir dich nennen?" : "Wie möchtest du heißen?"}</h2><p className="profile-intro">Dieser Name erscheint bei deinen Bewertungen, Kommentaren und Setlists. Ein Vorname reicht vollkommen.</p><form className="profile-form" onSubmit={(event) => { event.preventDefault(); void save(); }}><label><span>Anzeigename</span><input autoFocus autoComplete="name" maxLength={80} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Zum Beispiel Fabian" /></label><small className="profile-email">Angemeldet als {email}</small>{error && <div className="profile-error"><CircleHelp /> {error}</div>}<div className="dialog-actions">{!required && <button type="button" className="text-button" onClick={onClose}>Abbrechen</button>}<button className="primary-button" disabled={busy || normalizedName.length < 2}>{busy ? "Wird gespeichert …" : "Name speichern"}<Check /></button></div></form></section></div>;
}

function PieceDialog({ piece, rating, groupRating, onClose, onSave }: { piece: Piece; rating?: Rating; groupRating?: GroupRating; onClose: () => void; onSave: (rating: Rating) => Promise<boolean> }) {
  const [stars, setStars] = useState<number | null>(rating?.stars ?? null);
  const [skipped, setSkipped] = useState(rating?.skipped ?? false);
  const [comment, setComment] = useState(rating?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!stars && !skipped) return;
    setSaving(true);
    const saved = await onSave({ stars, skipped, comment });
    setSaving(false);
    if (saved) onClose();
  };
  return <div className="dialog-backdrop" onMouseDown={(event) => !saving && event.target === event.currentTarget && onClose()}><section className="dialog piece-dialog" role="dialog" aria-modal="true" aria-label={`${piece.title} bewerten`}><button className="dialog-close" disabled={saving} onClick={onClose}><X /></button><div className="dialog-kicker"><Headphones /> Hörprobe & Bewertung</div><h2>{piece.title}</h2><p className="dialog-subtitle">{piece.composer}</p><div className="dialog-facts"><span><Clock3 /> {formatDuration(piece.durationSeconds)}</span><span>Grade {piece.grade}</span><span><Euro /> {formatPiecePrice(piece)}</span>{piece.genres.map((item) => <span className="genre-chip" key={item}>{item}</span>)}{piece.owned && <span className="owned-pill"><BadgeCheck /> Im Bestand</span>}{piece.soloStatus === "available" && <span className="solo-chip"><UserRound /> Solo: {piece.solos || "Instrumente noch offen"}</span>}{piece.soloStatus === "unknown" && <span className="solo-chip unknown"><CircleHelp /> Soli noch nicht erfasst</span>}</div>{piece.youtubeId ? <div className="youtube-wrap"><iframe src={`https://www.youtube-nocookie.com/embed/${piece.youtubeId}?rel=0`} title={`Hörprobe ${piece.title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div> : <div className="no-sample"><Headphones /><strong>Keine Hörprobe hinterlegt</strong><span>Du kannst das Stück trotzdem bewerten oder überspringen.</span></div>}<div className="rating-panel"><div className="rating-question"><span>Wie gut passt das Stück ins Konzert?</span><Stars value={skipped ? null : stars} onChange={(value) => { setSkipped(false); setStars(value); }} /></div><button className={skipped ? "skip-button active" : "skip-button"} onClick={() => { setSkipped(true); setStars(null); }}><CircleHelp /> Kann ich nicht beurteilen</button><label><span>Dein Kommentar <small>optional</small></span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Was spricht dafür oder dagegen? Soli, Wirkung, Besetzung …" /></label>{rating && groupRating?.count ? <div className="group-peek"><div><Users /><span>Gruppe · {groupRating.count} Bewertungen</span></div><strong>Ø {groupRating.average.toFixed(1).replace(".", ",")}</strong><Stars value={Math.round(groupRating.average)} small />{groupRating.comments.length > 0 && <details><summary>{groupRating.comments.length} Kommentare lesen</summary>{groupRating.comments.map((entry, index) => <p key={`${entry.author}-${index}`}><strong>{entry.author}:</strong> {entry.text}</p>)}</details>}</div> : rating && <div className="group-peek"><div><Users /><span>Noch keine weitere Gruppenbewertung</span></div></div>}</div><div className="dialog-actions"><button className="text-button" disabled={saving} onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={saving || (!stars && !skipped)} onClick={() => void submit()}><Check /> {saving ? "Wird gespeichert …" : "Bewertung speichern"}</button></div></section></div>;
}

function BuilderDialog({ catalogue, setlist, saveState, onClose, onPatch, onPublish }: { catalogue: Piece[]; setlist: Setlist; saveState: SetlistSaveState; onClose: () => void; onPatch: (patch: Partial<Setlist>) => void; onPublish: () => void }) {
  const [query, setQuery] = useState("");
  const metrics = getMetrics(setlist.pieceIds, catalogue);
  const candidates = catalogue.filter((piece) => !setlist.pieceIds.includes(piece.id) && `${piece.title} ${piece.composer}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const move = (index: number, delta: number) => { const target = index + delta; if (target < 0 || target >= setlist.pieceIds.length) return; const next = [...setlist.pieceIds]; [next[index], next[target]] = [next[target], next[index]]; onPatch({ pieceIds: next }); };
  const saveLabel = saveState === "saving" ? "Wird gespeichert …" : saveState === "error" ? "Nicht gespeichert" : "Gespeichert";
  return <div className="dialog-backdrop builder-backdrop"><section className="dialog builder-dialog" role="dialog" aria-modal="true" aria-label="Setlist bearbeiten"><header className="builder-header"><div><span className="dialog-kicker"><Lock /> Privater Entwurf</span><input value={setlist.name} onChange={(event) => onPatch({ name: event.target.value })} aria-label="Name der Setlist" /><span className={`builder-save-state ${saveState}`} aria-live="polite">{saveState === "saving" ? <Activity /> : saveState === "error" ? <CircleHelp /> : <Check />}{saveLabel}</span></div><button className="dialog-close" onClick={onClose}><X /></button></header><div className="builder-layout"><div className="builder-main"><div className="builder-section-title"><div><h3>Programmfolge</h3><span>{setlist.pieceIds.length} Stücke · per Pfeil sortieren</span></div><button className="text-button" onClick={() => { const alternatives = artNames.filter((name) => name !== setlist.name); onPatch({ name: alternatives[Math.floor(Math.random() * alternatives.length)] }); }}><Shuffle /> Kunstname würfeln</button></div><div className="builder-items">{metrics.selected.length === 0 && <div className="empty-builder"><ListMusic /><strong>Deine Bühne ist noch leer.</strong><span>Füge unten die ersten Stücke hinzu.</span></div>}{metrics.selected.map((piece, index) => <div className="builder-item" key={piece.id}><span className="order-number">{index + 1}</span><div className="builder-item-copy"><strong>{piece.title}</strong><span>{piece.composer}</span><div><em>{formatDuration(piece.durationSeconds)}</em><em>Grade {piece.grade}</em>{piece.genres[0] && <em>{piece.genres[0]}</em>}</div></div><div className="reorder"><button onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp /></button><button onClick={() => move(index, 1)} disabled={index === metrics.selected.length - 1}><ArrowDown /></button></div><button className="remove-button" onClick={() => onPatch({ pieceIds: setlist.pieceIds.filter((id) => id !== piece.id) })}><Trash2 /></button></div>)}</div><div className="add-pieces"><h3>Stück hinzufügen</h3><label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titel suchen" /></label><div className="candidate-list">{candidates.map((piece) => <button key={piece.id} onClick={() => onPatch({ pieceIds: [...setlist.pieceIds, piece.id] })}><Plus /><div><strong>{piece.title}</strong><span>{piece.composer}</span></div><em>{formatDuration(piece.durationSeconds)}</em></button>)}</div></div></div><aside className="builder-summary"><span className="eyebrow">Live-Check</span><h3>Passt das Programm?</h3><TimeSignal duration={metrics.duration} /><div className="summary-stat"><span><Clock3 /> Dauer</span><strong>{formatDuration(metrics.duration)}</strong></div><div className="summary-stat"><span><BarChart3 /> Schwierigkeit</span><strong>{metrics.minGrade || "–"}–{metrics.maxGrade || "–"}</strong><small>Ø {metrics.avgGrade ? metrics.avgGrade.toFixed(1).replace(".", ",") : "–"}</small></div><div className="summary-stat"><span><Euro /> Noch zu kaufen</span><strong>{formatMoney(metrics.cost)}</strong></div><div className="summary-genres"><span>Genre-Mix</span><div>{metrics.genres.length ? metrics.genres.map((item) => <em key={item}>{item}</em>) : <small>Noch keine Stücke gewählt</small>}</div></div><button className="primary-button publish-button" disabled={setlist.pieceIds.length === 0 || saveState === "error"} onClick={onPublish}><Sparkles /> Setlist veröffentlichen</button><small className="publish-note">Danach ist die Zusammenstellung gesperrt. Varianten bleiben jederzeit möglich.</small></aside></div></section></div>;
}

function SetlistDialog({ catalogue, setlist, rating, currentUserId, onClose, onSave }: { catalogue: Piece[]; setlist: Setlist; rating?: SetlistRating; currentUserId: string; onClose: () => void; onSave: (rating: SetlistRating) => void }) {
  const [stars, setStars] = useState<number | null>(rating?.stars ?? null);
  const [comment, setComment] = useState(rating?.comment ?? "");
  const metrics = getMetrics(setlist.pieceIds, catalogue);
  const comments = setlist.reviews.filter((review) => review.comment);
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog setlist-dialog" role="dialog" aria-modal="true" aria-label={`${setlist.name} bewerten`}><button className="dialog-close" onClick={onClose}><X /></button><span className="dialog-kicker"><ListMusic /> Setlist bewerten</span><h2>{setlist.name}</h2><p className="dialog-subtitle">von {setlist.owner} · {setlist.pieceIds.length} Stücke</p><TimeSignal duration={metrics.duration} /><div className="setlist-dialog-metrics"><span><BarChart3 /> Grade {metrics.minGrade}–{metrics.maxGrade} · Ø {metrics.avgGrade.toFixed(1).replace(".", ",")}</span><span><Euro /> {formatMoney(metrics.cost)} zu kaufen</span></div><div className="setlist-dialog-genres">{metrics.genres.map((genre) => <span className="genre-chip" key={genre}>{genre}</span>)}</div><ol className="setlist-dialog-pieces">{metrics.selected.map((piece, index) => <li key={piece.id}><b className="dialog-order">{index + 1}</b><div><strong>{piece.title}</strong><span>{piece.composer}</span>{piece.soloStatus === "available" && <span className="dialog-solo"><UserRound /> Soli: {piece.solos || "Instrumente noch offen"}</span>}{piece.soloStatus === "unknown" && <span className="dialog-solo unknown"><CircleHelp /> Soli noch nicht erfasst</span>}</div><small>{formatDuration(piece.durationSeconds)}</small></li>)}</ol><section className="setlist-discussion" aria-label="Gruppenbewertung"><div className="discussion-summary"><div><Users /><span>Gruppe · {setlist.ratingCount} {setlist.ratingCount === 1 ? "Bewertung" : "Bewertungen"}</span></div><strong>{setlist.ratingCount ? `Ø ${setlist.rating.toFixed(1).replace(".", ",")}` : "Noch keine Gruppenwertung"}</strong>{setlist.ratingCount > 0 && <Stars value={Math.round(setlist.rating)} small />}</div>{comments.length ? <div className="discussion-comments">{comments.map((review) => <article key={review.userId}><header><strong>{review.userId === currentUserId ? "Du" : review.author}</strong><span><Star fill="currentColor" /> {review.stars}/5</span></header><p>{review.comment}</p></article>)}</div> : <p className="discussion-empty">Noch keine Kommentare – du kannst die Diskussion eröffnen.</p>}</section><div className="rating-panel"><div className="rating-question"><span>Wie gut funktioniert diese Reihenfolge?</span><Stars value={stars} onChange={setStars} /></div><label><span>Dein Kommentar <small>optional und später änderbar</small></span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Dramaturgie, Dauer, Genre-Mix, Soli …" /></label></div><div className="dialog-actions"><button className="text-button" onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={!stars} onClick={() => stars && onSave({ stars, comment })}><Check /> Bewertung speichern</button></div></section></div>;
}

function AdminPieceDialog({ piece, onClose, onSave }: { piece: Piece; onClose: () => void; onSave: (patch: AdminPiecePatch) => Promise<boolean> }) {
  const [title, setTitle] = useState(piece.title);
  const [composer, setComposer] = useState(piece.composer);
  const [genreText, setGenreText] = useState(piece.genres.join(", "));
  const [sampleUrl, setSampleUrl] = useState(piece.sampleUrl ?? "");
  const [purchaseUrl, setPurchaseUrl] = useState(piece.purchaseUrl ?? "");
  const [soloStatus, setSoloStatus] = useState<Piece["soloStatus"]>(piece.soloStatus);
  const [solos, setSolos] = useState(piece.solos ?? "");
  const [duration, setDuration] = useState(formatDuration(piece.durationSeconds));
  const [grade, setGrade] = useState(String(piece.grade));
  const [price, setPrice] = useState((piece.priceCents / 100).toFixed(2).replace(".", ","));
  const [owned, setOwned] = useState(piece.owned);
  const [source, setSource] = useState(piece.source);
  const [note, setNote] = useState(piece.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const [minutes, seconds = "0"] = duration.split(":");
    const parsedDuration = Number(minutes) * 60 + Number(seconds);
    const parsedGrade = Number(grade);
    if (!title.trim()) { setError("Bitte einen Titel eingeben."); return; }
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0 || Number(seconds) < 0 || Number(seconds) > 59) { setError("Bitte die Dauer als mm:ss eingeben."); return; }
    if (!Number.isFinite(parsedGrade) || parsedGrade <= 0) { setError("Bitte einen gültigen Grade eingeben."); return; }
    setSaving(true); setError(null);
    const saved = await onSave({
      title: title.trim(), composer: composer.trim(),
      genres: genreText.split(",").map((item) => item.trim()).filter(Boolean),
      sampleUrl: sampleUrl.trim() || null, purchaseUrl: purchaseUrl.trim() || null,
      soloStatus, solos: solos.trim() || null,
      durationSeconds: parsedDuration,
      grade: parsedGrade, priceCents: Math.max(0, Math.round(Number(price.replace(",", ".")) * 100) || 0),
      owned, source: source.trim(), note: note.trim() || null,
    });
    setSaving(false);
    if (!saved) setError("Die Änderungen konnten nicht gespeichert werden.");
  };
  return <div className="dialog-backdrop"><section className="dialog admin-dialog"><button className="dialog-close" disabled={saving} onClick={onClose}><X /></button><span className="dialog-kicker"><Pencil /> Metadaten bearbeiten</span><h2>{piece.title}</h2><p className="dialog-subtitle">Alle Katalogdaten dieses Stücks</p><div className="form-grid"><label className="full"><span>Titel</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="full"><span>Komponist / Arrangeur</span><input value={composer} onChange={(event) => setComposer(event.target.value)} /></label><label><span>Genre</span><input value={genreText} onChange={(event) => setGenreText(event.target.value)} placeholder="z. B. Film, Rock/Pop" /></label><label><span>Soli-Status</span><select value={soloStatus} onChange={(event) => setSoloStatus(event.target.value as Piece["soloStatus"])}><option value="unknown">Noch unbekannt</option><option value="none">Keine Soli</option><option value="available">Soli vorhanden</option></select></label><label className="full"><span>Instrumente / Hinweise zu Soli</span><input value={solos} onChange={(event) => setSolos(event.target.value)} placeholder="z. B. Altsaxophon, Oboe, Posaune …" /></label><label><span>Dauer (mm:ss)</span><input value={duration} onChange={(event) => setDuration(event.target.value)} /></label><label><span>Grade</span><input type="number" step="0.5" value={grade} onChange={(event) => setGrade(event.target.value)} /></label><label><span>Preis in Euro</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label className="check-label"><input type="checkbox" checked={owned} onChange={(event) => setOwned(event.target.checked)} /><span>Bereits im Bestand</span></label><label className="full"><span>Hörprobe (YouTube-URL)</span><input type="url" value={sampleUrl} onChange={(event) => setSampleUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label><label className="full"><span>Kauflink</span><input type="url" value={purchaseUrl} onChange={(event) => setPurchaseUrl(event.target.value)} placeholder="https://…" /></label><label className="full"><span>Quelle</span><input value={source} onChange={(event) => setSource(event.target.value)} /></label><label className="full"><span>Kommentar / Medley-Stücke</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label></div>{error && <div className="profile-error"><CircleHelp /> {error}</div>}<div className="dialog-actions"><button className="text-button" disabled={saving} onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={saving} onClick={() => void save()}><Check /> {saving ? "Wird gespeichert …" : "Speichern"}</button></div></section></div>;
}
