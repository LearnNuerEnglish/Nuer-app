import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import {
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Loader2,
  Home as HomeIcon,
} from "lucide-react";

/* ---------------------------------------------------------------------
   Supabase connection — filled in automatically, no setup screen.
--------------------------------------------------------------------- */
const SUPABASE_URL = "https://tmuorrjahwzequjldism.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtdW9ycmphaHd6ZXF1amxkaXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NjUxODMsImV4cCI6MjEwNDU0MTE4M30._ihRsxLv2xinM5p2jlA9Y0Nz586tbhq-dJ7-N6AHJ2k";

const SB_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

async function sbGet(path, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...SB_HEADERS, ...extraHeaders },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}). ${body || res.statusText}`);
  }
  return res;
}

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

function keyOf(book, chapter) {
  return `${book}::${chapter}`;
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
   Component
--------------------------------------------------------------------- */
export default function BibleApp() {
  const [view, setView] = useState("home"); // home | reader | search
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [books, setBooks] = useState([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState(null);
  const booksRef = useRef([]);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  const [expandedBook, setExpandedBook] = useState(null);
  const [sidebarChapters, setSidebarChapters] = useState([]);
  const [sidebarChaptersLoading, setSidebarChaptersLoading] = useState(false);

  const [dailyVerse, setDailyVerse] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  /* ---- continuous reading engine ---- */
  const [sequenceKeys, setSequenceKeys] = useState([]); // ordered "Book::chapter" list
  const [chapterStore, setChapterStore] = useState({}); // key -> {book,chapter,verses,status,error}
  const [activeKey, setActiveKey] = useState(null);
  const [hasMoreNext, setHasMoreNext] = useState(true);
  const [hasMorePrev, setHasMorePrev] = useState(true);

  const chaptersByBookRef = useRef({});
  const sequenceKeysRef = useRef([]);
  useEffect(() => {
    sequenceKeysRef.current = sequenceKeys;
  }, [sequenceKeys]);
  const chapterStoreRef = useRef({});
  useEffect(() => {
    chapterStoreRef.current = chapterStore;
  }, [chapterStore]);
  const loadingNextRef = useRef(false);
  const loadingPrevRef = useRef(false);
  const hasMoreNextRef = useRef(true);
  const hasMorePrevRef = useRef(true);
  useEffect(() => {
    hasMoreNextRef.current = hasMoreNext;
  }, [hasMoreNext]);
  useEffect(() => {
    hasMorePrevRef.current = hasMorePrev;
  }, [hasMorePrev]);

  const scrollRef = useRef(null);
  const topSentinelRef = useRef(null);
  const bottomSentinelRef = useRef(null);
  const pendingPrependRef = useRef(false);

  /* ---- load distinct books on mount ---- */
  useEffect(() => {
    setBooksLoading(true);
    sbGet("bible?select=book")
      .then((r) => r.json())
      .then((rows) => {
        const unique = Array.from(new Set(rows.map((r) => r.book).filter(Boolean)));
        setBooks(orderBooks(unique));
      })
      .catch((err) => setBooksError(err.message))
      .finally(() => setBooksLoading(false));
  }, []);

  /* ---- daily verse: deterministic pick for today's date ---- */
  useEffect(() => {
    setDailyLoading(true);
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
  }, []);

  const loadChaptersFor = useCallback(async (book) => {
    if (chaptersByBookRef.current[book]) return chaptersByBookRef.current[book];
    const r = await sbGet(`bible?book=eq.${encodeURIComponent(book)}&select=chapter`);
    const rows = await r.json();
    const unique = Array.from(new Set(rows.map((x) => x.chapter))).sort((a, b) => a - b);
    chaptersByBookRef.current[book] = unique;
    return unique;
  }, []);

  const loadVersesFor = useCallback(async (book, chapter) => {
    const r = await sbGet(
      `bible?book=eq.${encodeURIComponent(book)}&chapter=eq.${chapter}&select=*&order=verse.asc`
    );
    return r.json();
  }, []);

  /* sidebar book expand — reuses the shared chapter cache */
  const toggleBook = useCallback(
    (book) => {
      if (expandedBook === book) {
        setExpandedBook(null);
        return;
      }
      setExpandedBook(book);
      setSidebarChapters([]);
      setSidebarChaptersLoading(true);
      loadChaptersFor(book)
        .then(setSidebarChapters)
        .catch((err) => setBooksError(err.message))
        .finally(() => setSidebarChaptersLoading(false));
    },
    [expandedBook, loadChaptersFor]
  );

  /* jump to a specific book/chapter: reset the continuous sequence around it */
  const jumpTo = useCallback(
    async (book, chapter) => {
      setView("reader");
      setSidebarOpen(false);
      const key = keyOf(book, chapter);
      setChapterStore((s) => ({ ...s, [key]: { book, chapter, verses: null, status: "loading" } }));
      setSequenceKeys([key]);
      setActiveKey(key);
      setHasMoreNext(true);
      setHasMorePrev(true);

      try {
        await loadChaptersFor(book);
        const verses = await loadVersesFor(book, chapter);
        setChapterStore((s) => ({ ...s, [key]: { book, chapter, verses, status: "ready" } }));
      } catch (err) {
        setChapterStore((s) => ({
          ...s,
          [key]: { book, chapter, verses: [], status: "error", error: err.message },
        }));
      }
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    },
    [loadChaptersFor, loadVersesFor]
  );

  /* find the chapter after/before {book,chapter}, crossing book
     boundaries as needed. Returns null at the edges of the collection. */
  const computeNeighbor = useCallback(
    async (book, chapter, direction) => {
      let chList = chaptersByBookRef.current[book] || (await loadChaptersFor(book));
      let idx = chList.indexOf(chapter);
      if (direction === 1 && idx !== -1 && idx < chList.length - 1) {
        return { book, chapter: chList[idx + 1] };
      }
      if (direction === -1 && idx > 0) {
        return { book, chapter: chList[idx - 1] };
      }
      const list = booksRef.current;
      let bIdx = list.indexOf(book);
      if (bIdx === -1) return null;
      let guard = 0;
      while (guard < list.length) {
        bIdx += direction;
        guard += 1;
        if (bIdx < 0 || bIdx >= list.length) return null;
        const candidate = list[bIdx];
        const chs = await loadChaptersFor(candidate);
        if (chs && chs.length > 0) {
          return { book: candidate, chapter: direction === 1 ? chs[0] : chs[chs.length - 1] };
        }
      }
      return null;
    },
    [loadChaptersFor]
  );

  const appendNext = useCallback(async () => {
    if (loadingNextRef.current || !hasMoreNextRef.current) return;
    const keys = sequenceKeysRef.current;
    if (keys.length === 0) return;
    loadingNextRef.current = true;
    const last = chapterStoreRef.current[keys[keys.length - 1]];
    try {
      const next = await computeNeighbor(last.book, last.chapter, 1);
      if (!next) {
        setHasMoreNext(false);
        return;
      }
      const key = keyOf(next.book, next.chapter);
      setChapterStore((s) => ({
        ...s,
        [key]: { book: next.book, chapter: next.chapter, verses: null, status: "loading" },
      }));
      setSequenceKeys((s) => [...s, key]);
      const verses = await loadVersesFor(next.book, next.chapter);
      setChapterStore((s) => ({
        ...s,
        [key]: { book: next.book, chapter: next.chapter, verses, status: "ready" },
      }));
    } catch (err) {
      setHasMoreNext(false);
    } finally {
      loadingNextRef.current = false;
    }
  }, [computeNeighbor, loadVersesFor]);

  const prependPrev = useCallback(async () => {
    if (loadingPrevRef.current || !hasMorePrevRef.current) return;
    const keys = sequenceKeysRef.current;
    if (keys.length === 0) return;
    loadingPrevRef.current = true;
    const first = chapterStoreRef.current[keys[0]];
    try {
      const prev = await computeNeighbor(first.book, first.chapter, -1);
      if (!prev) {
        setHasMorePrev(false);
        return;
      }
      const key = keyOf(prev.book, prev.chapter);
      const verses = await loadVersesFor(prev.book, prev.chapter);
      setChapterStore((s) => ({
        ...s,
        [key]: { book: prev.book, chapter: prev.chapter, verses, status: "ready" },
      }));
      pendingPrependRef.current = true;
      setSequenceKeys((s) => [key, ...s]);
    } catch (err) {
      setHasMorePrev(false);
    } finally {
      loadingPrevRef.current = false;
    }
  }, [computeNeighbor, loadVersesFor]);

  /* preserve scroll position after prepending a chapter above */
  useLayoutEffect(() => {
    if (!pendingPrependRef.current) return;
    pendingPrependRef.current = false;
    const el = scrollRef.current;
    if (!el) return;
    const prevHeight = Number(el.dataset.prevHeight || 0);
    const prevTop = Number(el.dataset.prevTop || 0);
    const newHeight = el.scrollHeight;
    el.scrollTop = prevTop + (newHeight - prevHeight);
  }, [sequenceKeys]);

  /* intersection observers driving the infinite scroll */
  useEffect(() => {
    if (view !== "reader") return;
    const root = scrollRef.current;
    if (!root) return;

    const bottomObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) appendNext();
      },
      { root, rootMargin: "600px 0px 600px 0px" }
    );
    const topObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const el = scrollRef.current;
          if (el) {
            el.dataset.prevHeight = String(el.scrollHeight);
            el.dataset.prevTop = String(el.scrollTop);
          }
          prependPrev();
        }
      },
      { root, rootMargin: "600px 0px 600px 0px" }
    );

    if (bottomSentinelRef.current) bottomObserver.observe(bottomSentinelRef.current);
    if (topSentinelRef.current) topObserver.observe(topSentinelRef.current);

    return () => {
      bottomObserver.disconnect();
      topObserver.disconnect();
    };
  }, [view, sequenceKeys, appendNext, prependPrev]);

  /* track which chapter is most visible, to label the header while reading */
  useEffect(() => {
    if (view !== "reader") return;
    const root = scrollRef.current;
    if (!root) return;
    const sections = root.querySelectorAll("[data-chapter-key]");
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!best || entry.intersectionRatio > best.intersectionRatio) best = entry;
          }
        }
        if (best) setActiveKey(best.target.getAttribute("data-chapter-key"));
      },
      { root, threshold: [0.1, 0.3, 0.5, 0.7] }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [view, sequenceKeys]);

  const runSearch = useCallback((q) => {
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
  }, []);

  useEffect(() => {
    if (view !== "search") return;
    const t = setTimeout(() => runSearch(searchQuery), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, view]);

  const activeEntry = activeKey ? chapterStore[activeKey] : null;

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
        .bh-display { font-family: 'Fraunces', Georgia, serif; }
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

      <Header
        onMenu={() => setSidebarOpen((s) => !s)}
        onHome={() => setView("home")}
        onSearch={() => setView("search")}
        active={view}
        readingTitle={
          view === "reader" && activeEntry ? `${activeEntry.book} ${activeEntry.chapter}` : null
        }
      />

      <div className="flex flex-1 min-h-0 relative">
        <Sidebar
          open={sidebarOpen}
          books={books}
          booksLoading={booksLoading}
          booksError={booksError}
          expandedBook={expandedBook}
          chapters={sidebarChapters}
          chaptersLoading={sidebarChaptersLoading}
          selectedBook={activeEntry?.book}
          selectedChapter={activeEntry?.chapter}
          onToggleBook={toggleBook}
          onSelectChapter={jumpTo}
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
                if (dailyVerse) jumpTo(dailyVerse.book, dailyVerse.chapter);
              }}
            />
          )}

          {view === "reader" && (
            <ScrollReader
              sequenceKeys={sequenceKeys}
              chapterStore={chapterStore}
              topSentinelRef={topSentinelRef}
              bottomSentinelRef={bottomSentinelRef}
              hasMorePrev={hasMorePrev}
              hasMoreNext={hasMoreNext}
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
              onOpenResult={(row) => jumpTo(row.book, row.chapter)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   Header
--------------------------------------------------------------------- */
function Header({ onMenu, onHome, onSearch, active, readingTitle }) {
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
            {readingTitle || "Scripture"}
          </span>
        </button>
      </div>
      <nav className="flex items-center gap-1">
        <HeaderIcon icon={HomeIcon} label="Home" onClick={onHome} activeState={active === "home"} />
        <HeaderIcon icon={Search} label="Search" onClick={onSearch} activeState={active === "search"} />
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
        <div className="fixed inset-0 bg-black/40 z-10 md:hidden" onClick={onClose} aria-hidden="true" />
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
                style={{ color: book === selectedBook ? "var(--brass)" : "var(--ash)" }}
              >
                <span>{book}</span>
                <span style={{ color: "var(--ash-dim)" }}>{expandedBook === book ? "–" : "+"}</span>
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
          Couldn't load today's verse — {dailyError}
        </p>
      )}

      {dailyVerse && (
        <button onClick={onOpenDaily} className="bh-focusable text-left block group">
          <div style={{ borderTop: "2px solid var(--oxide)", paddingTop: "1rem" }}>
            {dailyVerse.heading && (
              <p className="bh-display text-base mb-2" style={{ color: "var(--oxide)" }}>
                {dailyVerse.heading}
              </p>
            )}
            <p className="text-2xl leading-relaxed mb-3" style={{ color: "var(--ink-text)" }}>
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
        Pick a book from the left to start reading — scrolling down moves into the next
        chapter automatically, just like turning a page.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------
   Continuous scroll reader
--------------------------------------------------------------------- */
function ScrollReader({ sequenceKeys, chapterStore, topSentinelRef, bottomSentinelRef, hasMorePrev, hasMoreNext }) {
  if (sequenceKeys.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <p style={{ color: "var(--ink-text-dim)" }}>
          Choose a book and chapter from the navigation to begin reading.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div ref={topSentinelRef} style={{ height: 1 }} />
      {hasMorePrev && (
        <p
          className="text-xs text-center py-3 flex items-center justify-center gap-2"
          style={{ color: "var(--ink-text-dim)" }}
        >
          <Loader2 size={12} className="animate-spin" /> Loading previous chapter…
        </p>
      )}

      {sequenceKeys.map((key) => {
        const entry = chapterStore[key];
        if (!entry) return null;
        return <ChapterBlock key={key} entryKey={key} entry={entry} />;
      })}

      {hasMoreNext ? (
        <p
          className="text-xs text-center py-6 flex items-center justify-center gap-2"
          style={{ color: "var(--ink-text-dim)" }}
        >
          <Loader2 size={12} className="animate-spin" /> Loading next chapter…
        </p>
      ) : (
        <p className="text-xs text-center py-6" style={{ color: "var(--ink-text-dim)" }}>
          End of scripture.
        </p>
      )}
      <div ref={bottomSentinelRef} style={{ height: 1 }} />
    </div>
  );
}

function ChapterBlock({ entryKey, entry }) {
  const { book, chapter, status, verses, error } = entry;
  return (
    <section data-chapter-key={entryKey} className="mb-14 bh-verse-enter">
      <h2 className="bh-display text-2xl mb-6" style={{ color: "var(--ink-text)" }}>
        {book} {chapter}
      </h2>

      {status === "loading" && (
        <p className="text-sm flex items-center gap-2" style={{ color: "var(--ink-text-dim)" }}>
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      )}

      {status === "error" && (
        <p className="text-sm" style={{ color: "var(--oxide)" }}>
          Couldn't load this chapter — {error}
        </p>
      )}

      {status === "ready" && verses.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-text-dim)" }}>
          No verses found for this chapter.
        </p>
      )}

      {status === "ready" &&
        verses.length > 0 &&
        groupByHeading(verses).map((group, i) => (
          <div key={i} className="mb-6">
            {group.heading && (
              <p className="bh-display text-lg mb-2" style={{ color: "var(--oxide)" }}>
                {group.heading}
              </p>
            )}
            <p className="text-lg leading-loose" style={{ color: "var(--ink-text)" }}>
              {group.items.map((v) => (
                <span key={v.verse}>
                  <sup className="mr-1 select-none" style={{ color: "var(--brass)", fontSize: "0.7em" }}>
                    {v.verse}
                  </sup>
                  {v.text}{" "}
                </span>
              ))}
            </p>
          </div>
        ))}
    </section>
  );
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
          style={{ background: "transparent", border: "1px solid var(--parchment-line)", color: "var(--ink-text)" }}
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
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--parchment-line)" }}
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