package config

import (
	"errors"
	"flag"
	"os"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Monitor    MonitorConfig    `yaml:"monitor"`
	Aggregator AggregatorConfig `yaml:"aggregator"`
	Runtime    RuntimeConfig    `yaml:"runtime"`
	Endpoint   EndpointConfig   `yaml:"endpoint"`
}

type MonitorConfig struct {
	ID         string `yaml:"id"`
	PrivateKey string `yaml:"privateKey"`
	Region     string `yaml:"region"`
	Country    string `yaml:"country"`
	Cloud      string `yaml:"cloudProvider"`
	ASN        string `yaml:"asn"`
}

type AggregatorConfig struct {
	URL    string `yaml:"url"`
	APIKey string `yaml:"apiKey"`
}

type RuntimeConfig struct {
	HealthAddr      string        `yaml:"healthAddr"`
	QueuePath       string        `yaml:"queuePath"`
	Interval        time.Duration `yaml:"-"`
	IntervalSeconds int           `yaml:"intervalSeconds"`
	Timeout         time.Duration `yaml:"-"`
	TimeoutMS       int           `yaml:"timeoutMs"`
	LogLevel        string        `yaml:"logLevel"`
}

type EndpointConfig struct {
	ID      string `yaml:"id"`
	HTTPURL string `yaml:"httpUrl"`
	ChainID int64  `yaml:"chainId"`
}

func Load(args []string, env map[string]string) (Config, error) {
	fs := flag.NewFlagSet("monitor-node", flag.ContinueOnError)
	configPath := fs.String("config", "", "path to YAML config")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}

	cfg := defaults()
	if *configPath != "" {
		fileCfg, err := loadYAML(*configPath)
		if err != nil {
			return Config{}, err
		}
		cfg = merge(cfg, fileCfg)
	}

	applyEnv(&cfg, env)
	normalizeDurations(&cfg)

	if err := validate(cfg); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func EnvMap() map[string]string {
	env := make(map[string]string)
	for _, key := range []string{
		"MONITOR_ID",
		"MONITOR_PRIVATE_KEY",
		"MONITOR_REGION",
		"MONITOR_COUNTRY",
		"MONITOR_CLOUD_PROVIDER",
		"MONITOR_ASN",
		"MONITOR_HEALTH_ADDR",
		"MONITOR_RPC_HTTP_URL",
		"MONITOR_ENDPOINT_ID",
		"MONITOR_CHAIN_ID",
		"MONITOR_INTERVAL_SECONDS",
		"MONITOR_TIMEOUT_MS",
		"MONITOR_API_KEY",
		"AGGREGATOR_URL",
		"REPORT_QUEUE_PATH",
		"LOG_LEVEL",
	} {
		env[key] = os.Getenv(key)
	}
	return env
}

func defaults() Config {
	return Config{
		Monitor: MonitorConfig{
			ID:      "monitor-local-1",
			Region:  "local",
			Country: "LOCAL",
			Cloud:   "local",
			ASN:     "AS0",
		},
		Aggregator: AggregatorConfig{
			URL: "http://localhost:4000",
		},
		Runtime: RuntimeConfig{
			HealthAddr:      ":8081",
			QueuePath:       "data/monitor-local-1/reports.jsonl",
			IntervalSeconds: 30,
			TimeoutMS:       5000,
			LogLevel:        "info",
		},
		Endpoint: EndpointConfig{
			ID:      "endpoint-local-1",
			ChainID: 1,
		},
	}
}

func loadYAML(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func merge(base Config, override Config) Config {
	if override.Monitor.ID != "" {
		base.Monitor.ID = override.Monitor.ID
	}
	if override.Monitor.PrivateKey != "" {
		base.Monitor.PrivateKey = override.Monitor.PrivateKey
	}
	if override.Monitor.Region != "" {
		base.Monitor.Region = override.Monitor.Region
	}
	if override.Monitor.Country != "" {
		base.Monitor.Country = override.Monitor.Country
	}
	if override.Monitor.Cloud != "" {
		base.Monitor.Cloud = override.Monitor.Cloud
	}
	if override.Monitor.ASN != "" {
		base.Monitor.ASN = override.Monitor.ASN
	}
	if override.Aggregator.URL != "" {
		base.Aggregator.URL = override.Aggregator.URL
	}
	if override.Aggregator.APIKey != "" {
		base.Aggregator.APIKey = override.Aggregator.APIKey
	}
	if override.Runtime.HealthAddr != "" {
		base.Runtime.HealthAddr = override.Runtime.HealthAddr
	}
	if override.Runtime.QueuePath != "" {
		base.Runtime.QueuePath = override.Runtime.QueuePath
	}
	if override.Runtime.IntervalSeconds != 0 {
		base.Runtime.IntervalSeconds = override.Runtime.IntervalSeconds
	}
	if override.Runtime.TimeoutMS != 0 {
		base.Runtime.TimeoutMS = override.Runtime.TimeoutMS
	}
	if override.Runtime.LogLevel != "" {
		base.Runtime.LogLevel = override.Runtime.LogLevel
	}
	if override.Endpoint.ID != "" {
		base.Endpoint.ID = override.Endpoint.ID
	}
	if override.Endpoint.HTTPURL != "" {
		base.Endpoint.HTTPURL = override.Endpoint.HTTPURL
	}
	if override.Endpoint.ChainID != 0 {
		base.Endpoint.ChainID = override.Endpoint.ChainID
	}
	return base
}

func applyEnv(cfg *Config, env map[string]string) {
	setString(&cfg.Monitor.ID, env["MONITOR_ID"])
	setString(&cfg.Monitor.PrivateKey, env["MONITOR_PRIVATE_KEY"])
	setString(&cfg.Monitor.Region, env["MONITOR_REGION"])
	setString(&cfg.Monitor.Country, env["MONITOR_COUNTRY"])
	setString(&cfg.Monitor.Cloud, env["MONITOR_CLOUD_PROVIDER"])
	setString(&cfg.Monitor.ASN, env["MONITOR_ASN"])
	setString(&cfg.Runtime.HealthAddr, env["MONITOR_HEALTH_ADDR"])
	setString(&cfg.Endpoint.HTTPURL, env["MONITOR_RPC_HTTP_URL"])
	setString(&cfg.Endpoint.ID, env["MONITOR_ENDPOINT_ID"])
	setString(&cfg.Aggregator.APIKey, env["MONITOR_API_KEY"])
	setString(&cfg.Aggregator.URL, env["AGGREGATOR_URL"])
	setString(&cfg.Runtime.QueuePath, env["REPORT_QUEUE_PATH"])
	setString(&cfg.Runtime.LogLevel, env["LOG_LEVEL"])

	if value := env["MONITOR_CHAIN_ID"]; value != "" {
		if parsed, err := strconv.ParseInt(value, 10, 64); err == nil {
			cfg.Endpoint.ChainID = parsed
		}
	}
	if value := env["MONITOR_INTERVAL_SECONDS"]; value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			cfg.Runtime.IntervalSeconds = parsed
		}
	}
	if value := env["MONITOR_TIMEOUT_MS"]; value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			cfg.Runtime.TimeoutMS = parsed
		}
	}
}

func setString(target *string, value string) {
	if value != "" {
		*target = value
	}
}

func normalizeDurations(cfg *Config) {
	cfg.Runtime.Interval = time.Duration(cfg.Runtime.IntervalSeconds) * time.Second
	cfg.Runtime.Timeout = time.Duration(cfg.Runtime.TimeoutMS) * time.Millisecond
}

func validate(cfg Config) error {
	if cfg.Monitor.ID == "" {
		return errors.New("monitor id is required")
	}
	if cfg.Monitor.PrivateKey == "" {
		return errors.New("monitor private key is required")
	}
	if cfg.Endpoint.HTTPURL == "" {
		return errors.New("monitor rpc http url is required")
	}
	if cfg.Endpoint.ChainID <= 0 {
		return errors.New("endpoint chain id must be positive")
	}
	if cfg.Runtime.Interval <= 0 {
		return errors.New("monitor interval must be positive")
	}
	if cfg.Runtime.Timeout <= 0 {
		return errors.New("monitor timeout must be positive")
	}
	return nil
}
