import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";

const DEFAULTS = {
  locations: 150,
  currentMinutes: 60,
  draftMinutes: 12,
  adjustmentMinutes: 8,
  revisionRate: 65,
  loadedHourlyRate: 75,
};

export default function BusinessCase() {
  const [locations, setLocations] = useState(DEFAULTS.locations);
  const [currentMinutes, setCurrentMinutes] = useState(DEFAULTS.currentMinutes);
  const [draftMinutes, setDraftMinutes] = useState(DEFAULTS.draftMinutes);
  const [adjustmentMinutes, setAdjustmentMinutes] = useState(
    DEFAULTS.adjustmentMinutes,
  );
  const [revisionRate, setRevisionRate] = useState(DEFAULTS.revisionRate);
  const [loadedHourlyRate, setLoadedHourlyRate] = useState(
    DEFAULTS.loadedHourlyRate,
  );

  const metrics = useMemo(() => {
    const currentHours = (locations * currentMinutes) / 60;
    const newsforgeMinutes =
      locations * draftMinutes +
      locations * (revisionRate / 100) * adjustmentMinutes;
    const newsforgeHours = newsforgeMinutes / 60;
    const savedHours = Math.max(0, currentHours - newsforgeHours);
    const annualSavedHours = savedHours * 12;
    const annualDollarValue = annualSavedHours * loadedHourlyRate;
    const reduction = currentHours > 0 ? (savedHours / currentHours) * 100 : 0;
    const workWeeks = annualSavedHours / 40;

    return {
      currentHours,
      newsforgeHours,
      savedHours,
      annualSavedHours,
      annualDollarValue,
      reduction,
      workWeeks,
    };
  }, [
    adjustmentMinutes,
    currentMinutes,
    draftMinutes,
    loadedHourlyRate,
    locations,
    revisionRate,
  ]);

  const workflow = [
    {
      step: "Monthly intake",
      today: "Collect community content and photos across locations",
      newsforge: "Upload monthly content and images into a repeatable workspace",
    },
    {
      step: "First draft",
      today: `${formatNumber(locations)} manual layouts at ${currentMinutes} min each`,
      newsforge: `AI-assisted first draft at ${draftMinutes} min each`,
    },
    {
      step: "Approval",
      today: "Send proofs, wait for notes, reopen files for edits",
      newsforge: "Share generated preview, track status, preserve the version",
    },
    {
      step: "Final polish",
      today: "Manual rework happens inside production tools",
      newsforge: "Export PDF or IDML so quick Adobe edits stay available",
    },
  ];

  return (
    <div className="px-10 pt-10 pb-16 max-w-[1320px] mx-auto">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-2xs uppercase tracking-widest text-ink-muted">
            PorterOne business case
          </p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl font-semibold tracking-tight">
            Turn 150 monthly newsletters into a repeatable production line.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
            Trilogy locations each bring their own content, photos, approval
            cycle, and last-mile edits. NewsForge compresses the first draft,
            keeps approval visible, and still hands production teams an InDesign
            file when Adobe polish is the fastest path.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex h-10 items-center justify-center rounded-md border border-rule bg-surface px-4 text-sm font-medium text-ink hover:border-ink/30 hover:bg-rule/30"
        >
          Back to clients
        </Link>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Monthly time saved"
          value={`${formatNumber(metrics.savedHours)} hrs`}
          detail={`${formatNumber(metrics.reduction)}% reduction from current draft work`}
        />
        <MetricCard
          label="Annual capacity returned"
          value={`${formatNumber(metrics.annualSavedHours)} hrs`}
          detail={`${formatNumber(metrics.workWeeks, 1)} full workweeks`}
        />
        <MetricCard
          label="Annual labor value"
          value={currency(metrics.annualDollarValue)}
          detail={`At ${currency(loadedHourlyRate)}/hr loaded cost`}
        />
        <MetricCard
          label="Production queue"
          value={`${formatNumber(locations)} locations`}
          detail="Each with unique content, photos, and approval"
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card hover={false} className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">
                Live assumptions
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Adjust the demo math while PorterOne talks through the real
                operating model.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLocations(DEFAULTS.locations);
                setCurrentMinutes(DEFAULTS.currentMinutes);
                setDraftMinutes(DEFAULTS.draftMinutes);
                setAdjustmentMinutes(DEFAULTS.adjustmentMinutes);
                setRevisionRate(DEFAULTS.revisionRate);
                setLoadedHourlyRate(DEFAULTS.loadedHourlyRate);
              }}
              className="h-8 rounded-md border border-rule px-3 text-xs font-medium hover:border-ink/30 hover:bg-rule/30"
            >
              Reset
            </button>
          </div>

          <div className="mt-5 space-y-5">
            <SliderControl
              label="Monthly locations"
              value={locations}
              min={25}
              max={250}
              step={5}
              suffix="locations"
              onChange={setLocations}
            />
            <SliderControl
              label="Current first draft time"
              value={currentMinutes}
              min={30}
              max={120}
              step={5}
              suffix="min/location"
              onChange={setCurrentMinutes}
            />
            <SliderControl
              label="NewsForge first draft time"
              value={draftMinutes}
              min={5}
              max={30}
              step={1}
              suffix="min/location"
              onChange={setDraftMinutes}
            />
            <SliderControl
              label="Post-approval Adobe polish"
              value={adjustmentMinutes}
              min={0}
              max={30}
              step={1}
              suffix="min/revised location"
              onChange={setAdjustmentMinutes}
            />
            <SliderControl
              label="Locations needing edits"
              value={revisionRate}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={setRevisionRate}
            />
            <SliderControl
              label="Loaded production cost"
              value={loadedHourlyRate}
              min={35}
              max={150}
              step={5}
              prefix="$"
              suffix="/hr"
              onChange={setLoadedHourlyRate}
            />
          </div>
        </Card>

        <div className="space-y-5">
          <Card hover={false} className="p-5">
            <h2 className="font-display text-lg font-semibold">
              Monthly workload comparison
            </h2>
            <div className="mt-5 space-y-4">
              <ComparisonBar
                label="Current manual first draft"
                hours={metrics.currentHours}
                max={Math.max(metrics.currentHours, metrics.newsforgeHours)}
                tone="current"
              />
              <ComparisonBar
                label="NewsForge draft + approval edits"
                hours={metrics.newsforgeHours}
                max={Math.max(metrics.currentHours, metrics.newsforgeHours)}
                tone="newsforge"
              />
            </div>
            <div className="mt-5 rounded-md border border-success/25 bg-success/10 p-4">
              <div className="text-sm font-semibold text-success">
                Demo headline
              </div>
              <p className="mt-1 text-sm leading-6 text-ink">
                NewsForge gives PorterOne back about{" "}
                <strong>{formatNumber(metrics.savedHours)} hours every month</strong>{" "}
                before counting fewer handoffs, cleaner approvals, and faster
                Adobe-ready changes.
              </p>
            </div>
          </Card>

          <Card hover={false} className="p-5">
            <h2 className="font-display text-lg font-semibold">
              Talk track
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {workflow.map((item) => (
                <div key={item.step} className="rounded-md border border-rule p-4">
                  <div className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
                    {item.step}
                  </div>
                  <div className="mt-3 grid gap-3">
                    <WorkflowLine label="Today" text={item.today} />
                    <WorkflowLine label="NewsForge" text={item.newsforge} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card hover={false} className="p-5">
      <div className="text-2xs uppercase tracking-widest text-ink-muted">
        {label}
      </div>
      <div className="mt-3 font-display text-3xl font-semibold tracking-tight">
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-ink-muted">{detail}</div>
    </Card>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  prefix = "",
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{label}</span>
        <span className="min-w-[116px] rounded-md border border-rule bg-bg px-2 py-1 text-right text-xs font-semibold">
          {prefix}
          {formatNumber(value)}
          <span className="ml-1 font-normal text-ink-muted">{suffix}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[rgb(var(--accent))]"
      />
    </label>
  );
}

function ComparisonBar({
  label,
  hours,
  max,
  tone,
}: {
  label: string;
  hours: number;
  max: number;
  tone: "current" | "newsforge";
}) {
  const pct = max > 0 ? Math.max(4, (hours / max) * 100) : 0;
  const fill = tone === "current" ? "bg-warn" : "bg-success";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-ink-muted">{formatNumber(hours)} hrs</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-rule">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WorkflowLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-2xs font-semibold uppercase tracking-widest text-ink-muted">
        {label}
      </div>
      <div className="mt-1 text-sm leading-5">{text}</div>
    </div>
  );
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
