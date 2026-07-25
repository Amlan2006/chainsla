package rpc

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"testing"
)

func TestEthBlockNumber(t *testing.T) {
	client := testClient(1, `{"jsonrpc":"2.0","id":1,"result":"0x2a"}`)
	measurement := client.EthBlockNumber(context.Background())

	if !measurement.Success {
		t.Fatalf("expected success, got category=%q code=%q", measurement.ErrorCategory, measurement.ErrorCode)
	}
	if measurement.BlockNumber == nil || *measurement.BlockNumber != 42 {
		t.Fatalf("expected block 42, got %v", measurement.BlockNumber)
	}
}

func TestEthChainIDRejectsWrongChain(t *testing.T) {
	client := testClient(8453, `{"jsonrpc":"2.0","id":1,"result":"0x1"}`)
	measurement := client.EthChainID(context.Background())

	if measurement.Success {
		t.Fatal("expected wrong chain failure")
	}
	if measurement.ErrorCategory != "wrong_chain" {
		t.Fatalf("expected wrong_chain category, got %q", measurement.ErrorCategory)
	}
}

func testClient(chainID int64, body string) *Client {
	return newClientWithHTTPClient("http://rpc.test", chainID, &http.Client{
		Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewBufferString(body)),
				Header:     make(http.Header),
			}, nil
		}),
	})
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
