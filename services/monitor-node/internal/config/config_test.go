package config

import "testing"

func TestLoadUsesEnvironmentOverrides(t *testing.T) {
	cfg, err := Load(nil, map[string]string{
		"MONITOR_ID":               "monitor-test",
		"MONITOR_PRIVATE_KEY":      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"MONITOR_RPC_HTTP_URL":     "http://localhost:8545",
		"MONITOR_ENDPOINT_ID":      "endpoint-test",
		"MONITOR_CHAIN_ID":         "8453",
		"MONITOR_INTERVAL_SECONDS": "5",
		"MONITOR_TIMEOUT_MS":       "250",
	})
	if err != nil {
		t.Fatalf("expected config to load: %v", err)
	}

	if cfg.Monitor.ID != "monitor-test" {
		t.Fatalf("expected monitor id override, got %q", cfg.Monitor.ID)
	}
	if cfg.Endpoint.ChainID != 8453 {
		t.Fatalf("expected chain id override, got %d", cfg.Endpoint.ChainID)
	}
	if cfg.Runtime.IntervalSeconds != 5 {
		t.Fatalf("expected interval override, got %d", cfg.Runtime.IntervalSeconds)
	}
}
