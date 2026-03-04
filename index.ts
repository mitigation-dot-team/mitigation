/**
 * Mitigation Team - GitHub Action Entrypoint (thin wrapper)
 */

import * as core from "@actions/core";
import * as github from "@actions/github";
import { validateApiKey, enforcePlanRestrictions, runAnalysis, PRData, SupportedLanguage  } from "@mitigation-dot-team/core";

const COMMENT_MARKER = "<!-- mergeshield-analysis -->";

async function run(): Promise<void> {
  try {
    // ── 1. Inputs ──────────────────────────────────────────────────────────
    const mergeShieldApiKey = core.getInput("mergeshield-api-key", { required: true });
    const token = core.getInput("github-token", { required: true });
    const llmApiKey = core.getInput("llm-api-key");
    const llmProvider = (core.getInput("llm-provider") || "openai").toLowerCase() as
      | "openai"
      | "claude"
      | "azure";
    const llmModel = core.getInput("llm-model");
    const enableLLM = core.getInput("enable-llm") === "true" && !!llmApiKey;
    const riskThreshold = parseInt(core.getInput("risk-threshold") || "7", 10);
    const webhookUrl = core.getInput("webhook-url");
    const webhookSecret = core.getInput("webhook-secret");
    const internalReporterUrl = core.getInput("internal-reporter-url");
    const internalReporterSecret = core.getInput("internal-reporter-secret");
    const commentLanguage = (core.getInput("comment-language") || "en") as SupportedLanguage;

    const octokit = github.getOctokit(token);
    const context = github.context;

    if (!context.payload.pull_request) {
      core.setFailed("This action only works on pull_request events.");
      return;
    }

    const prNumber = context.payload.pull_request.number;
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const fullRepo = `${owner}/${repo}`;

    // ── 2. Validate API key & enforce plan restrictions ────────────────────
    const planConfig = await validateApiKey(mergeShieldApiKey, fullRepo);

    enforcePlanRestrictions(planConfig, {
      repo: fullRepo,
      llmProvider: llmProvider || undefined,
      llmModel: llmModel || undefined,
      webhookUrl: webhookUrl || undefined,
      reporterUrl: internalReporterUrl || undefined,
    });

    core.info(`🛡️ Mitigation Team — Analyzing PR #${prNumber}...`);

    // ── 3. Fetch PR data via Octokit ───────────────────────────────────────
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 300,
    });

    const { data: diffData } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });

    const prData: PRData = {
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      filenames: files.map((f) => f.filename),
      title: pr.title,
      body: pr.body || "",
      diff: typeof diffData === "string" ? diffData : String(diffData),
    };

    core.info(`  📁 ${prData.changedFiles} files | +${prData.additions} / -${prData.deletions} lines`);

    // ── 4. Run analysis pipeline ───────────────────────────────────────────
    const { finalScore, finalLevel, commentBody, heuristicScore, llmAnalysis } = await runAnalysis({
      prData,
      planConfig,
      enableLLM,
      llmApiKey: llmApiKey || undefined,
      llmProvider,
      llmModel: llmModel || undefined,
      commentLanguage,
      reporterUrl: internalReporterUrl || undefined,
      reporterSecret: internalReporterSecret || undefined,
      webhookUrl: webhookUrl || undefined,
      webhookSecret: webhookSecret || undefined,
      context: {
        runId: context.runId,
        runNumber: context.runNumber,
        repoName: repo,
        repoOwner: owner,
        repoUrl: context.payload.repository?.html_url,
        isPrivate: context.payload.repository?.private,
        prNumber,
        prAuthor: context.payload.pull_request?.user?.login || "unknown",
        prUrl: context.payload.pull_request?.html_url,
        prCreatedAt: context.payload.pull_request?.created_at,
      },
    });

    // ── 5. Publish or update PR comment ───────────────────────────────────
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    const existingComment = comments.find((c) => c.body?.includes(COMMENT_MARKER));

    if (existingComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: commentBody,
      });
      core.info("  💬 Updated existing Mitigation Team comment.");
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody,
      });
      core.info("  💬 Created Mitigation Team comment on PR.");
    }

    // ── 6. Outputs & threshold check ──────────────────────────────────────
    core.setOutput("risk-score", finalScore.toString());
    core.setOutput("risk-level", finalLevel);
    core.setOutput("heuristic-score", heuristicScore.toString());

    if (llmAnalysis) {
      core.setOutput("llm-score", llmAnalysis.score.toString());
      core.setOutput("llm-justification", llmAnalysis.justification);
    }

    if (finalScore >= riskThreshold) {
      core.setFailed(
        `🔴 Mitigation Team: PR #${prNumber} have ${finalLevel.toUpperCase()} (${finalScore}/10) of risks. ` +
          `Threshold: ${riskThreshold}. Manual review is required.`
      );
    }
  } catch (error) {
    core.setFailed(`Mitigation Team error: ${(error as Error).message}`);
  }
}

run();
