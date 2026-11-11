import type { AgentType } from "../services/task.service.js";

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  agent_type: AgentType;
  priority: number;
  input: Record<string, unknown>;
}

export interface AgentExecutionResult {
  summary: string;
  findings: string[];
  limitations: string[];
  recommended_next_steps: string[];

  sources?: Array<{
    title: string;
    url: string;
  }>;

  search_queries?: string[];
  research_method?: string;
  researched_at?: string;
}

export interface DepartmentAgent {
  readonly type: AgentType;

  execute(task: AgentTask): Promise<AgentExecutionResult>;
}
