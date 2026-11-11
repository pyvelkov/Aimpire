import type {
  AgentType,
} from "../services/task.service.js";
import type { DepartmentAgent } from "./types.js";
import { ResearchAgent } from "./research/research.agent.js";

export class AgentRegistry {
  private agents = new Map<AgentType, DepartmentAgent>();

  register(agent: DepartmentAgent) {
    if (this.agents.has(agent.type)) {
      throw new Error(
        `Agent already registered: ${agent.type}`
      );
    }

    this.agents.set(agent.type, agent);
  }

  get(agentType: AgentType): DepartmentAgent {
    const agent = this.agents.get(agentType);

    if (!agent) {
      throw new Error(
        `No agent registered for: ${agentType}`
      );
    }

    return agent;
  }

  has(agentType: AgentType): boolean {
    return this.agents.has(agentType);
  }
}

export const agentRegistry = new AgentRegistry();

agentRegistry.register(new ResearchAgent());
