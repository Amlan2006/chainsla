package queue

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"github.com/rpc-sla/platform/services/monitor-node/internal/report"
)

type FileQueue struct {
	path string
}

func NewFileQueue(path string) FileQueue {
	return FileQueue{path: path}
}

func (q FileQueue) Append(signed report.SignedReport) error {
	if err := report.ValidateSignedReport(signed); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(q.path), 0o755); err != nil {
		return err
	}

	file, err := os.OpenFile(q.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()

	data, err := json.Marshal(signed)
	if err != nil {
		return err
	}

	if _, err := file.Write(append(data, '\n')); err != nil {
		return err
	}
	return nil
}

func (q FileQueue) ReadAll() ([]report.SignedReport, error) {
	file, err := os.Open(q.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var reports []report.SignedReport
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var signed report.SignedReport
		if err := json.Unmarshal(scanner.Bytes(), &signed); err != nil {
			return nil, err
		}
		reports = append(reports, signed)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return reports, nil
}

func (q FileQueue) ReplaceAll(reports []report.SignedReport) error {
	if err := os.MkdirAll(filepath.Dir(q.path), 0o755); err != nil {
		return err
	}

	file, err := os.OpenFile(q.path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()

	for _, signed := range reports {
		if err := report.ValidateSignedReport(signed); err != nil {
			return err
		}
		data, err := json.Marshal(signed)
		if err != nil {
			return err
		}
		if _, err := file.Write(append(data, '\n')); err != nil {
			return err
		}
	}

	return nil
}
