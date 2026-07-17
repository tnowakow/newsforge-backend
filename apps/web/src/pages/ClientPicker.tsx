import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import type { ClientSummary, Richness } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useToast } from "@/lib/toast";

const RICHNESS_LABEL: Record<Richness, string> = {
  SIMPLE: "Simple",
  MODERATE: "Moderate",
  RICH: "Rich",
  EXTRA_RICH: "Extra-Rich",
};

const RICHNESS_TONE: Record<Richness, "neutral" | "blue" | "amber" | "plum"> = {
  SIMPLE: "neutral",
  MODERATE: "blue",
  RICH: "amber",
  EXTRA_RICH: "plum",
};

type SortKey = "az" | "za" | "richness" | "recent";

export default function ClientPicker() {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [richness, setRichness] = useState<Richness | "ALL">("ALL");
  const [sort, setSort] = useState<SortKey>("az");

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 150);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadClients() {
    setError(null);
    setClients(null);
    try {
      const list = await api.listClients();
      setClients(list);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't load clients";
      setError(msg);
      toast(msg, { tone: "error" });
    }
  }

  // ⌘K focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        (document.getElementById("client-search") as HTMLInputElement | null)?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = debouncedSearch.trim().toLowerCase();
    const richOrder: Record<Richness, number> = {
      SIMPLE: 0,
      MODERATE: 1,
      RICH: 2,
      EXTRA_RICH: 3,
    };
    let out = clients.filter((c) => {
      if (richness !== "ALL" && c.richnessLevel !== richness) return false;
      if (!q) return true;
      const hay = `${c.name} ${c.city ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    out = [...out].sort((a, b) => {
      if (sort === "az") return a.name.localeCompare(b.name);
      if (sort === "za") return b.name.localeCompare(a.name);
      if (sort === "richness")
        return richOrder[a.richnessLevel] - richOrder[b.richnessLevel];
      return 0;
    });
    return out;
  }, [clients, debouncedSearch, richness, sort]);

  const hasSearch = debouncedSearch.trim().length > 0 || richness !== "ALL";

  return (
    <div className="px-10 pt-10 pb-16 max-w-[1320px] mx-auto">
      {/* Page intro */}
      <h1 className="text-xl font-display font-semibold tracking-tight">
        Pick a client
      </h1>
      <p className="text-sm text-ink-muted mt-1.5">
        {clients ? `${clients.length} communities` : "Loading communities"} · Choose
        one to start assembling this month's newsletter
      </p>

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <label className="relative flex-1 min-w-[260px] max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
            🔍
          </span>
          <input
            id="client-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients… (⌘K)"
            className="w-full h-10 pl-9 pr-3 bg-surface border border-rule rounded-md text-sm placeholder:text-ink-muted/70 focus:border-accent focus:outline-none"
          />
        </label>
        <select
          value={richness}
          onChange={(e) => setRichness(e.target.value as Richness | "ALL")}
          className="h-10 px-3 bg-surface border border-rule rounded-md text-sm"
        >
          <option value="ALL">Richness: All</option>
          <option value="SIMPLE">Simple</option>
          <option value="MODERATE">Moderate</option>
          <option value="RICH">Rich</option>
          <option value="EXTRA_RICH">Extra-Rich</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-10 px-3 bg-surface border border-rule rounded-md text-sm"
        >
          <option value="az">Sort: A–Z</option>
          <option value="za">Sort: Z–A</option>
          <option value="richness">Sort: Richness ↑</option>
        </select>
        {clients && (
          <span className="text-2xs text-ink-muted ml-auto">
            Showing {filtered.length} of {clients.length}
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="mt-6 grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {/* Loading */}
        {!clients && !error &&
          Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}

        {/* Error */}
        {error && (
          <div className="col-span-full">
            <ErrorState onRetry={loadClients} message={error} />
          </div>
        )}

        {/* Empty */}
        {clients && filtered.length === 0 && !error && (
          <div className="col-span-full">
            <EmptyState
              query={debouncedSearch}
              hasSearch={hasSearch}
              onClear={() => {
                setSearch("");
                setRichness("ALL");
              }}
            />
          </div>
        )}

        {/* Cards */}
        {clients &&
          filtered.map((c) => <ClientCard key={c.id} client={c} />)}
      </div>
    </div>
  );
}

function ClientCard({ client }: { client: ClientSummary }) {
  const tone = RICHNESS_TONE[client.richnessLevel];
  // For the second/accent chips, mock by darkening/lightening primary if we lack them on the summary.
  const primary = client.primaryColor || "#1F4D8C";
  return (
    <Link
      to={`/workspace/${client.id}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:rounded-xl"
    >
      <Card className="p-4 h-[220px] flex flex-col">
        <div className="flex items-start justify-between">
          <div
            className="h-14 w-14 rounded-lg grid place-items-center text-white font-display font-bold text-lg shadow-card"
            style={{ background: primary }}
            aria-hidden
          >
            {client.logoUrl ? (
              <img
                src={client.logoUrl}
                alt=""
                className="h-full w-full object-cover rounded-lg"
              />
            ) : (
              <span>{client.name.charAt(0)}</span>
            )}
          </div>
          <Tag tone={tone}>{RICHNESS_LABEL[client.richnessLevel]}</Tag>
        </div>

        <div className="mt-4 flex-1">
          <div className="font-display font-semibold text-base leading-snug line-clamp-2">
            {client.name}
          </div>
          {client.city && (
            <div className="text-xs text-ink-muted mt-0.5">
              {client.city}
              {client.state ? `, ${client.state}` : ""}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1.5" aria-hidden>
            <span
              className="h-4 w-4 rounded-full border border-black/5"
              style={{ background: primary }}
            />
            <span
              className="h-4 w-4 rounded-full border border-black/5"
              style={{ background: shade(primary, -18) }}
            />
            <span
              className="h-4 w-4 rounded-full border border-black/5"
              style={{ background: shade(primary, 22) }}
            />
          </div>
          <span className="text-2xs text-ink-muted">
            {client.pageCount}p
          </span>
        </div>
      </Card>
    </Link>
  );
}

function EmptyState({
  query,
  hasSearch,
  onClear,
}: {
  query: string;
  hasSearch: boolean;
  onClear: () => void;
}) {
  return (
    <div className="bg-surface border border-rule rounded-xl p-10 text-center">
      <div className="text-3xl mb-2" aria-hidden>
        🔎
      </div>
      <div className="font-display font-semibold text-lg">
        {hasSearch ? (
          <>No clients match {query && <span>"{query}"</span>}</>
        ) : (
          "No clients to show"
        )}
      </div>
      <div className="text-sm text-ink-muted mt-1">
        Try a different name or clear the richness filter.
      </div>
      <div className="mt-4">
        <Button variant="ghost" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="bg-surface border border-error/30 rounded-xl p-8 text-center">
      <div className="text-warn font-display text-lg mb-1">
        ⚠ Couldn't load clients
      </div>
      <div className="text-sm text-ink-muted">{message}</div>
      <div className="mt-4">
        <Button variant="primary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

// quick deterministic shade helper
function shade(hex: string, percent: number): string {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const adjust = (c: number) =>
    Math.min(255, Math.max(0, Math.round(c + (percent / 100) * 255)));
  r = adjust(r);
  g = adjust(g);
  b = adjust(b);
  return `#${[r, g, b]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}
