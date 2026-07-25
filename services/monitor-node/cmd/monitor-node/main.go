package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rpc-sla/platform/services/monitor-node/internal/config"
	"github.com/rpc-sla/platform/services/monitor-node/internal/queue"
	"github.com/rpc-sla/platform/services/monitor-node/internal/report"
	"github.com/rpc-sla/platform/services/monitor-node/internal/rpc"
)

const version = "0.1.0"

type healthResponse struct {
	OK      bool   `json:"ok"`
	Service string `json:"service"`
	Version string `json:"version"`
}

func main() {
	cfg, err := config.Load(os.Args[1:], config.EnvMap())
	if err != nil {
		slog.Error("failed to load monitor config", "error", err)
		os.Exit(1)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLogLevel(cfg.Runtime.LogLevel),
	}))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	server := startHealthServer(cfg.Runtime.HealthAddr, logger)
	defer shutdownServer(server, logger)

	monitor := NewMonitor(cfg, logger)
	if err := monitor.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("monitor failed", "error", err)
		os.Exit(1)
	}
}

type Monitor struct {
	cfg    config.Config
	logger *slog.Logger
	client *rpc.Client
	queue  queue.FileQueue
	nonce  uint64
}

func NewMonitor(cfg config.Config, logger *slog.Logger) *Monitor {
	monitor := &Monitor{
		cfg:    cfg,
		logger: logger,
		client: rpc.NewClient(cfg.Endpoint.HTTPURL, cfg.Endpoint.ChainID, cfg.Runtime.Timeout),
		queue:  queue.NewFileQueue(cfg.Runtime.QueuePath),
	}
	monitor.restoreNonce()
	return monitor
}

func (m *Monitor) Run(ctx context.Context) error {
	m.logger.Info("monitor started", "monitor_id", m.cfg.Monitor.ID, "endpoint_id", m.cfg.Endpoint.ID)

	if err := m.runChecks(ctx); err != nil {
		m.logger.Error("initial check failed", "error", err)
	}
	m.submitQueuedReports(ctx)
	m.sendHeartbeat(ctx)

	ticker := time.NewTicker(m.cfg.Runtime.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			m.logger.Info("monitor stopped")
			return ctx.Err()
		case <-ticker.C:
			if err := m.runChecks(ctx); err != nil {
				m.logger.Error("scheduled check failed", "error", err)
			}
			m.submitQueuedReports(ctx)
			m.sendHeartbeat(ctx)
		}
	}
}

func (m *Monitor) restoreNonce() {
	reports, err := m.queue.ReadAll()
	if err != nil {
		m.logger.Warn("failed to read queued reports for nonce restore", "error", err)
		return
	}

	for _, queued := range reports {
		if queued.Payload.Nonce > m.nonce {
			m.nonce = queued.Payload.Nonce
		}
	}
}

func (m *Monitor) runChecks(ctx context.Context) error {
	checks := []struct {
		checkType report.CheckType
		run       func(context.Context) rpc.Measurement
	}{
		{checkType: report.CheckHTTPAvailability, run: m.client.HTTPAvailability},
		{checkType: report.CheckEthChainID, run: m.client.EthChainID},
		{checkType: report.CheckEthBlockNumber, run: m.client.EthBlockNumber},
	}

	for _, check := range checks {
		startedAt := time.Now().UTC()
		measurement := check.run(ctx)
		finishedAt := startedAt.Add(measurement.Latency)

		signed, err := m.buildSignedReport(check.checkType, measurement, startedAt, finishedAt)
		if err != nil {
			return err
		}

		if err := m.queue.Append(signed); err != nil {
			return err
		}

		m.logger.Info(
			"report queued",
			"report_id", signed.Payload.ReportID,
			"check_type", signed.Payload.CheckType,
			"success", signed.Payload.Success,
			"latency_ms", signed.Payload.LatencyMS,
		)
	}

	return nil
}

func (m *Monitor) submitQueuedReports(ctx context.Context) {
	reports, err := m.queue.ReadAll()
	if err != nil {
		m.logger.Error("failed to read queued reports", "error", err)
		return
	}
	if len(reports) == 0 {
		return
	}

	remaining := make([]report.SignedReport, 0, len(reports))
	for _, signed := range reports {
		if err := m.submitReport(ctx, signed); err != nil {
			m.logger.Warn("report submission failed", "report_id", signed.Payload.ReportID, "error", err)
			remaining = append(remaining, signed)
			continue
		}
		m.logger.Info("report submitted", "report_id", signed.Payload.ReportID)
	}

	if err := m.queue.ReplaceAll(remaining); err != nil {
		m.logger.Error("failed to rewrite report queue", "error", err)
	}
}

func (m *Monitor) submitReport(ctx context.Context, signed report.SignedReport) error {
	data, err := json.Marshal(signed)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.cfg.Aggregator.URL+"/monitors/reports", bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if m.cfg.Aggregator.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+m.cfg.Aggregator.APIKey)
	}

	client := http.Client{Timeout: m.cfg.Runtime.Timeout}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return errors.New(resp.Status)
	}
	return nil
}

func (m *Monitor) buildSignedReport(checkType report.CheckType, measurement rpc.Measurement, startedAt time.Time, finishedAt time.Time) (report.SignedReport, error) {
	reportID, err := report.NewID()
	if err != nil {
		return report.SignedReport{}, err
	}

	m.nonce++
	payload := report.Payload{
		ProtocolVersion:   "1.0",
		ReportID:          reportID,
		MonitorID:         m.cfg.Monitor.ID,
		EndpointID:        m.cfg.Endpoint.ID,
		ChainID:           m.cfg.Endpoint.ChainID,
		CheckType:         checkType,
		MeasurementWindow: report.MeasurementWindow(startedAt, m.cfg.Runtime.Interval),
		StartedAt:         startedAt.UnixMilli(),
		FinishedAt:        finishedAt.UnixMilli(),
		LatencyMS:         measurement.Latency.Milliseconds(),
		Success:           measurement.Success,
		ErrorCategory:     measurement.ErrorCategory,
		ErrorCode:         measurement.ErrorCode,
		RPCMethod:         measurement.Method,
		ResultHash:        measurement.ResultHash,
		BlockNumber:       measurement.BlockNumber,
		Nonce:             m.nonce,
		SoftwareVersion:   version,
	}

	return report.SignPayload(payload, m.cfg.Monitor.PrivateKey)
}

func (m *Monitor) sendHeartbeat(ctx context.Context) {
	body := map[string]string{
		"monitorId":       m.cfg.Monitor.ID,
		"region":          m.cfg.Monitor.Region,
		"country":         m.cfg.Monitor.Country,
		"cloudProvider":   m.cfg.Monitor.Cloud,
		"asn":             m.cfg.Monitor.ASN,
		"softwareVersion": version,
	}

	data, err := json.Marshal(body)
	if err != nil {
		m.logger.Error("failed to encode heartbeat", "error", err)
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.cfg.Aggregator.URL+"/monitors/heartbeat", bytes.NewReader(data))
	if err != nil {
		m.logger.Error("failed to create heartbeat request", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if m.cfg.Aggregator.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+m.cfg.Aggregator.APIKey)
	}

	client := http.Client{Timeout: m.cfg.Runtime.Timeout}
	resp, err := client.Do(req)
	if err != nil {
		m.logger.Warn("heartbeat failed", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		m.logger.Warn("heartbeat rejected", "status", resp.StatusCode)
		return
	}

	m.logger.Info("heartbeat submitted")
}

func startHealthServer(addr string, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, healthResponse{
			OK:      true,
			Service: "monitor-node",
			Version: version,
		})
	})

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("monitor health server listening", "addr", addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("monitor health server failed", "error", err)
		}
	}()

	return server
}

func shutdownServer(server *http.Server, logger *slog.Logger) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("monitor health server shutdown failed", "error", err)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload healthResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Error("failed to encode response", "error", err)
	}
}

func parseLogLevel(value string) slog.Level {
	switch value {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
