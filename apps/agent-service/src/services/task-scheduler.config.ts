import { AGENT_TYPES, type AgentTypeName } from "./agent-operations.service.js";
import { MAX_CLAIM_LEASE_SECONDS, MIN_CLAIM_LEASE_SECONDS } from "./task-claim.js";

export const SCHEDULER_STAGE = "7.2.1";

/**
 * Stage 7.2.1 prepares claim_agent_task_by_id and still refuses to call it.
 */
export const SCHEDULER_CLAIMS_PERMITTED = false;

export const DEFAULT_SCHEDULER_CONFIG = {
  enabled: false,
  dryRun: true,
  pollIntervalMs: 30_000,
  maxConcurrentTasks: 1,
  maxClaimsPerCycle: 1,
  leaseSeconds: 120,
  supportedAgentTypes: ["research"] as AgentTypeName[],
} as const;

export type SchedulerConfig = {
  enabled: boolean;
  dryRun: boolean;
  pollIntervalMs: number;
  maxConcurrentTasks: number;
  maxClaimsPerCycle: number;
  leaseSeconds: number;
  supportedAgentTypes: AgentTypeName[];
};

const MIN_POLL_INTERVAL_MS = 5_000;
const MAX_POLL_INTERVAL_MS = 3_600_000;

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function booleanDefault(value: string | undefined, fallback: boolean, enabledWhen: "true" | "false"): boolean {
  if (value == null) return fallback;
  if (enabledWhen === "true") return value === "true";
  return value === "false" ? false : fallback;
}

function integerDefault(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value == null) return fallback;
  if (!/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export function loadSchedulerConfig(env: NodeJS.ProcessEnv = process.env): SchedulerConfig {
  const supported = parseSupportedAgentTypes(envValue(env, "SCHEDULER_SUPPORTED_AGENT_TYPES"));
  return {
    enabled: booleanDefault(envValue(env, "SCHEDULER_ENABLED"), DEFAULT_SCHEDULER_CONFIG.enabled, "true"),
    dryRun: booleanDefault(envValue(env, "SCHEDULER_DRY_RUN"), DEFAULT_SCHEDULER_CONFIG.dryRun, "false"),
    pollIntervalMs: integerDefault(
      envValue(env, "SCHEDULER_POLL_INTERVAL_MS"),
      DEFAULT_SCHEDULER_CONFIG.pollIntervalMs,
      MIN_POLL_INTERVAL_MS,
      MAX_POLL_INTERVAL_MS,
    ),
    maxConcurrentTasks: integerDefault(
      envValue(env, "SCHEDULER_MAX_CONCURRENT_TASKS"),
      DEFAULT_SCHEDULER_CONFIG.maxConcurrentTasks,
      1,
      100,
    ),
    maxClaimsPerCycle: integerDefault(
      envValue(env, "SCHEDULER_MAX_CLAIMS_PER_CYCLE"),
      DEFAULT_SCHEDULER_CONFIG.maxClaimsPerCycle,
      1,
      100,
    ),
    leaseSeconds: integerDefault(
      envValue(env, "SCHEDULER_LEASE_SECONDS"),
      DEFAULT_SCHEDULER_CONFIG.leaseSeconds,
      MIN_CLAIM_LEASE_SECONDS,
      MAX_CLAIM_LEASE_SECONDS,
    ),
    supportedAgentTypes: supported,
  };
}

function parseSupportedAgentTypes(value: string | undefined): AgentTypeName[] {
  if (value == null) return [...DEFAULT_SCHEDULER_CONFIG.supportedAgentTypes];
  const allowed = new Set<string>(AGENT_TYPES);
  const selected: AgentTypeName[] = [];
  for (const part of value.split(",")) {
    const agentType = part.trim();
    if (!allowed.has(agentType) || selected.includes(agentType as AgentTypeName)) continue;
    selected.push(agentType as AgentTypeName);
  }
  return selected.length > 0 ? selected : [...DEFAULT_SCHEDULER_CONFIG.supportedAgentTypes];
}

export function publicSchedulerConfig(config: SchedulerConfig) {
  return {
    enabled: config.enabled,
    dry_run: config.dryRun,
    poll_interval_ms: config.pollIntervalMs,
    max_concurrent_tasks: config.maxConcurrentTasks,
    max_claims_per_cycle: config.maxClaimsPerCycle,
    lease_seconds: config.leaseSeconds,
    supported_agent_types: config.supportedAgentTypes,
    autonomous_execution: false,
    claims_permitted: SCHEDULER_CLAIMS_PERMITTED,
  };
}
