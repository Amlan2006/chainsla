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

export default function HomePage() {
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
          <strong>0</strong>
        </div>
        <div>
          <span>Monitors</span>
          <strong>0</strong>
        </div>
        <div>
          <span>Committed Batches</span>
          <strong>0</strong>
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
