import { defineConfig } from "agentqa";

// Sample host-project config consumed by AgentQA. Detected framework: next.
export default defineConfig({
  agents: {
    functional: { enabled: true, scope: ["src/**", "app/**"] },
    regression: { enabled: true, depth: "shallow" },
    smoke: {
      enabled: true,
      baseUrl: process.env.AGENTQA_PREVIEW_URL ?? "http://localhost:3000",
      routes: ["/", "/about"],
    },
    custom: [],
  },
  reporters: ["json", "markdown", "github-pr-comment"],
  gate: { failOn: ["critical"] },
  budget: { maxTotalUsd: 0.5 },
});
