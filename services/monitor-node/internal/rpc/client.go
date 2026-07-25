package rpc

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
)

type Client struct {
	url        string
	chainID    int64
	httpClient *http.Client
}

type Measurement struct {
	Method        string
	Latency       time.Duration
	Success       bool
	ErrorCategory string
	ErrorCode     string
	ResultHash    string
	BlockNumber   *uint64
	ChainID       int64
}

type responseEnvelope struct {
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func NewClient(url string, chainID int64, timeout time.Duration) *Client {
	return &Client{
		url:     url,
		chainID: chainID,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func newClientWithHTTPClient(url string, chainID int64, httpClient *http.Client) *Client {
	return &Client{
		url:        url,
		chainID:    chainID,
		httpClient: httpClient,
	}
}

func (c *Client) HTTPAvailability(ctx context.Context) Measurement {
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader([]byte(`{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}`)))
	if err != nil {
		return failedMeasurement("eth_chainId", time.Since(start), "request_build", err.Error())
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return failedMeasurement("eth_chainId", time.Since(start), "network", err.Error())
	}
	defer resp.Body.Close()

	if _, err := io.Copy(io.Discard, resp.Body); err != nil {
		return failedMeasurement("eth_chainId", time.Since(start), "read", err.Error())
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return failedMeasurement("eth_chainId", time.Since(start), "http_status", strconv.Itoa(resp.StatusCode))
	}

	return Measurement{
		Method:  "eth_chainId",
		Latency: time.Since(start),
		Success: true,
	}
}

func (c *Client) EthChainID(ctx context.Context) Measurement {
	result, latency, err := c.call(ctx, "eth_chainId")
	if err != nil {
		return classifyRPCError("eth_chainId", latency, err)
	}

	chainID, err := parseHexUint64(result)
	if err != nil {
		return failedMeasurement("eth_chainId", latency, "invalid_result", err.Error())
	}

	if int64(chainID) != c.chainID {
		return Measurement{
			Method:        "eth_chainId",
			Latency:       latency,
			Success:       false,
			ErrorCategory: "wrong_chain",
			ErrorCode:     fmt.Sprintf("expected_%d_got_%d", c.chainID, chainID),
			ChainID:       int64(chainID),
		}
	}

	return Measurement{
		Method:     "eth_chainId",
		Latency:    latency,
		Success:    true,
		ResultHash: hashJSON(result),
		ChainID:    int64(chainID),
	}
}

func (c *Client) EthBlockNumber(ctx context.Context) Measurement {
	result, latency, err := c.call(ctx, "eth_blockNumber")
	if err != nil {
		return classifyRPCError("eth_blockNumber", latency, err)
	}

	blockNumber, err := parseHexUint64(result)
	if err != nil {
		return failedMeasurement("eth_blockNumber", latency, "invalid_result", err.Error())
	}

	return Measurement{
		Method:      "eth_blockNumber",
		Latency:     latency,
		Success:     true,
		ResultHash:  hashJSON(result),
		BlockNumber: &blockNumber,
	}
}

func (c *Client) call(ctx context.Context, method string) (json.RawMessage, time.Duration, error) {
	body := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  method,
		"params":  []any{},
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return nil, 0, err
	}

	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(encoded))
	if err != nil {
		return nil, time.Since(start), err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, time.Since(start), err
	}
	defer resp.Body.Close()

	responseData, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, time.Since(start), err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, time.Since(start), fmt.Errorf("http status %d", resp.StatusCode)
	}

	var envelope responseEnvelope
	if err := json.Unmarshal(responseData, &envelope); err != nil {
		return nil, time.Since(start), err
	}

	if envelope.Error != nil {
		return nil, time.Since(start), fmt.Errorf("rpc error %d: %s", envelope.Error.Code, envelope.Error.Message)
	}

	if len(envelope.Result) == 0 {
		return nil, time.Since(start), errors.New("missing result")
	}

	return envelope.Result, time.Since(start), nil
}

func parseHexUint64(raw json.RawMessage) (uint64, error) {
	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		return 0, err
	}

	text = strings.TrimPrefix(text, "0x")
	if text == "" {
		return 0, errors.New("empty hex value")
	}

	return strconv.ParseUint(text, 16, 64)
}

func classifyRPCError(method string, latency time.Duration, err error) Measurement {
	category := "rpc"
	if errors.Is(err, context.DeadlineExceeded) {
		category = "timeout"
	}
	return failedMeasurement(method, latency, category, err.Error())
}

func failedMeasurement(method string, latency time.Duration, category string, code string) Measurement {
	return Measurement{
		Method:        method,
		Latency:       latency,
		Success:       false,
		ErrorCategory: category,
		ErrorCode:     code,
	}
}

func hashJSON(raw json.RawMessage) string {
	return "0x" + fmt.Sprintf("%x", crypto.Keccak256(raw))
}
