import { Command } from 'commander';
import { createAdapter } from '../adapters/adapter-factory.js';
import { createPlatformReader, createPlatformWriter } from '../platforms/platform-factory.js';
import { createAIProvider } from '../providers/provider-factory.js';
import {
  buildStructuredOutput,
  formatAnalysisForConsole,
  formatAnalysisAsComment,
  analysisHasFindings,
  COMMENT_MARKER,
  writeOutputToFile,
} from '../output.js';
import { writeGitHubActionsOutputs, writeGitHubStepSummary } from '../output/ci-output.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { CONFIG } from '../utils/config.js';
import { validatePath, validate, AnalyzeOptionsSchema } from '../utils/validation.js';
import { createProgress, displaySection, OutputFormatter } from '../utils/cli-helpers.js';
import { loadSkipPatterns, applySkipPatterns } from '../utils/skip-patterns.js';
import type { ArchitecturalComponent } from '../adapters/architecture-types.js';
import type { DriftAnalysisPromptData } from '../analysis/analysis-types.js';

export function createAnalyzeCommand(): Command {
  return new Command('analyze')
    .description('Analyze a change request for architecture drift')
    .argument('<model-path>', 'Path to architecture models directory')
    .requiredOption('--url <url>', 'Change request URL (GitHub PR or GitLab MR)')
    .option('--model-format <format>', 'Architecture model format', 'likec4')
    .option('--generate-model', 'Generate architecture model code from analysis')
    .option('--output-file <path>', 'Write structured JSON output to file')
    .option('--format <format>', 'Output format (console, json)', 'console')
    .option('--open-pr', 'Create PR with model updates')
    .option('--dry-run', 'Skip PR creation (preview only)')
    .option('--draft', 'Create change request as draft', true)
    .option('--skip-file-filtering', 'Skip file filtering and analyze all changed files')
    .option('--comment', 'Post analysis results as a PR comment')
    .option('--github-actions', 'Write GitHub Actions outputs and step summary')
    .option('--fail-on-violations', 'Exit with code 1 when violations are found')
    .action(async (modelPath: string, options: unknown) => {
      const progress = createProgress();
      try {
        const validatedOptions = validate(AnalyzeOptionsSchema, options, 'command options');
        const adapter = createAdapter(validatedOptions.modelFormat);

        displaySection(`Loading ${adapter.metadata.displayName} Architecture Model`);
        validatePath(modelPath, 'directory');
        progress.start('Loading architecture model');
        await adapter.loadFromPath(modelPath);
        progress.succeed('Architecture model loaded');

        progress.start('Initializing AI provider');
        const provider = createAIProvider();
        progress.succeed('AI provider ready');

        displaySection('Fetching Change Request Data');
        const reader = createPlatformReader(validatedOptions.url);
        const ref = reader.parseChangeRequestUrl(validatedOptions.url);
        progress.start(`Fetching PR #${String(ref.number)}`);
        const prData = await reader.fetchChangeRequest(ref);
        const commits = await reader.fetchChangeRequestCommits(ref);
        progress.succeed(
          `Fetched PR #${String(prData.number)}: ${prData.title} (${String(commits.length)} commits)`
        );

        if (!validatedOptions.skipFileFiltering) {
          const patterns = loadSkipPatterns();
          const { included, excluded } = applySkipPatterns(prData.files, patterns);
          if (excluded > 0) {
            prData.files = included;
            prData.diff = included
              .map((f) => (f.patch ? `diff --git a/${f.filename} b/${f.filename}\n${f.patch}` : ''))
              .filter(Boolean)
              .join('\n\n');
            prData.changed_files = included.length;
            prData.additions = included.reduce((sum, f) => sum + f.additions, 0);
            prData.deletions = included.reduce((sum, f) => sum + f.deletions, 0);
            progress.info(`Filtered out ${String(excluded)} file(s) matching skip patterns`);
          }
        }

        const repoUrl = ref.repositoryUrl;
        progress.start('Finding components for repository');
        const components = adapter.findAllComponentsByRepository(repoUrl);

        if (components.length === 0) {
          progress.warn(`No components found matching repository: ${repoUrl}`);
          for (const line of adapter.metadata.noComponentHelpLines) {
            progress.info(line.replace('{{repoUrl}}', repoUrl));
          }
          return;
        }
        progress.succeed(`Found ${String(components.length)} component(s) for repository`);

        // Guaranteed non-empty since we checked components.length === 0 above
        const defaultComponent = components[0];
        if (!defaultComponent) return;

        let selectedComponent: ArchitecturalComponent = defaultComponent;
        let selectedComponentId: string | undefined;
        const candidateComponents =
          components.length > 1
            ? components.map((c) => ({ id: c.id, name: c.name, type: c.type }))
            : undefined;

        if (components.length === 1) {
          selectedComponentId = selectedComponent.id;
        } else {
          displaySection('Stage 0: Select component(s)');
          progress.start('Using LLM to select the most relevant component');
          if (!provider.selectComponent) {
            progress.warn(
              `Provider does not support component selection, using first: ${selectedComponent.name}`
            );
          } else {
            const componentId = await provider.selectComponent({
              components,
              files: prData.files.map((f) => ({ filename: f.filename })),
            });
            if (componentId) {
              selectedComponent = components.find((c) => c.id === componentId) ?? defaultComponent;
              selectedComponentId = componentId;
              progress.succeed(`Selected component: ${selectedComponent.name} (${componentId})`);
            } else {
              progress.warn(
                `AI could not determine component, using first: ${selectedComponent.name}`
              );
            }
          }
        }

        displaySection('Stage 1: Dependency Extraction');
        const fullDiff = prData.files
          .map((f) => (f.patch ? `diff --git a/${f.filename} b/${f.filename}\n${f.patch}` : ''))
          .filter(Boolean)
          .join('\n\n');

        progress.start('Extracting dependencies from PR diff');
        const aggregatedDeps = await provider.extractDependencies({
          diff: fullDiff,
          commit: {
            sha: prData.head.sha,
            message: commits.map((c) => c.message).join('; '),
            author: prData.author.login,
          },
          repository: {
            owner: ref.platformId.owner,
            repo: ref.platformId.repo,
            url: repoUrl,
          },
          components: [selectedComponent],
        });
        progress.succeed(
          `Extracted ${String(aggregatedDeps.dependencies.length)} dependency change(s)`
        );

        const dependencies = adapter.getComponentDependencies(selectedComponent.id);
        const dependents = adapter.getComponentDependents(selectedComponent.id);
        const relationships = adapter.getComponentRelationships(selectedComponent.id);

        const promptData: DriftAnalysisPromptData = {
          changeRequest: {
            number: prData.number,
            title: prData.title,
            description: prData.body,
            repository: ref.repositoryUrl.replace(/^https?:\/\/[^/]+\//, ''),
            author: prData.author,
            base: prData.base,
            head: prData.head,
            stats: {
              commits: prData.commits,
              additions: prData.additions,
              deletions: prData.deletions,
              files_changed: prData.changed_files,
            },
            commits: commits.map((c) => ({
              sha: c.sha,
              message: c.message,
              author: c.author.name,
            })),
          },
          component: selectedComponent,
          dependencies: aggregatedDeps,
          architectural: {
            dependencies: dependencies.map((d) => ({ ...d, repository: d.repository })),
            dependents: dependents.map((d) => ({ ...d, repository: d.repository })),
            relationships: relationships.map((r) => ({
              target: { id: r.target.id, name: r.target.name },
              kind: r.kind,
              title: r.title,
            })),
          },
        };

        displaySection('Stage 2: Architecture Drift Analysis');
        progress.start('Analyzing change request for architectural drift');
        const analysisResult = await provider.analyzeDrift(promptData);
        progress.succeed('Analysis complete');

        let generatedCode: string | undefined;
        if (validatedOptions.generateModel) {
          displaySection(`Stage 3: ${adapter.metadata.displayName} Model Generation`);
          if (!provider.generateArchitectureCode) {
            progress.warn(
              `Provider does not support ${adapter.metadata.displayName} model generation`
            );
          } else {
            progress.start(`Generating ${adapter.metadata.displayName} model code`);
            // Pass all components for context
            analysisResult.allComponents = adapter.getAllComponents();
            analysisResult.modelFormat = adapter.metadata.id;
            generatedCode = await provider.generateArchitectureCode(analysisResult);
            progress.succeed(`${adapter.metadata.displayName} model code generated`);
          }
        }

        displaySection('Results');
        const needsStructured =
          validatedOptions.format === 'json' ||
          !!validatedOptions.outputFile ||
          !!validatedOptions.githubActions;
        const structured = needsStructured
          ? buildStructuredOutput(analysisResult, {
              selectedComponentId,
              candidateComponents,
            })
          : undefined;

        if (validatedOptions.format === 'json' && structured) {
          console.log(OutputFormatter.format(structured, 'json'));
        } else {
          console.log(formatAnalysisForConsole(analysisResult));
        }

        if (validatedOptions.outputFile && structured) {
          writeOutputToFile(structured, validatedOptions.outputFile);
          progress.succeed(`Structured output written to ${validatedOptions.outputFile}`);
        }

        // 14. If --open-pr and not --dry-run → create/update PR (before commenting so the link is available)
        let generatedChangeRequest:
          | { url: string; number: number; action: 'created' | 'updated'; branch: string }
          | undefined;
        if (validatedOptions.openPr && !validatedOptions.dryRun) {
          if (!generatedCode) {
            progress.warn(
              '--open-pr requires --generate-model to produce model code. PR creation skipped.'
            );
          } else {
            displaySection('Creating Pull Request');
            progress.start('Creating PR with model updates');
            const writer = createPlatformWriter(
              ref.repositoryUrl,
              ref.platformId.owner,
              ref.platformId.repo
            );
            const branchName = `erode/pr-${String(prData.number)}`;
            const prTitle = adapter.metadata.prTitleTemplate.replace(
              '{{prNumber}}',
              String(prData.number)
            );
            const prResult = await writer.createOrUpdateChangeRequest({
              branchName,
              title: prTitle,
              body: [
                `## Architecture Model Update`,
                '',
                `Automated update from erode analysis of PR #${String(prData.number)}: ${prData.title}`,
                '',
                `### Summary`,
                analysisResult.summary,
              ].join('\n'),
              fileChanges: [
                {
                  path: `model-updates/pr-${String(prData.number)}${adapter.metadata.generatedFileExtension}`,
                  content: generatedCode,
                },
              ],
              draft: validatedOptions.draft,
            });
            generatedChangeRequest = { ...prResult, branch: branchName };
            if (structured) structured.generatedChangeRequest = generatedChangeRequest;
            progress.succeed(`PR ${prResult.action}: ${prResult.url}`);
          }
        } else if (validatedOptions.openPr && validatedOptions.dryRun) {
          progress.info('Dry run: PR creation skipped');
        }

        if (validatedOptions.comment) {
          try {
            displaySection('Posting PR Comment');
            const commentWriter = createPlatformWriter(
              ref.repositoryUrl,
              ref.platformId.owner,
              ref.platformId.repo
            );
            if (analysisHasFindings(analysisResult)) {
              progress.start('Posting analysis comment on PR');
              const providerName = CONFIG.ai.provider;
              const providerConfig = CONFIG[providerName];
              const commentBody = formatAnalysisAsComment(analysisResult, {
                selectedComponentId,
                candidateComponents,
                generatedChangeRequest,
                modelInfo: {
                  provider: providerName,
                  fastModel: providerConfig.fastModel,
                  advancedModel: providerConfig.advancedModel,
                },
              });
              await commentWriter.commentOnChangeRequest(ref, commentBody, {
                upsertMarker: COMMENT_MARKER,
              });
              progress.succeed('Analysis comment posted on PR');
            } else {
              progress.start('Cleaning up previous comment (no findings)');
              await commentWriter.deleteComment(ref, COMMENT_MARKER);
              progress.succeed('No findings — previous comment removed (if any)');
            }
          } catch (error) {
            progress.warn(
              `Failed to post PR comment: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        if (validatedOptions.githubActions && structured) {
          writeGitHubActionsOutputs(structured);
          writeGitHubStepSummary(structured);
        }

        if (validatedOptions.failOnViolations && analysisResult.hasViolations) {
          process.exitCode = 1;
        }
      } catch (error) {
        ErrorHandler.handleCliError(error);
      }
    });
}
