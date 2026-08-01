interface Summary {
  monitors: number;
  endpoints: number;
  reports: number;
  acceptedReports: number;
  aggregateWindows: number;
}

interface ProviderItem {
  providerId: string;
  name: string;
  endpointCount: number;
  bestStatus: string;
  averageSuccessRate?: number;
  medianLatencyMs?: number;
  p95LatencyMs?: number;
}

interface EndpointItem {
  endpointId: string;
  providerName?: string;
  networkName?: string;
  latestStatus: string;
  checkCount: number;
  monitorCount: number;
  successRate?: number;
  errorRate?: number;
  medianLatencyMs?: number;
  p95LatencyMs?: number;
  latestBlockNumber?: number;
}

interface AggregateItem {
  endpointId: string;
  checkType: string;
  windowStart: number;
  monitorCount: number;
  validReportCount: number;
  successRate: number;
  errorRate: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  p99LatencyMs?: number;
  medianBlockNumber?: number;
  status: string;
}

interface MonitorItem {
  id: string;
  region: string;
  country: string;
  cloudProvider: string;
  asn: string;
  status: string;
  softwareVersion?: string;
  lastSeenAt?: string;
  reportCount: number;
  acceptedReportCount: number;
}

interface ReportItem {
  reportId: string;
  monitorId: string;
  endpointId: string;
  checkType: string;
  latencyMs: number;
  success: boolean;
  accepted: boolean;
  rejectionReason?: string;
  receivedAt: string;
}

interface DashboardData {
  summary: Summary;
  providers: ProviderItem[];
  endpoints: EndpointItem[];
  aggregates: AggregateItem[];
  monitors: MonitorItem[];
  reports: ReportItem[];
}

const emptySummary: Summary = {
  monitors: 0,
  endpoints: 0,
  reports: 0,
  acceptedReports: 0,
  aggregateWindows: 0,
};

async function getDashboardData(): Promise<DashboardData> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  const [summary, providers, endpoints, aggregates, monitors, reports] = await Promise.all([
    fetchJson<Summary>(`${apiUrl}/summary`, emptySummary),
    fetchList<ProviderItem>(`${apiUrl}/providers`, "providers"),
    fetchList<EndpointItem>(`${apiUrl}/endpoints/performance`, "endpoints"),
    fetchList<AggregateItem>(`${apiUrl}/aggregates?limit=18`, "aggregates"),
    fetchList<MonitorItem>(`${apiUrl}/monitors`, "monitors"),
    fetchList<ReportItem>(`${apiUrl}/reports?limit=12`, "reports"),
  ]);

  return { summary, providers, endpoints, aggregates, monitors, reports };
}

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return fallback;
    }
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

async function fetchList<T>(url: string, key: string): Promise<T[]> {
  const payload = await fetchJson<Record<string, unknown>>(url, {});
  const value = payload[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export default async function HomePage() {
  const data = await getDashboardData();
  const latestAggregates = data.aggregates.slice(0, 9);

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">RPC SLA Platform</p>
          <h1>Provider Performance</h1>
        </div>
        <span className="status">Phase 4</span>
      </header>

      <section className="summary" aria-label="Monitoring summary">
        <Metric label="Monitors" value={data.summary.monitors} />
        <Metric label="Reports" value={data.summary.reports} />
        <Metric label="Accepted" value={data.summary.acceptedReports} />
        <Metric label="Aggregates" value={data.summary.aggregateWindows} />
      </section>

      <section className="split">
        <Panel title="Endpoint Performance">
          <div className="endpointGrid">
            {data.endpoints.length === 0 ? (
              <EmptyState />
            ) : (
              data.endpoints.map((endpoint) => (
                <article className="endpoint" key={endpoint.endpointId}>
                  <div>
                    <span className={`pill ${endpoint.latestStatus}`}>{endpoint.latestStatus}</span>
                    <h3>{endpoint.endpointId}</h3>
                    <p>
                      {endpoint.providerName ?? endpoint.networkName ?? "Unregistered endpoint"}
                    </p>
                  </div>
                  <dl>
                    <div>
                      <dt>Success</dt>
                      <dd>{formatPercent(endpoint.successRate)}</dd>
                    </div>
                    <div>
                      <dt>p95</dt>
                      <dd>{formatMs(endpoint.p95LatencyMs)}</dd>
                    </div>
                    <div>
                      <dt>Monitors</dt>
                      <dd>{endpoint.monitorCount}</dd>
                    </div>
                    <div>
                      <dt>Block</dt>
                      <dd>{endpoint.latestBlockNumber ?? "-"}</dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Latency Windows">
          <div className="bars">
            {latestAggregates.length === 0 ? (
              <EmptyState />
            ) : (
              latestAggregates.map((aggregate) => (
                <div
                  className="barRow"
                  key={`${aggregate.endpointId}-${aggregate.checkType}-${aggregate.windowStart}`}
                >
                  <span>{shortCheck(aggregate.checkType)}</span>
                  <div className="barTrack">
                    <div
                      className={`barFill ${aggregate.status}`}
                      style={{
                        width: `${Math.min(Math.max((aggregate.p95LatencyMs ?? 0) / 10, 4), 100)}%`,
                      }}
                    />
                  </div>
                  <strong>{formatMs(aggregate.p95LatencyMs)}</strong>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>

      <section className="split">
        <Panel title="Provider Directory">
          <DataTable
            empty={data.providers.length === 0}
            headers={["Provider", "Endpoints", "Uptime", "Median", "Status"]}
            rows={data.providers.map((provider) => [
              provider.name,
              String(provider.endpointCount),
              formatPercent(provider.averageSuccessRate),
              formatMs(provider.medianLatencyMs),
              provider.bestStatus,
            ])}
          />
        </Panel>

        <Panel title="Monitor Health">
          <DataTable
            empty={data.monitors.length === 0}
            headers={["Monitor", "Region", "Cloud", "Reports", "Status"]}
            rows={data.monitors.map((monitor) => [
              monitor.id,
              `${monitor.region}/${monitor.country}`,
              monitor.cloudProvider,
              `${monitor.acceptedReportCount}/${monitor.reportCount}`,
              monitor.status,
            ])}
          />
        </Panel>
      </section>

      <section className="tableSection">
        <h2>Recent Reports</h2>
        <DataTable
          empty={data.reports.length === 0}
          headers={["Report", "Endpoint", "Check", "Latency", "Result", "Received"]}
          rows={data.reports.map((report) => [
            report.reportId.slice(0, 8),
            report.endpointId,
            shortCheck(report.checkType),
            formatMs(report.latencyMs),
            report.accepted
              ? report.success
                ? "accepted"
                : "failed check"
              : (report.rejectionReason ?? "rejected"),
            formatDate(report.receivedAt),
          ])}
        />
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: boolean;
}) {
  if (empty) {
    return <EmptyState />;
  }

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((cell) => (
                <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return <p className="empty">No data yet</p>;
}

function formatPercent(value?: number): string {
  if (value === undefined) {
    return "-";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatMs(value?: number): string {
  if (value === undefined) {
    return "-";
  }
  return `${Math.round(value)} ms`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
}

function shortCheck(value: string): string {
  return value.replace("ETH_", "").replaceAll("_", " ");
}
