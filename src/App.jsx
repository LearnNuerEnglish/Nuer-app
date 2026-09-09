import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BookOpen,
  Search,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Loader2,
  Home as HomeIcon,
} from "lucide-react";

/* ---------------------------------------------------------------------
   Canonical book order — used to sort whatever distinct book names come
   back from the table, since the schema has no explicit ordering column.
--------------------------------------------------------------------- */
const CANONICAL_BOOKS = [
  "Tuk", "Ɣöth", "Liib", "Kuen", "Ŋuɔ̱t", "Jɔc", "Ruëëc", "Ruth",
  "1 Tham", "2 Tham", "1 Kua̱r", "2 Kua̱r", "1 Kuɛ̈n", "2 Kuɛ̈n",
  "Ɛdh", "Nɛm", "Ɛth", "I-Yob", "Diit", "Pɛl", "Ŋi̱i̱c", "Thɔl",
  "I-ca-yaa", "Yir", "Jiɛth", "Yɛdh", "Dan", "Ɣocä", "Yo-el",
  "A-mɔth", "Obad", "Jona", "Mikaa", "Nɛ̈m", "Ɣäb", "Dhɛp",
  "Ɣag", "Dhɛk", "Mɛ̈l", "Mɛ̈t", "Mak", "Luk", "Jɔ̱ɔ̱n", "Lät",
  "Röm", "1 Kor", "2 Kor", "Gäl", "Ɛpɛ", "Pil", "Kol", "1 Thɛ",
  "2 Thɛ", "1 Tim", "2 Tim", "Tay", "Pay", "Ɣib", "Jem", "1 Pit",
  "2 Pit", "1 Jɔ̱ɔ̱n", "2 Jɔ̱ɔ̱n", "3 Jɔ̱ɔ̱n", "Juud", "Nyuuth",
];

function orderBooks(list) {
  const rank = new Map(CANONICAL_BOOKS.map((b, i) => [b.toLowerCase(), i]));
  return [...list].sort((a, b) => {
    const ra = rank.has(a.toLowerCase()) ? rank.get(a.toLowerCase()) : 999;
    const rb = rank.has(b.toLowerCase()) ? rank.get(b.toLowerCase()) : 999;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

/* ---------------------------------------------------------------------
   Component
--------------------------------------------------------------------- */
export default function BibleApp() {
  const [config, setConfig] = useState({ url: "", key: "" });
  const [draftConfig, setDraftConfig] = useState({ url: "", key: "" });
  const [configured, setConfigured] = useState(false);
  const [view, setView] = useState("settings"); // settings | home | reader | search
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [books, setBooks] = useState([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState(null);

  const [expandedBook, setExpandedBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);

  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [verses, setVerses] = useState([]);
  const [versesLoading, setVersesLoading] = useState(false);
  const [versesError, setVersesError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [dailyVerse, setDailyVerse] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState(null);

  const scrollRef = useRef(null);

  const sbHeaders = useMemo(
    () => ({ apikey: config.key, Authorization: `Bearer ${config.key}` }),
    [config.key]
  );

  const sbGet = useCallback(
    async (path, extraHeaders = {}) => {
      const res = await fetch(`${config.url.replace(/\/$/, "")}/rest/v1/${path}`, {
        headers: { ...sbHeaders, ...extraHeaders },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Request failed (${res.status}). ${body || res.statusText}`);
      }
      return res;
    },
    [config.url, sbHeaders]
  );

  /* ---- load distinct books once configured ---- */
  useEffect(() => {
    if (!configured) return;
    setBooksLoading(true);
    setBooksError(null);
    sbGet("bible?select=book")
      .then((r) => r.json())
      .then((rows) => {
        const unique = Array.from(new Set(rows.map((r) => r.book).filter(Boolean)));
        setBooks(orderBooks(unique));
      })
      .catch((err) => setBooksError(err.message))
      .finally(() => setBooksLoading(false));
  }, [configured, sbGet]);

  /* ---- daily verse: deterministic pick for today's date ---- */
  useEffect(() => {
    if (!configured) return;
    setDailyLoading(true);
    setDailyError(null);
    sbGet("bible?select=book&limit=1", { Prefer: "count=exact", Range: "0-0" })
      .then(async (r) => {
        const range = r.headers.get("content-range");
        const total = range && range.includes("/") ? parseInt(range.split("/")[1], 10) : null;
        if (!total) throw new Error("Could not determine the number of verses in the table.");
        const day = new Date().toISOString().slice(0, 10);
        let seed = 0;
        for (let i = 0; i < day.length; i++) seed = (seed * 31 + day.charCodeAt(i)) >>> 0;
        const offset = seed % total;
        const r2 = await sbGet(`bible?select=*&limit=1&offset=${offset}`);
        const rows = await r2.json();
        setDailyVerse(rows[0] || null);
      })
      .catch((err) => setDailyError(err.message))
      .finally(() => setDailyLoading(false));
  }, [configured, sbGet]);

  const toggleBook = useCallback(
    (book) => {
      if (expandedBook === book) {
        setExpandedBook(null);
        return;
      }
      setExpandedBook(book);
      setChapters([]);
      setChaptersLoading(true);
      sbGet(`bible?book=eq.${encodeURIComponent(book)}&select=chapter`)
        .then((r) => r.json())
        .then((rows) => {
          const unique = Array.from(new Set(rows.map((r) => r.chapter))).sort((a, b) => a - b);
          setChapters(unique);
        })
        .catch((err) => setBooksError(err.message))
        .finally(() => setChaptersLoading(false));
    },
    [expandedBook, sbGet]
  );

  const openChapter = useCallback(
    (book, chapter) => {
      setSelectedBook(book);
      setSelectedChapter(chapter);
      setView("reader");
      setSidebarOpen(false);
      setVersesLoading(true);
      setVersesError(null);
      sbGet(
        `bible?book=eq.${encodeURIComponent(book)}&chapter=eq.${chapter}&select=*&order=verse.asc`
      )
        .then((r) => r.json())
        .then(setVerses)
        .catch((err) => setVersesError(err.message))
        .finally(() => setVersesLoading(false));
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    },
    [sbGet]
  );

  const stepChapter = useCallback(
    (delta) => {
      const idx = chapters.indexOf(selectedChapter);
      const nextIdx = idx + delta;
      if (idx !== -1 && nextIdx >= 0 && nextIdx < chapters.length) {
        openChapter(selectedBook, chapters[nextIdx]);
      }
    },
    [chapters, selectedChapter, selectedBook, openChapter]
  );

  const runSearch = useCallback(
    (q) => {
      if (!q.trim()) {
        setSearchResults([]);
        setHasSearched(false);
        return;
      }
      setSearchLoading(true);
      setSearchError(null);
      setHasSearched(true);
      sbGet(
        `bible?text=ilike.*${encodeURIComponent(q.trim())}*&select=*&order=book.asc,chapter.asc,verse.asc&limit=40`
      )
        .then((r) => r.json())
        .then(setSearchResults)
        .catch((err) => setSearchError(err.message))
        .finally(() => setSearchLoading(false));
    },
    [sbGet]
  );

  useEffect(() => {
    if (view !== "search") return;
    const t = setTimeout(() => runSearch(searchQuery), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, view]);

  const handleConnect = (e) => {
    e.preventDefault();
    if (!draftConfig.url.trim() || !draftConfig.key.trim()) return;
    setConfig({ url: draftConfig.url.trim(), key: draftConfig.key.trim() });
    setConfigured(true);
    setView("home");
  };

  /* ---------------------------------------------------------------- */

  return (
    <div className="bh-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap');

        .bh-shell {
          --ink: #1C1A16;
          --ink-panel: #24211B;
          --ink-line: #37332A;
          --ash: #C9C0AE;
          --ash-dim: #8A8172;
          --parchment: #F2EADB;
          --parchment-line: #DBCCA6;
          --ink-text: #2B2418;
          --ink-text-dim: #6B6151;
          --oxide: #9C3B2A;
          --brass: #B08337;
          font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif;
          background: var(--ink);
          color: var(--ash);
          min-height: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        .bh-display {
          font-family: 'Fraunces', Georgia, serif;
        }
        .bh-scrollbar::-webkit-scrollbar { width: 8px; }
        .bh-scrollbar::-webkit-scrollbar-thumb { background: var(--ink-line); border-radius: 4px; }
        .bh-scrollbar::-webkit-scrollbar-track { background: transparent; }

        @keyframes bh-fade-slide {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .bh-verse-enter { animation: bh-fade-slide 0.32s ease-out; }

        @media (prefers-reduced-motion: reduce) {
          .bh-verse-enter { animation: none; }
        }

        .bh-focusable:focus-visible {
          outline: 2px solid var(--brass);
          outline-offset: 2px;
        }
      `}</style>

      {view === "settings" && (
        <SettingsScreen
          draftConfig={draftConfig}
          setDraftConfig={setDraftConfig}
          onSubmit={handleConnect}
          canSkip={configured}
          onCancel={() => setView("home")}
        />
      )}

      {view !== "settings" && (
        <>
          <Header
            onMenu={() => setSidebarOpen((s) => !s)}
            onHome={() => setView("home")}
            onSearch={() => setView("search")}
            onSettings={() => {
              setDraftConfig(config);
              setView("settings");
            }}
            active={view}
          />

          <div className="flex flex-1 min-h-0 relative">
            <Sidebar
              open={sidebarOpen}
              books={books}
              booksLoading={booksLoading}
              booksError={booksError}
              expandedBook={expandedBook}
              chapters={chapters}
              chaptersLoading={chaptersLoading}
              selectedBook={selectedBook}
              selectedChapter={selectedChapter}
              onToggleBook={toggleBook}
              onSelectChapter={openChapter}
              onClose={() => setSidebarOpen(false)}
            />

            <main
              ref={scrollRef}
              className="flex-1 min-w-0 overflow-y-auto bh-scrollbar"
              style={{ background: "var(--parchment)" }}
            >
              {view === "home" && (
                <HomeView
                  dailyVerse={dailyVerse}
                  dailyLoading={dailyLoading}
                  dailyError={dailyError}
                  onBrowse={() => setSidebarOpen(true)}
                  onSearch={() => setView("search")}
                  onOpenDaily={() => {
                    if (dailyVerse) openChapter(dailyVerse.book, dailyVerse.chapter);
                  }}
                />
              )}

              {view === "reader" && (
                <ReaderView
                  book={selectedBook}
                  chapter={selectedChapter}
                  verses={verses}
                  loading={versesLoading}
                  error={versesError}
                  onPrev={() => stepChapter(-1)}
                  onNext={() => stepChapter(1)}
                  canPrev={chapters.indexOf(selectedChapter) > 0}
                  canNext={
                    chapters.indexOf(selectedChapter) !== -1 &&
                    chapters.indexOf(selectedChapter) < chapters.length - 1
                  }
                />
              )}

              {view === "search" && (
                <SearchView
                  query={searchQuery}
                  setQuery={setSearchQuery}
                  results={searchResults}
                  loading={searchLoading}
                  error={searchError}
                  hasSearched={hasSearched}
                  onOpenResult={(row) => openChapter(row.book, row.chapter)}
                />
              )}
            </main>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   Settings
--------------------------------------------------------------------- */
function SettingsScreen({ draftConfig, setDraftConfig, onSubmit, canSkip, onCancel }) {
  return (
    <div
      className="flex-1 flex items-center justify-center p-6"
      style={{ background: "var(--ink)" }}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-sm p-8"
        style={{ background: "var(--ink-panel)", border: "1px solid var(--ink-line)" }}
      >
        <h1 className="bh-display text-2xl mb-1" style={{ color: "var(--parchment)" }}>
          Connect your Bible table
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--ash-dim)" }}>
          Enter your Supabase project URL and anon key. They're kept only in this session
          and are never saved.
        </p>

        <label className="block text-sm mb-1" style={{ color: "var(--ash)" }}>
          Project URL
        </label>
        <input
          type="text"
          required
          placeholder="https://your-project.supabase.co"
          value={draftConfig.url}
          onChange={(e) => setDraftConfig((c) => ({ ...c, url: e.target.value }))}
          className="bh-focusable w-full mb-4 px-3 py-2 rounded-sm text-sm"
          style={{
            background: "var(--ink)",
            border: "1px solid var(--ink-line)",
            color: "var(--parchment)",
          }}
        />

        <label className="block text-sm mb-1" style={{ color: "var(--ash)" }}>
          Anon (public) key
        </label>
        <input
          type="password"
          required
          placeholder="eyJhbGciOi..."
          value={draftConfig.key}
          onChange={(e) => setDraftConfig((c) => ({ ...c, key: e.target.value }))}
          className="bh-focusable w-full mb-6 px-3 py-2 rounded-sm text-sm"
          style={{
            background: "var(--ink)",
            border: "1px solid var(--ink-line)",
            color: "var(--parchment)",
          }}
        />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="bh-focusable px-4 py-2 rounded-sm text-sm bh-display"
            style={{ background: "var(--oxide)", color: "var(--parchment)" }}
          >
            Connect
          </button>
          {canSkip && (
            <button
              type="button"
              onClick={onCancel}
              className="bh-focusable text-sm"
              style={{ color: "var(--ash-dim)" }}
            >
              Cancel
            </button>
          )}
        </div>

        <p className="text-xs mt-6" style={{ color: "var(--ash-dim)" }}>
          Table expected: <code>bible</code> with columns book, chapter, verse, heading,
          text, reference. Row Level Security must allow read access for the anon key.
        </p>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------
   Header
--------------------------------------------------------------------- */
function Header({ onMenu, onHome, onSearch, onSettings, active }) {
  return (
    <header
      className="flex items-center justify-between px-4 py-3 shrink-0"
      style={{ background: "var(--ink-panel)", borderBottom: "1px solid var(--ink-line)" }}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={onMenu}
          className="bh-focusable p-2 rounded-sm md:hidden"
          style={{ color: "var(--ash)" }}
          aria-label="Toggle book navigation"
        >
          <Menu size={20} />
        </button>
        <button onClick={onHome} className="bh-focusable flex items-center gap-2">
          <BookOpen size={18} style={{ color: "var(--brass)" }} />
          <span className="bh-display text-lg" style={{ color: "var(--parchment)" }}>
            Scripture
          </span>
        </button>
      </div>
      <nav className="flex items-center gap-1">
        <HeaderIcon icon={HomeIcon} label="Home" onClick={onHome} activeState={active === "home"} />
        <HeaderIcon icon={Search} label="Search" onClick={onSearch} activeState={active === "search"} />
        <HeaderIcon icon={Settings2} label="Settings" onClick={onSettings} activeState={false} />
      </nav>
    </header>
  );
}

function HeaderIcon({ icon: Icon, label, onClick, activeState }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="bh-focusable p-2 rounded-sm"
      style={{ color: activeState ? "var(--brass)" : "var(--ash-dim)" }}
    >
      <Icon size={18} />
    </button>
  );
}

/* ---------------------------------------------------------------------
   Sidebar — book & chapter navigation
--------------------------------------------------------------------- */
function Sidebar({
  open,
  books,
  booksLoading,
  booksError,
  expandedBook,
  chapters,
  chaptersLoading,
  selectedBook,
  selectedChapter,
  onToggleBook,
  onSelectChapter,
  onClose,
}) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-10 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`bh-scrollbar overflow-y-auto shrink-0 w-72 z-20 transition-transform duration-200 md:translate-x-0 md:static fixed top-0 left-0 h-full md:h-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--ink-panel)", borderRight: "1px solid var(--ink-line)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 md:hidden">
          <span className="bh-display text-sm" style={{ color: "var(--ash)" }}>
            Books
          </span>
          <button onClick={onClose} className="bh-focusable p-1" style={{ color: "var(--ash)" }}>
            <X size={18} />
          </button>
        </div>

        {booksLoading && <SidebarMessage>Loading books…</SidebarMessage>}
        {booksError && <SidebarMessage error>{booksError}</SidebarMessage>}
        {!booksLoading && !booksError && books.length === 0 && (
          <SidebarMessage>No books found in the table yet.</SidebarMessage>
        )}

        <ul className="pb-6">
          {books.map((book) => (
            <li key={book}>
              <button
                onClick={() => onToggleBook(book)}
                className="bh-focusable w-full text-left px-4 py-2 text-sm flex items-center justify-between"
                style={{
                  color: book === selectedBook ? "var(--brass)" : "var(--ash)",
                }}
              >
                <span>{book}</span>
                <span style={{ color: "var(--ash-dim)" }}>
                  {expandedBook === book ? "–" : "+"}
                </span>
              </button>
              {expandedBook === book && (
                <div className="px-4 pb-3">
                  {chaptersLoading ? (
                    <p className="text-xs" style={{ color: "var(--ash-dim)" }}>
                      Loading chapters…
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {chapters.map((ch) => {
                        const isActive = book === selectedBook && ch === selectedChapter;
                        return (
                          <button
                            key={ch}
                            onClick={() => onSelectChapter(book, ch)}
                            className="bh-focusable w-9 h-9 text-xs rounded-sm"
                            style={{
                              background: isActive ? "var(--oxide)" : "transparent",
                              border: `1px solid ${isActive ? "var(--oxide)" : "var(--ink-line)"}`,
                              color: isActive ? "var(--parchment)" : "var(--ash)",
                            }}
                          >
                            {ch}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}

function SidebarMessage({ children, error }) {
  return (
    <p
      className="px-4 py-3 text-sm flex items-center gap-2"
      style={{ color: error ? "var(--oxide)" : "var(--ash-dim)" }}
    >
      {!error && <Loader2 size={14} className="animate-spin" />}
      {children}
    </p>
  );
}

/* ---------------------------------------------------------------------
   Home
--------------------------------------------------------------------- */
function HomeView({ dailyVerse, dailyLoading, dailyError, onBrowse, onSearch, onOpenDaily }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <p className="bh-display text-sm mb-2" style={{ color: "var(--ink-text-dim)" }}>
        Today's reading
      </p>

      {dailyLoading && (
        <p className="text-sm flex items-center gap-2" style={{ color: "var(--ink-text-dim)" }}>
          <Loader2 size={14} className="animate-spin" /> Finding a verse…
        </p>
      )}

      {dailyError && (
        <p className="text-sm" style={{ color: "var(--oxide)" }}>
          Couldn't load today's verse — {dailyError} Check your connection settings and
          that the table allows public reads.
        </p>
      )}

      {dailyVerse && (
        <button onClick={onOpenDaily} className="bh-focusable text-left block group">
          <div style={{ borderTop: "2px solid var(--oxide)", paddingTop: "1rem" }}>
            {dailyVerse.heading && (
              <p
                className="bh-display text-base mb-2"
                style={{ color: "var(--oxide)" }}
              >
                {dailyVerse.heading}
              </p>
            )}
            <p
              className="text-2xl leading-relaxed mb-3"
              style={{ color: "var(--ink-text)" }}
            >
              {dailyVerse.text}
            </p>
            <p className="text-sm" style={{ color: "var(--ink-text-dim)" }}>
              {dailyVerse.reference || `${dailyVerse.book} ${dailyVerse.chapter}:${dailyVerse.verse}`}
            </p>
          </div>
        </button>
      )}

      <div className="flex gap-3 mt-12">
        <button
          onClick={onBrowse}
          className="bh-focusable px-4 py-2 text-sm rounded-sm bh-display md:hidden"
          style={{ background: "var(--ink)", color: "var(--parchment)" }}
        >
          Browse books
        </button>
        <button
          onClick={onSearch}
          className="bh-focusable px-4 py-2 text-sm rounded-sm bh-display"
          style={{ border: "1px solid var(--parchment-line)", color: "var(--ink-text)" }}
        >
          Search scripture
        </button>
      </div>

      <p className="hidden md:block text-sm mt-6" style={{ color: "var(--ink-text-dim)" }}>
        Pick a book from the left to start reading.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------
   Reader
--------------------------------------------------------------------- */
function ReaderView({ book, chapter, verses, loading, error, onPrev, onNext, canPrev, canNext }) {
  if (!book) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <p style={{ color: "var(--ink-text-dim)" }}>
          Choose a book and chapter from the navigation to begin reading.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="bh-display text-3xl" style={{ color: "var(--ink-text)" }}>
          {book} {chapter}
        </h1>
        <div className="flex gap-1">
          <button
            onClick={onPrev}
            disabled={!canPrev}
            className="bh-focusable p-2 rounded-sm disabled:opacity-30"
            style={{ color: "var(--ink-text)" }}
            aria-label="Previous chapter"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onNext}
            disabled={!canNext}
            className="bh-focusable p-2 rounded-sm disabled:opacity-30"
            style={{ color: "var(--ink-text)" }}
            aria-label="Next chapter"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-sm flex items-center gap-2" style={{ color: "var(--ink-text-dim)" }}>
          <Loader2 size={14} className="animate-spin" /> Loading chapter…
        </p>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--oxide)" }}>
          Couldn't load this chapter — {error}
        </p>
      )}

      {!loading && !error && verses.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-text-dim)" }}>
          No verses found for this chapter.
        </p>
      )}

      {!loading && verses.length > 0 && (
        <div key={`${book}-${chapter}`} className="bh-verse-enter">
          {groupByHeading(verses).map((group, i) => (
            <div key={i} className="mb-6">
              {group.heading && (
                <p className="bh-display text-lg mb-2" style={{ color: "var(--oxide)" }}>
                  {group.heading}
                </p>
              )}
              <p className="text-lg leading-loose" style={{ color: "var(--ink-text)" }}>
                {group.items.map((v) => (
                  <span key={v.verse}>
                    <sup
                      className="mr-1 select-none"
                      style={{ color: "var(--brass)", fontSize: "0.7em" }}
                    >
                      {v.verse}
                    </sup>
                    {v.text}{" "}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between mt-10 pt-6" style={{ borderTop: "1px solid var(--parchment-line)" }}>
        <button
          onClick={onPrev}
          disabled={!canPrev}
          className="bh-focusable text-sm disabled:opacity-30 flex items-center gap-1"
          style={{ color: "var(--ink-text)" }}
        >
          <ChevronLeft size={14} /> Previous chapter
        </button>
        <button
          onClick={onNext}
          disabled={!canNext}
          className="bh-focusable text-sm disabled:opacity-30 flex items-center gap-1"
          style={{ color: "var(--ink-text)" }}
        >
          Next chapter <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function groupByHeading(verses) {
  const groups = [];
  let current = null;
  for (const v of verses) {
    if (v.heading || !current) {
      current = { heading: v.heading || null, items: [] };
      groups.push(current);
    }
    current.items.push(v);
  }
  return groups;
}

/* ---------------------------------------------------------------------
   Search
--------------------------------------------------------------------- */
function SearchView({ query, setQuery, results, loading, error, hasSearched, onOpenResult }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="relative mb-8">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--ink-text-dim)" }}
        />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a word or phrase…"
          className="bh-focusable w-full pl-9 pr-3 py-2.5 text-sm rounded-sm"
          style={{
            background: "transparent",
            border: "1px solid var(--parchment-line)",
            color: "var(--ink-text)",
          }}
        />
      </div>

      {loading && (
        <p className="text-sm flex items-center gap-2" style={{ color: "var(--ink-text-dim)" }}>
          <Loader2 size={14} className="animate-spin" /> Searching…
        </p>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--oxide)" }}>
          Search failed — {error}
        </p>
      )}

      {!loading && hasSearched && !error && results.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-text-dim)" }}>
          No verses matched "{query}".
        </p>
      )}

      <ul>
        {results.map((row, i) => (
          <li key={`${row.book}-${row.chapter}-${row.verse}`}>
            <button
              onClick={() => onOpenResult(row)}
              className="bh-focusable text-left block w-full py-4"
              style={{
                borderTop: i === 0 ? "none" : "1px solid var(--parchment-line)",
              }}
            >
              <p className="text-sm mb-1 bh-display" style={{ color: "var(--brass)" }}>
                {row.reference || `${row.book} ${row.chapter}:${row.verse}`}
              </p>
              <p className="text-base leading-relaxed" style={{ color: "var(--ink-text)" }}>
                {row.text}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
