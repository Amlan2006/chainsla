export type ServiceStatus = "healthy" | "degraded" | "offline";

export interface ProviderSummary {
  id: string;
  name: string;
  website?: string;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RpcEndpointSummary {
  id: string;
  providerId: string;
  chainId: number;
  networkName: string;
  isPublic: boolean;
  status: ServiceStatus;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  version: string;
}
