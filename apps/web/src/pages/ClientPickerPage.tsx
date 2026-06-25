import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ClientSummaryDto, Richness } from "@newsforge/shared";
import { listClients } from "../api/endpoints";
import { ApiError } from "../api/client";
import { ClientLogo } from "../components/ClientLogo";
import { ColorSwatches } from "../components/ColorSwatches";
import { RichnessBadge } from "../components/RichnessBadge";
import {
  CardSkeletonGrid,
  EmptyState,
  ErrorState,
} from "../components/states";
import { RICHNESS_LABEL, RICHNESS_ORDER } from "../lib/richness";
import { cn } from "../lib/cn";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; clients: ClientSummaryDto[] }
  | { kind: "error"; message: string };

export function ClientPickerPage() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [richnessFilter, setRichnessFilter] = useState<Richness | "ALL">("ALL");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setStatus({ kind: "loading" });
    listClients(ctrl.signal)
      .then((res) => setStatus({ kind: "ready", clients: res.clients }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg =
          e instanceof ApiError
            ? friendlyApiError(e)
            : "Couldn't load clients. Check that the API is running.";
        setStatus({ kind: "error", message: msg });
      });
    return () => ctrl.abort();
  }, [reloadTick]);

  const filtered = useMemo(() => {
    if (status.kind !== "ready") return [];
    const q = query.trim().toLowerCase();
    return status.clients.filter((c) => {
      if (richnessFilter !== "ALL" && c.richnessLevel !== richnessFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.tagline.toLowerCase().includes(q)
      );
    });
  }, [status, query, richnessFilter]);

  return (
    <div className="px-8 py-10 max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Pick a client to demo
        </h1>
        <p className="text-slate-600 mt-1">
          Twenty-five Porter One Design senior-living clients. Choose one to
          assemble a brand-aware newsletter.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city, or tagline…"
            className="input pl-9"
            aria-label="Search clients"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔎
          </span>
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md p-1">
          <FilterChip
            label="All"
            active={richnessFilter === "ALL"}
            onClick={() => setRichnessFilter("ALL")}
          />
          {RICHNESS_ORDER.map((r) => (
            <FilterChip
              key={r}
              label={RICHNESS_LABEL[r]}
              active={richnessFilter === r}
              onClick={() => setRichnessFilter(r)}
            />
          ))}
        </div>
        {status.kind === "ready" && (
          <span className="ml-auto text-sm text-slate-500">
            {filtered.length} of {status.clients.length}
          </span>
        )}
      </div>

      {status.kind === "loading" && <CardSkeletonGrid count={12} />}

      {status.kind === "error" && (
        <ErrorState
          message={status.message}
          onRetry={() => setReloadTick((t) => t + 1)}
        />
      )}

      {status.kind === "ready" && filtered.length === 0 && (
        <EmptyState
          title="No clients match"
          message="Try a different search term or clear the richness filter."
          action={
            <button
              className="btn-secondary"
              onClick={() => {
                setQuery("");
                setRichnessFilter("ALL");
              }}
            >
              Reset filters
            </button>
          }
        />
      )}

      {status.kind === "ready" && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c) => (
            <ClientCard key={c.id} client={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
        active
          ? "bg-porter text-white"
          : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {label}
    </button>
  );
}

function ClientCard({ client }: { client: ClientSummaryDto }) {
  return (
    <Link
      to={`/clients/${encodeURIComponent(client.id)}`}
      className="card p-4 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-150 flex flex-col gap-3 group"
    >
      <div className="flex items-start gap-3">
        <ClientLogo logoUrl={client.logoUrl} name={client.name} size={44} />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 truncate group-hover:text-porter">
            {client.name}
          </h3>
          <p className="text-xs text-slate-500 truncate">{client.city}</p>
        </div>
        <RichnessBadge level={client.richnessLevel} />
      </div>
      <p className="text-sm text-slate-600 line-clamp-2 flex-1">
        {client.tagline}
      </p>
      <div className="flex items-center justify-between">
        <ColorSwatches
          primary={client.primaryColor}
          secondary={client.secondaryColor}
          accent={client.accentColor}
        />
        <span className="text-xs text-slate-400">{client.pageCount}-page</span>
      </div>
    </Link>
  );
}

function friendlyApiError(e: ApiError): string {
  if (e.status === 0 || e.status >= 500) {
    return "The API isn't responding. Make sure it's running on the expected port.";
  }
  return e.body?.message ?? "Couldn't load clients.";
}
