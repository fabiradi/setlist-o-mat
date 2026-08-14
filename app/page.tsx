"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowDown, ArrowUp, BadgeCheck, BarChart3, Check, ChevronDown,
  ChevronRight, CircleHelp, Clock3, Copy, Euro, FileMusic, Filter,
  Headphones, ListMusic, Lock, Menu, MessageCircle, MoreHorizontal,
  Music2, Pencil, Play, Plus, Search, Settings, Shuffle, Sparkles,
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
type Setlist = { id: number | string; name: string; owner: string; pieceIds: number[]; state: SetlistState; rating: number; ratingCount: number; comments: number };
type SetlistRating = { stars: number; comment: string };
type AdminPiecePatch = Pick<Piece, "genres" | "soloStatus" | "solos" | "durationSeconds" | "grade" | "priceCents" | "owned" | "source" | "note">;

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
  { id: 1, name: "Tanzende Tuba", owner: "Demo-Mitglied 1", pieceIds: [1, 3, 5, 7, 9, 11], state: "finalist", rating: 4.4, ratingCount: 4, comments: 6 },
  { id: 2, name: "Goldener Wirbelwind", owner: "Demo-Mitglied 2", pieceIds: [2, 4, 6, 8, 10, 12], state: "published", rating: 4.1, ratingCount: 3, comments: 3 },
  { id: 3, name: "Mitternachtsfanfare", owner: "Demo-Mitglied 3", pieceIds: [1, 4, 7, 10, 12], state: "draft", rating: 0, ratingCount: 0, comments: 0 },
];
const artNames = ["Funkelnder Auftakt", "Fliegende Fermate", "Samtener Paukenschlag", "Tanzendes Tenorhorn", "Goldene Generalpause", "Wilde Holzbläser"];

function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function formatMoney(cents: number) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100); }
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
  const [builderId, setBuilderId] = useState<number | string | null>(null);
  const [remotePieceIds, setRemotePieceIds] = useState<Record<number, string>>({});
  const [pieceOverrides, setPieceOverrides] = useState<Record<number, Partial<Piece>>>({});
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Alle Genres");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [adminEditId, setAdminEditId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setAuthReady(true); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession); setAuthReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) return;
    let active = true;
    const loadProjectData = async () => {
      void supabase.from("profiles").update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", session.user.id);
      const { data: currentProfile } = await supabase
        .from("profiles").select("is_app_admin").eq("id", session.user.id).single();
      if (active) setIsAdmin(Boolean(currentProfile?.is_app_admin));
      const { data: dbPieces, error: piecesError } = await supabase
        .from("pieces").select("*").eq("project_id", ACTIVE_PROJECT_ID).eq("archived", false);
      if (piecesError || !dbPieces) { if (active) setToast("Supabase-Daten konnten nicht geladen werden"); return; }

      const pieceIds = Object.fromEntries(dbPieces.flatMap((piece) => {
        const match = /^xlsx-(\d+)$/.exec(piece.import_key ?? "");
        return match ? [[Number(match[1]), piece.id as string]] : [];
      })) as Record<number, string>;
      const localByRemote = new Map(Object.entries(pieceIds).map(([local, remote]) => [remote, Number(local)]));
      const remoteIds = Object.values(pieceIds);

      const [{ data: ownRatings }, { data: dbSetlists }, { data: dbSetlistRatings }] = await Promise.all([
        supabase.from("piece_ratings").select("piece_id, stars, skipped, comment").eq("user_id", session.user.id).in("piece_id", remoteIds),
        supabase.from("setlists").select("id, name, owner_id, state, setlist_items(piece_id, position)").eq("project_id", ACTIVE_PROJECT_ID),
        supabase.from("setlist_ratings").select("setlist_id, user_id, stars, comment"),
      ]);

      const ownerIds = [...new Set((dbSetlists ?? []).map((setlist) => setlist.owner_id))];
      const { data: owners } = ownerIds.length
        ? await supabase.from("profiles").select("id, display_name").in("id", ownerIds)
        : { data: [] as { id: string; display_name: string }[] };
      const ownerNames = new Map((owners ?? []).map((owner) => [owner.id, owner.display_name]));
      const allSetlistRatings = dbSetlistRatings ?? [];

      if (!active) return;
      setRemotePieceIds(pieceIds);
      setPieceOverrides(Object.fromEntries(dbPieces.flatMap((piece) => {
        const match = /^xlsx-(\d+)$/.exec(piece.import_key ?? "");
        if (!match) return [];
        const localId = Number(match[1]);
        const youtubeMatch = piece.sample_url?.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/);
        return [[localId, {
          title: piece.title, composer: piece.composer, durationSeconds: piece.duration_seconds,
          grade: Number(piece.grade), priceCents: piece.price_cents, owned: piece.owned,
          genres: piece.genres ?? [], sampleUrl: piece.sample_url, youtubeId: youtubeMatch?.[1] ?? null,
          purchaseUrl: piece.purchase_url, soloStatus: piece.solo_status, solos: piece.solos,
          source: piece.source, note: piece.note,
        }]];
      })));
      setRatings(Object.fromEntries((ownRatings ?? []).flatMap((rating) => {
        const localId = localByRemote.get(rating.piece_id);
        return localId ? [[localId, { stars: rating.stars, skipped: rating.skipped, comment: rating.comment ?? "" }]] : [];
      })));
      setSetlists((dbSetlists ?? []).map((setlist) => {
        const listRatings = allSetlistRatings.filter((rating) => rating.setlist_id === setlist.id);
        const stars = listRatings.map((rating) => rating.stars);
        const orderedItems = [...(setlist.setlist_items ?? [])].sort((a, b) => a.position - b.position);
        return {
          id: setlist.id,
          name: setlist.name,
          owner: ownerNames.get(setlist.owner_id) ?? "Mitglied",
          pieceIds: orderedItems.flatMap((item) => { const localId = localByRemote.get(item.piece_id); return localId ? [localId] : []; }),
          state: setlist.state as SetlistState,
          rating: stars.length ? stars.reduce((sum, value) => sum + value, 0) / stars.length : 0,
          ratingCount: stars.length,
          comments: listRatings.filter((rating) => rating.comment?.trim()).length,
        };
      }));
      setSetlistRatings(Object.fromEntries(allSetlistRatings.filter((rating) => rating.user_id === session.user.id).map((rating) => [rating.setlist_id, { stars: rating.stars, comment: rating.comment ?? "" }])));
    };
    void loadProjectData();
    return () => { active = false; };
  }, [session, supabase]);

  const catalogue = useMemo(() => pieces.map((piece) => ({ ...piece, ...pieceOverrides[piece.id] })), [pieceOverrides]);
  const activePiece = catalogue.find((piece) => piece.id === activePieceId) ?? null;
  const activeSetlist = setlists.find((setlist) => setlist.id === activeSetlistId) ?? null;
  const adminPiece = catalogue.find((piece) => piece.id === adminEditId) ?? null;
  const builder = setlists.find((setlist) => setlist.id === builderId) ?? null;
  const completed = Object.keys(ratings).length;
  const progress = Math.round((completed / catalogue.length) * 100);
  const genres = ["Alle Genres", ...new Set(catalogue.flatMap((piece) => piece.genres))];
  const nextPiece = catalogue.find((piece) => !ratings[piece.id]);
  const email = session?.user.email?.toLocaleLowerCase("de") ?? "";
  const displayName = session?.user.user_metadata?.display_name || (email ? email.split("@")[0].split(".")[0] : "Demo");
  const friendlyName = String(displayName).charAt(0).toLocaleUpperCase("de") + String(displayName).slice(1);

  const filteredPieces = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de");
    return catalogue.filter((piece) => (!query || `${piece.title} ${piece.composer}`.toLocaleLowerCase("de").includes(query)) && (genre === "Alle Genres" || piece.genres.includes(genre)) && (!onlyOpen || !ratings[piece.id]));
  }, [catalogue, genre, onlyOpen, ratings, search]);

  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2400); };
  const saveRating = async (pieceId: number, rating: Rating) => {
    setRatings((current) => ({ ...current, [pieceId]: rating }));
    if (supabase && session && remotePieceIds[pieceId]) {
      const { error } = await supabase.from("piece_ratings").upsert({ piece_id: remotePieceIds[pieceId], user_id: session.user.id, ...rating }, { onConflict: "piece_id,user_id" });
      if (error) { flash("Speichern fehlgeschlagen – bitte erneut versuchen"); return; }
    }
    flash("Bewertung gespeichert");
  };
  const createSetlist = async () => {
    const name = artNames[setlists.length % artNames.length];
    if (supabase && session) {
      const { data, error } = await supabase.from("setlists").insert({ project_id: ACTIVE_PROJECT_ID, owner_id: session.user.id, name, state: "draft" }).select("id").single();
      if (error || !data) { flash("Entwurf konnte nicht angelegt werden"); return; }
      const setlist: Setlist = { id: data.id, name, owner: friendlyName, pieceIds: [], state: "draft", rating: 0, ratingCount: 0, comments: 0 };
      setSetlists((current) => [...current, setlist]); setBuilderId(data.id); setView("setlists"); return;
    }
    const numericIds = setlists.map((item) => item.id).filter((id): id is number => typeof id === "number");
    const nextId = Math.max(...numericIds, 0) + 1;
    const setlist: Setlist = { id: nextId, name, owner: friendlyName, pieceIds: [], state: "draft", rating: 0, ratingCount: 0, comments: 0 };
    setSetlists((current) => [...current, setlist]); setBuilderId(nextId); setView("setlists");
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
      const duplicate: Setlist = { ...source, id: data.id, name, owner: friendlyName, state: "draft", rating: 0, ratingCount: 0, comments: 0, pieceIds: [...source.pieceIds] };
      setSetlists((current) => [...current, duplicate]); setBuilderId(data.id); flash("Variante als Entwurf angelegt"); return;
    }
    const numericIds = setlists.map((item) => item.id).filter((id): id is number => typeof id === "number");
    const nextId = Math.max(...numericIds, 0) + 1;
    const duplicate: Setlist = { ...source, id: nextId, name: `${baseName} – Variante ${Math.max(variants, 1) + 1}`, owner: friendlyName, state: "draft", rating: 0, ratingCount: 0, comments: 0, pieceIds: [...source.pieceIds] };
    setSetlists((current) => [...current, duplicate]); setBuilderId(nextId); flash("Variante als Entwurf angelegt");
  };
  const patchBuilder = (patch: Partial<Setlist>) => {
    if (!builderId) return;
    const current = setlists.find((item) => item.id === builderId);
    if (!current) return;
    const next = { ...current, ...patch };
    setSetlists((items) => items.map((item) => item.id === builderId ? next : item));
    if (supabase && typeof builderId === "string") void (async () => {
      await supabase.from("setlists").update({ name: next.name, state: next.state, published_at: next.state === "draft" ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", builderId);
      if (patch.pieceIds) {
        await supabase.from("setlist_items").delete().eq("setlist_id", builderId);
        const items = next.pieceIds.flatMap((pieceId, index) => remotePieceIds[pieceId] ? [{ setlist_id: builderId, piece_id: remotePieceIds[pieceId], position: index + 1 }] : []);
        if (items.length) await supabase.from("setlist_items").insert(items);
      }
    })();
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
    setSetlistRatings((current) => ({ ...current, [String(setlist.id)]: rating }));
    if (supabase && session && typeof setlist.id === "string") {
      const { error } = await supabase.from("setlist_ratings").upsert({ setlist_id: setlist.id, user_id: session.user.id, ...rating }, { onConflict: "setlist_id,user_id" });
      if (error) { flash("Setlist-Bewertung konnte nicht gespeichert werden"); return; }
    }
    flash("Setlist-Bewertung gespeichert");
  };
  const navItems: { id: View; label: string; icon: typeof Music2 }[] = [
    { id: "home", label: "Übersicht", icon: BarChart3 }, { id: "pieces", label: "Stücke", icon: FileMusic }, { id: "setlists", label: "Setlists", icon: ListMusic }, ...(isAdmin ? [{ id: "admin" as View, label: "Admin", icon: Settings }] : []),
  ];

  if (!authReady) return <div className="auth-loading"><AppMark /><strong>Setlist-o-Mat stimmt sich …</strong></div>;
  if (supabase && !session) return <LoginScreen supabase={supabase} />;

  return <main className="app-shell">
    <aside className="side-nav">
      <div className="brand-block"><AppMark /><div><strong>Setlist-o-Mat</strong><span>Gemeinsam. Klingt besser.</span></div></div>
      <nav aria-label="Hauptnavigation">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon />{item.label}{item.id === "pieces" && <span className="nav-count">{catalogue.length - completed}</span>}</button>; })}</nav>
      <div className="side-project"><span>Aktives Projekt</span><button><span><Music2 /> Jahreskonzert 2027</span><ChevronDown /></button></div>
      <div className="side-user"><div className="avatar">{friendlyName.slice(0, 2).toLocaleUpperCase("de")}</div><div><strong>{friendlyName}</strong><span>{isAdmin ? "Administrator" : "Mitglied"}</span></div><button className="icon-button" aria-label="Abmelden" onClick={() => supabase?.auth.signOut()}><MoreHorizontal /></button></div>
    </aside>

    <section className="main-stage">
      <header className="mobile-header"><div className="mobile-brand"><AppMark /><strong>Setlist-o-Mat</strong></div><button className="icon-button" aria-label={supabase ? "Abmelden" : "Menü"} onClick={() => supabase?.auth.signOut()}><Menu /></button></header>

      {view === "home" && <div className="page dashboard-page">
        <div className="page-heading home-heading"><div><span className="eyebrow"><Sparkles /> Jahreskonzert 2027</span><h1>Hallo {friendlyName}, was klingt gut?</h1><p>Noch {catalogue.length - completed} Stücke warten auf deine Ohren. Danach darfst du bei den anderen spicken.</p></div><button className="primary-button" onClick={() => setView("pieces")}><Headphones /> Weiter bewerten</button></div>
        <div className="dashboard-grid">
          <article className="hero-card progress-card"><div className="card-topline"><span>Dein Bewertungsfortschritt</span><strong>{progress}%</strong></div><div className="big-progress"><span style={{ width: `${progress}%` }} /></div><div className="progress-copy"><strong>{completed} von {catalogue.length}</strong><span>Noch {catalogue.length - completed} Hörproben – eine gute Playlistlänge.</span></div><button onClick={() => { setOnlyOpen(true); setView("pieces"); }}>Offene Stücke ansehen <ChevronRight /></button><div className="vinyl-art" aria-hidden="true"><span /><Music2 /></div></article>
          <article className="metric-card"><div className="metric-icon purple"><Users /></div><div><span>Teilnehmer</span><strong>6</strong><small>5 zuletzt aktiv</small></div></article>
          <article className="metric-card"><div className="metric-icon coral"><ListMusic /></div><div><span>Veröffentlichte Setlists</span><strong>2</strong><small>1 in der Finalrunde</small></div></article>
          <article className="content-card finalist-card"><div className="section-title"><div><span className="eyebrow"><Trophy /> Finalrunde</span><h2>Tanzende Tuba</h2></div><span className="status-pill finalist">Finalist</span></div><p className="muted">von Demo-Mitglied 1 · 6 Stücke</p><TimeSignal duration={getMetrics(initialSetlists[0].pieceIds, catalogue).duration} /><div className="mini-stats"><span><Star fill="currentColor" /> 4,4 <small>(4/6)</small></span><span><MessageCircle /> 6 Kommentare</span></div><button className="secondary-button" onClick={() => setView("setlists")}>Jetzt bewerten <ChevronRight /></button></article>
          {nextPiece && <article className="content-card next-up-card"><div className="section-title"><div><span className="eyebrow"><Headphones /> Als Nächstes</span><h2>{nextPiece.title}</h2></div></div><p>{nextPiece.composer}</p><div className="piece-facts"><span><Clock3 /> {formatDuration(nextPiece.durationSeconds)}</span><span>Grade {nextPiece.grade}</span><span className="genre-chip">{nextPiece.genres[0] ?? "Genre offen"}</span></div><button className="play-button" onClick={() => { setActivePieceId(nextPiece.id); setView("pieces"); }}><Play fill="currentColor" /> Hörprobe starten</button></article>}
        </div>
      </div>}

      {view === "pieces" && <div className="page pieces-page">
        <div className="page-heading"><div><span className="eyebrow"><Headphones /> Stücke bewerten</span><h1>Deine Ohren, deine Meinung.</h1><p>Bewerte erst selbst – danach siehst du, was die anderen denken.</p></div><div className="compact-progress"><strong>{completed}/{catalogue.length}</strong><div><span style={{ width: `${progress}%` }} /></div><small>bearbeitet</small></div></div>
        <div className="filter-bar"><label className="search-field"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Titel oder Arrangeur suchen" /></label><label className="select-field"><Filter /><select value={genre} onChange={(event) => setGenre(event.target.value)}>{genres.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label><button className={onlyOpen ? "toggle active" : "toggle"} onClick={() => setOnlyOpen((current) => !current)}><span /> Nur offene</button></div>
        <div className="piece-list-head"><span>{filteredPieces.length} Stücke</span><span>Sortiert nach Titel</span></div>
        <div className="piece-list">{filteredPieces.map((piece) => { const own = ratings[piece.id]; return <article className={`piece-row ${own ? "rated" : ""}`} key={piece.id}><button className="piece-play" onClick={() => setActivePieceId(piece.id)} disabled={!piece.youtubeId} aria-label={`Hörprobe ${piece.title}`}><Play fill="currentColor" /></button><button className="piece-main" onClick={() => setActivePieceId(piece.id)}><div className="piece-title-line"><h3>{piece.title}</h3>{piece.owned && <span className="owned-pill"><BadgeCheck /> Im Bestand</span>}</div><p>{piece.composer}</p><div className="piece-facts"><span><Clock3 /> {formatDuration(piece.durationSeconds)}</span><span>Grade {piece.grade}</span><span className="genre-chip">{piece.genres[0] ?? "Genre offen"}</span>{piece.soloStatus === "available" && <span className="solo-chip"><UserRound /> Solo</span>}</div></button><div className="rating-cell">{own ? <><Stars value={own.stars} small /><span className="average-note">Ø Gruppe 4,2</span></> : <><span className="locked-rating"><Lock /> Gruppe noch verborgen</span><button onClick={() => setActivePieceId(piece.id)}>Bewerten</button></>}</div><ChevronRight className="row-chevron" /></article>; })}</div>
      </div>}

      {view === "setlists" && <div className="page setlists-page">
        <div className="page-heading"><div><span className="eyebrow"><ListMusic /> Setlists</span><h1>30 Minuten. Unendlich viele Möglichkeiten.</h1><p>Baue Varianten, veröffentliche deine Favoriten und finde gemeinsam das beste Programm.</p></div><button className="primary-button" onClick={createSetlist}><Plus /> Neue Setlist</button></div>
        <div className="setlist-tabs"><button className="active">Alle <span>{setlists.length}</span></button><button>Finalrunde <span>1</span></button><button>Meine Entwürfe <span>{setlists.filter((item) => item.state === "draft").length}</span></button></div>
        <div className="setlist-grid">{setlists.map((setlist) => { const metrics = getMetrics(setlist.pieceIds, catalogue); const ownSetlistRating = setlistRatings[String(setlist.id)]; return <article className={`setlist-card state-${setlist.state}`} key={setlist.id}><div className="setlist-card-head"><div>{setlist.state === "draft" ? <Lock /> : setlist.state === "finalist" || setlist.state === "final" ? <Trophy /> : <ListMusic />}</div><span className={`status-pill ${setlist.state}`}>{setlist.state === "draft" ? "Privater Entwurf" : setlist.state === "finalist" ? "Finalrunde" : setlist.state === "final" ? "Finale Setlist" : "Veröffentlicht"}</span><button className="icon-button"><MoreHorizontal /></button></div><h2>{setlist.name}</h2><p>von {setlist.owner} · {setlist.pieceIds.length} Stücke</p><TimeSignal duration={metrics.duration} compact /><div className="setlist-piece-preview">{metrics.selected.slice(0, 4).map((piece, index) => <span key={piece.id}><b>{index + 1}</b>{piece.title}<small>{formatDuration(piece.durationSeconds)}</small></span>)}{metrics.selected.length > 4 && <em>+{metrics.selected.length - 4} weitere</em>}</div><div className="genre-line">{metrics.genres.slice(0, 3).map((item) => <span className="genre-chip" key={item}>{item}</span>)}</div><div className="setlist-footer">{setlist.state === "draft" ? <button className="secondary-button" onClick={() => setBuilderId(setlist.id)}><Pencil /> Weiterbauen</button> : <button className="setlist-score score-button" onClick={() => setActiveSetlistId(setlist.id)}><Star fill="currentColor" /><strong>{setlist.rating.toFixed(1).replace(".", ",")}</strong><small>{ownSetlistRating ? `Du: ${ownSetlistRating.stars}/5` : `${setlist.ratingCount}/6 bewertet`}</small></button>}<button className="text-button" onClick={() => duplicateSetlist(setlist)}><Copy /> Duplizieren</button></div>{isAdmin && setlist.state !== "draft" && <div className="admin-setlist-actions"><span>Admin-Auswahl</span>{setlist.state !== "finalist" && setlist.state !== "final" && <button onClick={() => markSetlist(setlist.id, "finalist")}><Trophy /> Finalrunde</button>}{setlist.state === "finalist" && <button onClick={() => markSetlist(setlist.id, "final")}><BadgeCheck /> Als final festlegen</button>}{(setlist.state === "finalist" || setlist.state === "final") && <button onClick={() => markSetlist(setlist.id, "published")}><X /> Zurücksetzen</button>}</div>}</article>; })}</div>
      </div>}

      {view === "admin" && isAdmin && <div className="page admin-page">
        <div className="page-heading"><div><span className="eyebrow"><Settings /> Adminbereich</span><h1>Alles im Takt halten.</h1><p>Metadaten vervollständigen, Teilnehmer verwalten und den Auswahlprozess steuern.</p></div><button className="secondary-button"><FileMusic /> Excel importieren</button></div>
        <div className="admin-metrics"><article><div className="metric-icon coral"><CircleHelp /></div><div><strong>{catalogue.filter((piece) => piece.soloStatus === "unknown").length}</strong><span>Soli noch offen</span></div></article><article><div className="metric-icon yellow"><Filter /></div><div><strong>{catalogue.filter((piece) => piece.genres.length === 0).length}</strong><span>Genres fehlen</span></div></article><article><div className="metric-icon purple"><Users /></div><div><strong>6</strong><span>Aktive Nutzer</span></div></article><article><div className="metric-icon green"><BadgeCheck /></div><div><strong>11</strong><span>Stücke im Bestand</span></div></article></div>
        <div className="admin-columns"><article className="content-card admin-table-card"><div className="section-title"><div><span className="eyebrow">Datenqualität</span><h2>Offene Metadaten</h2></div><span className="status-pill draft">{catalogue.filter((piece) => piece.soloStatus === "unknown" || piece.genres.length === 0).length} Aufgaben</span></div><div className="admin-piece-list">{catalogue.filter((piece) => piece.soloStatus === "unknown" || piece.genres.length === 0).slice(0, 8).map((piece) => <button key={piece.id} onClick={() => setAdminEditId(piece.id)}><div><strong>{piece.title}</strong><span>{piece.composer}</span></div><div className="missing-tags">{piece.genres.length === 0 && <em>Genre fehlt</em>}{piece.soloStatus === "unknown" && <em>Soli offen</em>}<Pencil /></div></button>)}</div></article><article className="content-card member-card"><div className="section-title"><div><span className="eyebrow">Teilnehmer</span><h2>Wer ist dabei?</h2></div><button className="icon-button"><Plus /></button></div>{["Demo-Admin", "Demo-Mitglied 1", "Demo-Mitglied 2", "Demo-Mitglied 3", "Demo-Mitglied 4", "Gastmitglied"].map((name, index) => <div className="member-row" key={name}><div className={`avatar color-${index}`}>{name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div><strong>{name}</strong><span>{index === 0 ? "Administrator · gerade aktiv" : index === 5 ? "Freigabeliste · noch nie angemeldet" : `Zuletzt aktiv vor ${index} Tag${index === 1 ? "" : "en"}`}</span></div><button className="icon-button"><MoreHorizontal /></button></div>)}</article></div>
      </div>}
    </section>

    <nav className="bottom-nav" aria-label="Mobile Navigation">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon /><span>{item.label}</span>{item.id === "pieces" && <i>{catalogue.length - completed}</i>}</button>; })}</nav>
    {activePiece && <PieceDialog piece={activePiece} rating={ratings[activePiece.id]} onClose={() => setActivePieceId(null)} onSave={(rating) => { saveRating(activePiece.id, rating); setActivePieceId(null); }} />}
    {activeSetlist && <SetlistDialog catalogue={catalogue} setlist={activeSetlist} rating={setlistRatings[String(activeSetlist.id)]} onClose={() => setActiveSetlistId(null)} onSave={(rating) => { void saveSetlistRating(activeSetlist, rating); setActiveSetlistId(null); }} />}
    {builder && <BuilderDialog catalogue={catalogue} setlist={builder} onClose={() => setBuilderId(null)} onPatch={patchBuilder} onPublish={() => { patchBuilder({ state: "published" }); setBuilderId(null); flash("Setlist veröffentlicht – jetzt darf bewertet werden"); }} />}
    {adminPiece && <AdminPieceDialog piece={adminPiece} onClose={() => setAdminEditId(null)} onSave={(patch) => { setPieceOverrides((current) => ({ ...current, [adminPiece.id]: { ...current[adminPiece.id], ...patch } })); if (supabase && remotePieceIds[adminPiece.id]) void supabase.from("pieces").update({ genres: patch.genres, solo_status: patch.soloStatus, solos: patch.solos, duration_seconds: patch.durationSeconds, grade: patch.grade, price_cents: patch.priceCents, owned: patch.owned, source: patch.source, note: patch.note, updated_at: new Date().toISOString() }).eq("id", remotePieceIds[adminPiece.id]); setAdminEditId(null); flash("Metadaten gespeichert"); }} />}
    {toast && <div className="toast"><Check /> {toast}</div>}
  </main>;
}

function LoginScreen({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const requestCode = async () => {
    setBusy(true); setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
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

  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><AppMark /><div><strong>Setlist-o-Mat</strong><span>Gemeinsam. Klingt besser.</span></div></div><div className="auth-art" aria-hidden="true"><Music2 /><span>♪</span><i>✦</i></div><div className="auth-copy"><span className="eyebrow"><Sparkles /> Jahreskonzert 2027</span><h1>{sent ? "Schau kurz ins Postfach." : "Reinhören. Bewerten. Programm bauen."}</h1><p>{sent ? `Wir haben einen Anmeldecode an ${email} geschickt.` : "Ohne Passwort: E-Mail eingeben, Code öffnen und schon bist du dabei."}</p>{!sent ? <form onSubmit={(event) => { event.preventDefault(); requestCode(); }}><label><span>E-Mail-Adresse</span><input autoComplete="email" inputMode="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@beispiel.de" /></label><button className="primary-button" disabled={busy || !email.trim()}>{busy ? "Wird gesendet …" : "Code per E-Mail senden"}<ChevronRight /></button></form> : <form onSubmit={(event) => { event.preventDefault(); verifyCode(); }}><label><span>Sechsstelliger Code</span><input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" /></label><button className="primary-button" disabled={busy || code.length !== 6}>{busy ? "Wird geprüft …" : "Einloggen"}<ChevronRight /></button><button type="button" className="text-button" onClick={() => { setSent(false); setCode(""); setMessage(null); }}>Andere E-Mail verwenden</button></form>}{message && <div className="auth-message"><CircleHelp />{message}</div>}<div className="auth-hint"><BadgeCheck /><span><strong>@musikverein-verl.de</strong> ist automatisch freigeschaltet. Andere Adressen müssen auf der Freigabeliste stehen – im Zweifel kurz per WhatsApp melden.</span></div></div></section></main>;
}

function PieceDialog({ piece, rating, onClose, onSave }: { piece: Piece; rating?: Rating; onClose: () => void; onSave: (rating: Rating) => void }) {
  const [stars, setStars] = useState<number | null>(rating?.stars ?? null);
  const [skipped, setSkipped] = useState(rating?.skipped ?? false);
  const [comment, setComment] = useState(rating?.comment ?? "");
  const average = 3.7 + ((piece.id * 7) % 12) / 10;
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog piece-dialog" role="dialog" aria-modal="true" aria-label={`${piece.title} bewerten`}><button className="dialog-close" onClick={onClose}><X /></button><div className="dialog-kicker"><Headphones /> Hörprobe & Bewertung</div><h2>{piece.title}</h2><p className="dialog-subtitle">{piece.composer}</p><div className="dialog-facts"><span><Clock3 /> {formatDuration(piece.durationSeconds)}</span><span>Grade {piece.grade}</span>{piece.genres.map((item) => <span className="genre-chip" key={item}>{item}</span>)}{piece.owned && <span className="owned-pill"><BadgeCheck /> Im Bestand</span>}</div>{piece.youtubeId ? <div className="youtube-wrap"><iframe src={`https://www.youtube-nocookie.com/embed/${piece.youtubeId}?rel=0`} title={`Hörprobe ${piece.title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div> : <div className="no-sample"><Headphones /><strong>Keine Hörprobe hinterlegt</strong><span>Du kannst das Stück trotzdem bewerten oder überspringen.</span></div>}<div className="rating-panel"><div className="rating-question"><span>Wie gut passt das Stück ins Konzert?</span><Stars value={skipped ? null : stars} onChange={(value) => { setSkipped(false); setStars(value); }} /></div><button className={skipped ? "skip-button active" : "skip-button"} onClick={() => { setSkipped(true); setStars(null); }}><CircleHelp /> Kann ich nicht beurteilen</button><label><span>Dein Kommentar <small>optional</small></span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Was spricht dafür oder dagegen? Soli, Wirkung, Besetzung …" /></label>{rating && <div className="group-peek"><div><Users /><span>Gruppe</span></div><strong>Ø {average.toFixed(1).replace(".", ",")}</strong><Stars value={Math.round(average)} small /><button>4 Kommentare lesen</button></div>}</div><div className="dialog-actions"><button className="text-button" onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={!stars && !skipped} onClick={() => onSave({ stars, skipped, comment })}><Check /> Bewertung speichern</button></div></section></div>;
}

function BuilderDialog({ catalogue, setlist, onClose, onPatch, onPublish }: { catalogue: Piece[]; setlist: Setlist; onClose: () => void; onPatch: (patch: Partial<Setlist>) => void; onPublish: () => void }) {
  const [query, setQuery] = useState("");
  const metrics = getMetrics(setlist.pieceIds, catalogue);
  const candidates = catalogue.filter((piece) => !setlist.pieceIds.includes(piece.id) && `${piece.title} ${piece.composer}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const move = (index: number, delta: number) => { const target = index + delta; if (target < 0 || target >= setlist.pieceIds.length) return; const next = [...setlist.pieceIds]; [next[index], next[target]] = [next[target], next[index]]; onPatch({ pieceIds: next }); };
  return <div className="dialog-backdrop builder-backdrop"><section className="dialog builder-dialog" role="dialog" aria-modal="true" aria-label="Setlist bearbeiten"><header className="builder-header"><div><span className="dialog-kicker"><Lock /> Privater Entwurf</span><input value={setlist.name} onChange={(event) => onPatch({ name: event.target.value })} aria-label="Name der Setlist" /></div><button className="dialog-close" onClick={onClose}><X /></button></header><div className="builder-layout"><div className="builder-main"><div className="builder-section-title"><div><h3>Programmfolge</h3><span>{setlist.pieceIds.length} Stücke · per Pfeil sortieren</span></div><button className="text-button" onClick={() => { const alternatives = artNames.filter((name) => name !== setlist.name); onPatch({ name: alternatives[Math.floor(Math.random() * alternatives.length)] }); }}><Shuffle /> Kunstname würfeln</button></div><div className="builder-items">{metrics.selected.length === 0 && <div className="empty-builder"><ListMusic /><strong>Deine Bühne ist noch leer.</strong><span>Füge unten die ersten Stücke hinzu.</span></div>}{metrics.selected.map((piece, index) => <div className="builder-item" key={piece.id}><span className="order-number">{index + 1}</span><div className="builder-item-copy"><strong>{piece.title}</strong><span>{piece.composer}</span><div><em>{formatDuration(piece.durationSeconds)}</em><em>Grade {piece.grade}</em>{piece.genres[0] && <em>{piece.genres[0]}</em>}</div></div><div className="reorder"><button onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp /></button><button onClick={() => move(index, 1)} disabled={index === metrics.selected.length - 1}><ArrowDown /></button></div><button className="remove-button" onClick={() => onPatch({ pieceIds: setlist.pieceIds.filter((id) => id !== piece.id) })}><Trash2 /></button></div>)}</div><div className="add-pieces"><h3>Stück hinzufügen</h3><label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titel suchen" /></label><div className="candidate-list">{candidates.map((piece) => <button key={piece.id} onClick={() => onPatch({ pieceIds: [...setlist.pieceIds, piece.id] })}><Plus /><div><strong>{piece.title}</strong><span>{piece.composer}</span></div><em>{formatDuration(piece.durationSeconds)}</em></button>)}</div></div></div><aside className="builder-summary"><span className="eyebrow">Live-Check</span><h3>Passt das Programm?</h3><TimeSignal duration={metrics.duration} /><div className="summary-stat"><span><Clock3 /> Dauer</span><strong>{formatDuration(metrics.duration)}</strong></div><div className="summary-stat"><span><BarChart3 /> Schwierigkeit</span><strong>{metrics.minGrade || "–"}–{metrics.maxGrade || "–"}</strong><small>Ø {metrics.avgGrade ? metrics.avgGrade.toFixed(1).replace(".", ",") : "–"}</small></div><div className="summary-stat"><span><Euro /> Noch zu kaufen</span><strong>{formatMoney(metrics.cost)}</strong></div><div className="summary-genres"><span>Genre-Mix</span><div>{metrics.genres.length ? metrics.genres.map((item) => <em key={item}>{item}</em>) : <small>Noch keine Stücke gewählt</small>}</div></div><button className="primary-button publish-button" disabled={setlist.pieceIds.length === 0} onClick={onPublish}><Sparkles /> Setlist veröffentlichen</button><small className="publish-note">Danach ist die Zusammenstellung gesperrt. Varianten bleiben jederzeit möglich.</small></aside></div></section></div>;
}

function SetlistDialog({ catalogue, setlist, rating, onClose, onSave }: { catalogue: Piece[]; setlist: Setlist; rating?: SetlistRating; onClose: () => void; onSave: (rating: SetlistRating) => void }) {
  const [stars, setStars] = useState<number | null>(rating?.stars ?? null);
  const [comment, setComment] = useState(rating?.comment ?? "");
  const metrics = getMetrics(setlist.pieceIds, catalogue);
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog setlist-dialog" role="dialog" aria-modal="true" aria-label={`${setlist.name} bewerten`}><button className="dialog-close" onClick={onClose}><X /></button><span className="dialog-kicker"><ListMusic /> Setlist bewerten</span><h2>{setlist.name}</h2><p className="dialog-subtitle">von {setlist.owner} · {setlist.pieceIds.length} Stücke</p><TimeSignal duration={metrics.duration} /><div className="setlist-dialog-metrics"><span><BarChart3 /> Grade {metrics.minGrade}–{metrics.maxGrade} · Ø {metrics.avgGrade.toFixed(1).replace(".", ",")}</span><span><Euro /> {formatMoney(metrics.cost)} zu kaufen</span></div><ol className="setlist-dialog-pieces">{metrics.selected.map((piece) => <li key={piece.id}><div><strong>{piece.title}</strong><span>{piece.composer}</span></div><small>{formatDuration(piece.durationSeconds)}</small></li>)}</ol><div className="rating-panel"><div className="rating-question"><span>Wie gut funktioniert diese Reihenfolge?</span><Stars value={stars} onChange={setStars} /></div><label><span>Dein Kommentar <small>optional und später änderbar</small></span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Dramaturgie, Dauer, Genre-Mix, Soli …" /></label></div><div className="dialog-actions"><button className="text-button" onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={!stars} onClick={() => stars && onSave({ stars, comment })}><Check /> Bewertung speichern</button></div></section></div>;
}

function AdminPieceDialog({ piece, onClose, onSave }: { piece: Piece; onClose: () => void; onSave: (patch: AdminPiecePatch) => void }) {
  const [genreText, setGenreText] = useState(piece.genres.join(", "));
  const [soloStatus, setSoloStatus] = useState<Piece["soloStatus"]>(piece.soloStatus);
  const [solos, setSolos] = useState(piece.solos ?? "");
  const [duration, setDuration] = useState(formatDuration(piece.durationSeconds));
  const [grade, setGrade] = useState(String(piece.grade));
  const [price, setPrice] = useState((piece.priceCents / 100).toFixed(2).replace(".", ","));
  const [owned, setOwned] = useState(piece.owned);
  const [source, setSource] = useState(piece.source);
  const [note, setNote] = useState(piece.note ?? "");
  const save = () => {
    const [minutes, seconds = "0"] = duration.split(":");
    onSave({
      genres: genreText.split(",").map((item) => item.trim()).filter(Boolean),
      soloStatus, solos: solos.trim() || null,
      durationSeconds: Math.max(1, Number(minutes) * 60 + Number(seconds)),
      grade: Number(grade), priceCents: Math.max(0, Math.round(Number(price.replace(",", ".")) * 100)),
      owned, source: source.trim(), note: note.trim() || null,
    });
  };
  return <div className="dialog-backdrop"><section className="dialog admin-dialog"><button className="dialog-close" onClick={onClose}><X /></button><span className="dialog-kicker"><Pencil /> Metadaten bearbeiten</span><h2>{piece.title}</h2><p className="dialog-subtitle">{piece.composer}</p><div className="form-grid"><label><span>Genre</span><input value={genreText} onChange={(event) => setGenreText(event.target.value)} placeholder="z. B. Film, Rock/Pop" /></label><label><span>Soli-Status</span><select value={soloStatus} onChange={(event) => setSoloStatus(event.target.value as Piece["soloStatus"])}><option value="unknown">Noch unbekannt</option><option value="none">Keine Soli</option><option value="available">Soli vorhanden</option></select></label><label className="full"><span>Instrumente / Hinweise zu Soli</span><input value={solos} onChange={(event) => setSolos(event.target.value)} placeholder="z. B. Altsaxophon, Oboe, Posaune …" /></label><label><span>Dauer (mm:ss)</span><input value={duration} onChange={(event) => setDuration(event.target.value)} /></label><label><span>Grade</span><input type="number" step="0.5" value={grade} onChange={(event) => setGrade(event.target.value)} /></label><label><span>Preis in Euro</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label className="check-label"><input type="checkbox" checked={owned} onChange={(event) => setOwned(event.target.checked)} /><span>Bereits im Bestand</span></label><label className="full"><span>Quelle</span><input value={source} onChange={(event) => setSource(event.target.value)} /></label><label className="full"><span>Kommentar / Medley-Stücke</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label></div><div className="dialog-actions"><button className="text-button" onClick={onClose}>Abbrechen</button><button className="primary-button" onClick={save}><Check /> Speichern</button></div></section></div>;
}
