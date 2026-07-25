package report

import "testing"

func TestHashPayloadIsDeterministic(t *testing.T) {
	payload := Payload{
		ProtocolVersion:   "1.0",
		ReportID:          "report-1",
		MonitorID:         "monitor-1",
		EndpointID:        "endpoint-1",
		ChainID:           8453,
		CheckType:         CheckEthBlockNumber,
		MeasurementWindow: 100,
		StartedAt:         101,
		FinishedAt:        105,
		LatencyMS:         4,
		Success:           true,
		RPCMethod:         "eth_blockNumber",
		ResultHash:        "0xabc",
		Nonce:             1,
		SoftwareVersion:   "0.1.0",
	}

	first, err := HashPayload(payload)
	if err != nil {
		t.Fatalf("hash payload: %v", err)
	}
	second, err := HashPayload(payload)
	if err != nil {
		t.Fatalf("hash payload again: %v", err)
	}

	if first != second {
		t.Fatalf("expected deterministic hash, got %q and %q", first, second)
	}
}
