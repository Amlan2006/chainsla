const providers = [
  { name: "Provider Alpha", chain: "Base", uptime: "99.98%", latency: "142 ms", status: "Healthy" },
  {
    name: "Provider Beta",
    chain: "Ethereum",
    uptime: "99.91%",
    latency: "188 ms",
    status: "Watch",
  },
  {
    name: "Provider Gamma",
    chain: "Arbitrum",
    uptime: "99.95%",
    latency: "164 ms",
    status: "Healthy",
  },
];

interface Summary {
  monitors: number;
  endpoints: number;
  reports: number;
  acceptedReports: number;
  aggregateWindows: number;
}

async function getSummary(): Promise<Summary> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  try {
    const response = await fetch(`${apiUrl}/summary`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`summary returned ${response.status}`);
    }

    return (await response.json()) as Summary;
  } catch {
    return {
      monitors: 0,
      endpoints: 0,
      reports: 0,
      acceptedReports: 0,
      aggregateWindows: 0,
    };
  }
}

export default async function HomePage() {
  const summary = await getSummary();

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">RPC SLA Platform</p>
          <h1>Provider Performance</h1>
        </div>
        <span className="status">Phase 0</span>
      </header>

      <section className="summary" aria-label="Monitoring summary">
        <div>
          <span>Endpoints</span>
          <strong>{summary.endpoints}</strong>
        </div>
        <div>
          <span>Monitors</span>
          <strong>{summary.monitors}</strong>
        </div>
        <div>
          <span>Aggregates</span>
          <strong>{summary.aggregateWindows}</strong>
        </div>
      </section>

      <section className="tableSection">
        <h2>Provider Directory</h2>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Chain</th>
              <th>Uptime</th>
              <th>Median Latency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.name}>
                <td>{provider.name}</td>
                <td>{provider.chain}</td>
                <td>{provider.uptime}</td>
                <td>{provider.latency}</td>
                <td>{provider.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
