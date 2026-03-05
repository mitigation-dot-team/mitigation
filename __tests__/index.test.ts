/**
 * Unit tests for index.ts - GitHub Action entrypoint (run() orchestrator)
 *
 * Mocking strategy:
 *  - require.cache injection: we pre-load each dependency so it has a cache
 *    entry, then replace that entry's `exports` with our mock object before
 *    each call to triggerRun(). This is a reliable CJS-native technique that
 *    requires no experimental Node flags and no third-party mocking libraries.
 *  - index.ts calls run() at module level. Each test clears it from the cache
 *    and re-requires it, re-triggering run().
 *  - A short setTimeout flush lets the full async call-chain settle.
 */

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Pre-load dependencies to establish their require.cache entries.
require("@actions/core");
require("@actions/github");
require("@mitigation-dot-team/core");

// ---------------------------------------------------------------------------
// Mutable scenario
// ---------------------------------------------------------------------------

interface PR {
  additions: number;
  deletions: number;
  changed_files: number;
  title: string;
  body: string | null;
}

interface Scenario {
  inputs: Record<string, string>;
  isPR: boolean;
  pr: PR;
  files: { filename: string }[];
  comments: { id: number; body: string }[];
  planConfig: object;
  runAnalysisResult: {
    finalScore: number;
    finalLevel: string;
    commentBody: string;
    heuristicScore: number;
    llmAnalysis: { score: number; justification: string } | null;
  };
  validateApiKeyThrows: Error | null;
  enforcePlanThrows: Error | null;
  runAnalysisThrows: Error | null;
  // Captured side-effects
  setFailedCalls: string[];
  setOutputCalls: Record<string, string>;
  infoCalls: string[];
  createCommentCalls: number;
  updateCommentCalls: number;
}

function defaultScenario(): Scenario {
  return {
    inputs: {
      "mergeshield-api-key": "ms-key",
      "github-token": "ghp-token",
      "llm-api-key": "",
      "llm-provider": "openai",
      "llm-model": "",
      "enable-llm": "false",
      "risk-threshold": "7",
      "webhook-url": "",
      "webhook-secret": "",
      "internal-reporter-url": "",
      "internal-reporter-secret": "",
      "comment-language": "en",
    },
    isPR: true,
    pr: {
      additions: 100,
      deletions: 20,
      changed_files: 5,
      title: "feat: add tests",
      body: "This PR adds tests.",
    },
    files: [{ filename: "src/app.ts" }, { filename: "src/utils.ts" }],
    comments: [],
    planConfig: {
      plan: "starter",
      repos: ["owner/repo"],
      webhookEnabled: false,
      reporterEnabled: false,
      customModelsEnabled: false,
      allowedProviders: ["openai"],
    },
    runAnalysisResult: {
      finalScore: 4,
      finalLevel: "low",
      commentBody: "<!-- mergeshield-analysis -->\n## Risk: 4/10 - LOW",
      heuristicScore: 4,
      llmAnalysis: null,
    },
    validateApiKeyThrows: null,
    enforcePlanThrows: null,
    runAnalysisThrows: null,
    setFailedCalls: [],
    setOutputCalls: {},
    infoCalls: [],
    createCommentCalls: 0,
    updateCommentCalls: 0,
  };
}

let s = defaultScenario();

// ---------------------------------------------------------------------------
// Cache keys
// ---------------------------------------------------------------------------

const CORE_KEY = require.resolve("@actions/core");
const GITHUB_KEY = require.resolve("@actions/github");
const CORE_LIB_KEY = require.resolve("@mitigation-dot-team/core");

/**
 * Inject mock exports for all three dependencies, then fresh-require index.ts
 * so that run() executes with the mocked modules. Waits long enough for the
 * internal async call-chain to complete.
 */
async function triggerRun(): Promise<void> {
  // -- @actions/core mock --------------------------------------------------
  require.cache[CORE_KEY]!.exports = {
    getInput(name: string, opts?: { required?: boolean }): string {
      const val = s.inputs[name] ?? "";
      if (opts?.required && !val) {
        throw new Error(`Input required and not supplied: ${name}`);
      }
      return val;
    },
    setFailed(msg: unknown): void {
      s.setFailedCalls.push(String(msg));
    },
    setOutput(k: string, v: unknown): void {
      s.setOutputCalls[k] = String(v);
    },
    info(msg: string): void {
      s.infoCalls.push(msg);
    },
    warning(): void {},
  };

  // -- @actions/github mock ------------------------------------------------
  require.cache[GITHUB_KEY]!.exports = {
    getOctokit() {
      return {
        rest: {
          pulls: {
            async get(opts: { mediaType?: { format?: string } }) {
              if (opts?.mediaType?.format === "diff") {
                return {
                  data: "--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new",
                };
              }
              return { data: s.pr };
            },
            async listFiles() {
              return { data: s.files };
            },
          },
          issues: {
            async listComments() {
              return { data: s.comments };
            },
            async createComment() {
              s.createCommentCalls++;
            },
            async updateComment() {
              s.updateCommentCalls++;
            },
          },
        },
      };
    },
    context: new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "payload") {
            return {
              pull_request: s.isPR
                ? {
                    number: 42,
                    user: { login: "dev" },
                    html_url: "https://github.com/owner/repo/pull/42",
                    created_at: "2026-01-01T00:00:00Z",
                  }
                : undefined,
              repository: {
                html_url: "https://github.com/owner/repo",
                private: false,
              },
            };
          }
          if (prop === "repo") return { owner: "owner", repo: "repo" };
          if (prop === "runId") return 1;
          if (prop === "runNumber") return 1;
          return undefined;
        },
      }
    ),
  };

  // -- @mitigation-dot-team/core mock --------------------------------------
  require.cache[CORE_LIB_KEY]!.exports = {
    async validateApiKey() {
      if (s.validateApiKeyThrows) throw s.validateApiKeyThrows;
      return s.planConfig;
    },
    enforcePlanRestrictions() {
      if (s.enforcePlanThrows) throw s.enforcePlanThrows;
    },
    async runAnalysis() {
      if (s.runAnalysisThrows) throw s.runAnalysisThrows;
      return s.runAnalysisResult;
    },
  };

  // Fresh-require index.ts so run() is called with the current mocks.
  const indexKey = require.resolve("../index");
  delete require.cache[indexKey];
  require("../index");

  // Allow the async chain inside run() to fully settle.
  await new Promise<void>((r) => setTimeout(r, 80));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("index.ts - run()", () => {
  beforeEach(() => {
    s = defaultScenario();
  });

  test("fails immediately when event is not a pull_request", async () => {
    s.isPR = false;

    await triggerRun();

    assert.equal(s.setFailedCalls.length, 1);
    assert.ok(
      s.setFailedCalls[0]!.includes("pull_request"),
      `Expected message to mention 'pull_request', got: "${s.setFailedCalls[0]}"`
    );
    assert.equal(s.createCommentCalls, 0);
    assert.equal(s.updateCommentCalls, 0);
  });

  test("fails when validateApiKey throws", async () => {
    s.validateApiKeyThrows = new Error("Invalid API key");

    await triggerRun();

    assert.equal(s.setFailedCalls.length, 1);
    assert.ok(
      s.setFailedCalls[0]!.includes("Invalid API key"),
      `Expected error message in setFailed, got: "${s.setFailedCalls[0]}"`
    );
  });

  test("fails when enforcePlanRestrictions throws", async () => {
    s.enforcePlanThrows = new Error("Repo not allowed on this plan");

    await triggerRun();

    assert.equal(s.setFailedCalls.length, 1);
    assert.ok(
      s.setFailedCalls[0]!.includes("Repo not allowed on this plan"),
      `Expected plan error in setFailed, got: "${s.setFailedCalls[0]}"`
    );
  });

  test("happy path - creates new comment and sets outputs when score < threshold", async () => {
    // Default: score = 4, threshold = 7, no existing comments.
    await triggerRun();

    assert.equal(s.setFailedCalls.length, 0, "Should not fail CI for low risk");
    assert.equal(s.createCommentCalls, 1, "Should create one comment");
    assert.equal(s.updateCommentCalls, 0, "Should not update (no existing comment)");

    assert.equal(s.setOutputCalls["risk-score"], "4");
    assert.equal(s.setOutputCalls["risk-level"], "low");
    assert.equal(s.setOutputCalls["heuristic-score"], "4");
  });

  test("happy path - updates existing comment instead of creating a new one", async () => {
    s.comments = [{ id: 101, body: "<!-- mergeshield-analysis -->\n## Risk: 3/10" }];

    await triggerRun();

    assert.equal(s.setFailedCalls.length, 0);
    assert.equal(s.updateCommentCalls, 1, "Should update the existing comment");
    assert.equal(s.createCommentCalls, 0, "Should NOT create a duplicate comment");
  });

  test("fails CI when final score meets or exceeds risk-threshold", async () => {
    s.inputs["risk-threshold"] = "7";
    s.runAnalysisResult = {
      ...s.runAnalysisResult,
      finalScore: 8,
      finalLevel: "medium",
      commentBody: "<!-- mergeshield-analysis -->\n## Risk: 8/10 - MEDIUM",
      heuristicScore: 8,
    };

    await triggerRun();

    assert.equal(s.setFailedCalls.length, 1, "Should fail CI");
    const msg = s.setFailedCalls[0]!;
    assert.ok(msg.includes("8"), `Expected score 8 in message, got: "${msg}"`);
    assert.ok(
      msg.includes("MEDIUM") || msg.includes("medium"),
      `Expected level in message, got: "${msg}"`
    );
  });

  test("does NOT fail CI when final score is exactly below threshold", async () => {
    s.inputs["risk-threshold"] = "7";
    s.runAnalysisResult = { ...s.runAnalysisResult, finalScore: 6, finalLevel: "medium" };

    await triggerRun();

    assert.equal(s.setFailedCalls.length, 0);
  });

  test("sets LLM outputs when analysis returns llmAnalysis data", async () => {
    s.inputs["enable-llm"] = "true";
    s.inputs["llm-api-key"] = "sk-openai-key";
    s.runAnalysisResult = {
      ...s.runAnalysisResult,
      finalScore: 6.2,
      llmAnalysis: {
        score: 7,
        justification: "Complex refactor with broad surface area.",
      },
    };

    await triggerRun();

    assert.equal(s.setOutputCalls["llm-score"], "7");
    assert.equal(
      s.setOutputCalls["llm-justification"],
      "Complex refactor with broad surface area."
    );
  });

  test("does NOT set LLM outputs when enable-llm is true but llm-api-key is missing", async () => {
    s.inputs["enable-llm"] = "true";
    s.inputs["llm-api-key"] = ""; // no key -> enableLLM = false
    s.runAnalysisResult = { ...s.runAnalysisResult, llmAnalysis: null };

    await triggerRun();

    assert.equal(
      s.setOutputCalls["llm-score"],
      undefined,
      "Should not set llm-score when no API key is provided"
    );
    assert.equal(
      s.setOutputCalls["llm-justification"],
      undefined,
      "Should not set llm-justification when no API key is provided"
    );
  });

  test("propagates runAnalysis errors to setFailed", async () => {
    s.runAnalysisThrows = new Error("LLM request timed out");

    await triggerRun();

    assert.equal(s.setFailedCalls.length, 1);
    assert.ok(
      s.setFailedCalls[0]!.includes("LLM request timed out"),
      `Expected error message in setFailed, got: "${s.setFailedCalls[0]}"`
    );
  });

  test("passes correct PR data to runAnalysis and completes successfully", async () => {
    s.pr = {
      additions: 250,
      deletions: 30,
      changed_files: 8,
      title: "refactor: big change",
      body: "Large refactor",
    };
    s.files = [{ filename: "src/a.ts" }, { filename: "db/migration.sql" }];

    await triggerRun();

    assert.equal(s.setFailedCalls.length, 0);
    assert.equal(s.setOutputCalls["risk-score"], "4");
  });
});
