import type { Article, NewsImage } from "@/lib/types";

export interface SourcePreflightProps {
  articles: Article[];
  images: NewsImage[];
  onResolve?: (articleId: string, reference: string, imageId: string) => void;
}

/** A deliberately honest review of what the upload packet contains. */
export function SourcePreflight({ articles, images, onResolve }: SourcePreflightProps) {
  const byName = new Map(images.flatMap((image) => image.originalName ? [[image.originalName.trim().toLocaleLowerCase(), image] as const] : []));
  const refs = articles.flatMap((article) => (article.imageRefs ?? []).map((reference) => ({ article, reference })));
  const unresolved = refs.filter(({ reference }) => !byName.has(reference.trim().toLocaleLowerCase()));
  const assigned = new Set(refs.map(({ reference }) => byName.get(reference.trim().toLocaleLowerCase())?.id).filter((id): id is string => Boolean(id)));
  const unassigned = images.filter((image) => !assigned.has(image.id));
  const outer = articles.filter((article) => article.sourceRole === "brief").length;
  const inner = articles.length - outer;

  return (
    <section aria-labelledby="source-preflight-title" className="mt-5 rounded-lg border border-rule bg-bg p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="source-preflight-title" className="font-medium text-sm">Source preflight</h3>
          <p className="text-xs text-ink-muted mt-1">Review the packet before composing. Names and dimensions are preserved from the upload.</p>
        </div>
        <span className={`text-xs font-medium ${unresolved.length ? "text-error" : "text-success"}`}>
          {unresolved.length ? `${unresolved.length} unresolved link${unresolved.length === 1 ? "" : "s"}` : "Links resolved"}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
        <Metric label="Source units" value={articles.length} />
        <Metric label="Photos" value={images.length} />
        <Metric label="Unassigned photos" value={unassigned.length} />
        <Metric label="Inner allocation" value={`${inner} unit${inner === 1 ? "" : "s"}`} />
        <Metric label="Outer allocation" value={outer ? `${outer} unit${outer === 1 ? "" : "s"}` : "Missing / not supplied"} />
      </div>
      {(unresolved.length > 0 || unassigned.length > 0) && (
        <div className="mt-3 space-y-2">
          {unresolved.map(({ article, reference }) => (
            <div key={`${article.id}:${reference}`} className="flex items-center justify-between gap-2 rounded border border-error/30 bg-error/5 px-3 py-2">
              <span className="min-w-0 truncate text-xs"><strong>{article.title}</strong> · {reference}</span>
              {onResolve && images.length > 0 && (
                <select aria-label={`Resolve ${reference}`} className="h-7 max-w-[180px] rounded border border-rule bg-surface px-1 text-xs" defaultValue="" onChange={(event) => event.currentTarget.value && onResolve(article.id, reference, event.currentTarget.value)}>
                  <option value="">Resolve alias…</option>
                  {images.map((image) => <option key={image.id} value={image.id}>{image.originalName ?? image.id}</option>)}
                </select>
              )}
            </div>
          ))}
          {unassigned.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unassigned.map((image) => (
                <div key={image.id} className="flex items-center gap-2 rounded border border-rule bg-surface px-2 py-1">
                  <img src={image.url} alt={image.originalName ?? "Unassigned upload"} className="h-8 w-8 rounded object-cover" />
                  <span className="text-xs">{image.originalName ?? image.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border border-rule bg-surface px-2 py-2"><div className="text-ink-muted">{label}</div><div className="font-semibold mt-0.5">{value}</div></div>;
}
