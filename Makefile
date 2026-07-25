GO_CACHE := $(CURDIR)/.cache/go-build

ENV_DATABASE_URL := $(DATABASE_URL)
ENV_MONITOR_API_KEY := $(MONITOR_API_KEY)
ENV_MONITOR_PRIVATE_KEY := $(MONITOR_PRIVATE_KEY)
ENV_MONITOR_RPC_HTTP_URL := $(MONITOR_RPC_HTTP_URL)
ENV_MONITOR_CHAIN_ID := $(MONITOR_CHAIN_ID)

-include .env
export

ifneq ($(ENV_DATABASE_URL),)
DATABASE_URL := $(ENV_DATABASE_URL)
endif
ifneq ($(ENV_MONITOR_API_KEY),)
MONITOR_API_KEY := $(ENV_MONITOR_API_KEY)
endif
ifneq ($(ENV_MONITOR_PRIVATE_KEY),)
MONITOR_PRIVATE_KEY := $(ENV_MONITOR_PRIVATE_KEY)
endif
ifneq ($(ENV_MONITOR_RPC_HTTP_URL),)
MONITOR_RPC_HTTP_URL := $(ENV_MONITOR_RPC_HTTP_URL)
endif
ifneq ($(ENV_MONITOR_CHAIN_ID),)
MONITOR_CHAIN_ID := $(ENV_MONITOR_CHAIN_ID)
endif

.PHONY: install dev-infra dev-api dev-worker dev-dashboard dev-monitor-1 dev-monitor-2 dev-monitor-3 test lint build contracts-build contracts-test go-test

install:
	npm install

dev-infra:
	docker compose up postgres redis

dev-api:
	npm run dev:api

dev-worker:
	npm run dev:worker

dev-dashboard:
	npm run dev:dashboard

dev-monitor-1:
	cd services/monitor-node && GOCACHE=$(GO_CACHE) MONITOR_ID=monitor-local-1 MONITOR_ENDPOINT_ID=endpoint-local-1 MONITOR_HEALTH_ADDR=:8081 REPORT_QUEUE_PATH=data/monitor-local-1/reports.jsonl go run ./cmd/monitor-node

dev-monitor-2:
	cd services/monitor-node && GOCACHE=$(GO_CACHE) MONITOR_ID=monitor-local-2 MONITOR_ENDPOINT_ID=endpoint-local-1 MONITOR_HEALTH_ADDR=:8082 REPORT_QUEUE_PATH=data/monitor-local-2/reports.jsonl go run ./cmd/monitor-node

dev-monitor-3:
	cd services/monitor-node && GOCACHE=$(GO_CACHE) MONITOR_ID=monitor-local-3 MONITOR_ENDPOINT_ID=endpoint-local-1 MONITOR_HEALTH_ADDR=:8083 REPORT_QUEUE_PATH=data/monitor-local-3/reports.jsonl go run ./cmd/monitor-node

test: go-test
	npm run test

lint:
	npm run lint

build:
	npm run build

contracts-build:
	cd contracts && forge build

contracts-test:
	cd contracts && forge test

go-test:
	cd services/monitor-node && GOCACHE=$(GO_CACHE) go test ./...
