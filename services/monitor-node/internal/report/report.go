package report

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
)

type CheckType string

const (
	CheckHTTPAvailability CheckType = "HTTP_AVAILABILITY"
	CheckEthChainID       CheckType = "ETH_CHAIN_ID"
	CheckEthBlockNumber   CheckType = "ETH_BLOCK_NUMBER"
)

type Payload struct {
	ProtocolVersion   string    `json:"protocolVersion"`
	ReportID          string    `json:"reportId"`
	MonitorID         string    `json:"monitorId"`
	EndpointID        string    `json:"endpointId"`
	ChainID           int64     `json:"chainId"`
	CheckType         CheckType `json:"checkType"`
	MeasurementWindow int64     `json:"measurementWindow"`
	StartedAt         int64     `json:"startedAt"`
	FinishedAt        int64     `json:"finishedAt"`
	LatencyMS         int64     `json:"latencyMs"`
	Success           bool      `json:"success"`
	ErrorCategory     string    `json:"errorCategory,omitempty"`
	ErrorCode         string    `json:"errorCode,omitempty"`
	RPCMethod         string    `json:"rpcMethod,omitempty"`
	ResultHash        string    `json:"resultHash,omitempty"`
	BlockNumber       *uint64   `json:"blockNumber,omitempty"`
	Nonce             uint64    `json:"nonce"`
	SoftwareVersion   string    `json:"softwareVersion"`
}

type SignedReport struct {
	Payload     Payload `json:"payload"`
	PayloadHash string  `json:"payloadHash"`
	Signature   string  `json:"signature"`
}

func NewID() (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}

	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80

	return strings.Join([]string{
		hex.EncodeToString(bytes[0:4]),
		hex.EncodeToString(bytes[4:6]),
		hex.EncodeToString(bytes[6:8]),
		hex.EncodeToString(bytes[8:10]),
		hex.EncodeToString(bytes[10:16]),
	}, "-"), nil
}

func HashPayload(payload Payload) (string, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return "0x" + hex.EncodeToString(crypto.Keccak256(data)), nil
}

func HashResult(result json.RawMessage) string {
	return "0x" + hex.EncodeToString(crypto.Keccak256(result))
}

func SignPayload(payload Payload, privateKeyHex string) (SignedReport, error) {
	payloadHash, err := HashPayload(payload)
	if err != nil {
		return SignedReport{}, err
	}

	privateKeyHex = strings.TrimPrefix(privateKeyHex, "0x")
	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return SignedReport{}, err
	}

	hashBytes, err := hex.DecodeString(strings.TrimPrefix(payloadHash, "0x"))
	if err != nil {
		return SignedReport{}, err
	}

	signature, err := crypto.Sign(hashBytes, privateKey)
	if err != nil {
		return SignedReport{}, err
	}

	return SignedReport{
		Payload:     payload,
		PayloadHash: payloadHash,
		Signature:   "0x" + hex.EncodeToString(signature),
	}, nil
}

func MeasurementWindow(t time.Time, interval time.Duration) int64 {
	if interval <= 0 {
		return t.Unix()
	}
	seconds := int64(interval.Seconds())
	return (t.Unix() / seconds) * seconds
}

func ValidateSignedReport(signed SignedReport) error {
	if signed.Payload.ReportID == "" {
		return errors.New("report id is required")
	}
	if signed.PayloadHash == "" {
		return errors.New("payload hash is required")
	}
	if signed.Signature == "" {
		return errors.New("signature is required")
	}
	return nil
}
