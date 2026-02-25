import { writeFileSync } from 'fs';
import type { DriftAnalysisResult } from './analysis/analysis-types.js';
import type { StructuredAnalysisOutput } from './output/structured-output.js';
import { ApiError, ConfigurationError, ErrorCode } from './errors.js';

/** Build a structured JSON output object from analysis results for CI/CD consumption. */
export function buildStructuredOutput(
  result: DriftAnalysisResult,
  extras?: {
    selectedComponentId?: string;
    candidateComponents?: { id: string; name: string; type: string }[];
    generatedChangeRequest?: {
      url: string;
      number: number;
      action: 'created' | 'updated';
      branch: string;
    };
  }
): StructuredAnalysisOutput {
  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    status: result.hasViolations ? 'violations' : 'success',
    exitCode: result.hasViolations ? 1 : 0,
    metadata: {
      changeRequest: {
        number: result.metadata.number,
        title: result.metadata.title,
        author: result.metadata.author.name ?? result.metadata.author.login,
        base: result.metadata.base.ref,
        head: result.metadata.head.ref,
        commits: result.metadata.stats.commits,
        filesChanged: result.metadata.stats.files_changed,
      },
      component: {
        id: result.component.id,
        name: result.component.name,
        type: result.component.type,
        repository: result.component.repository,
        tags: result.component.tags,
      },
    },
    analysis: {
      hasViolations: result.hasViolations,
      violations: result.violations.map((v) => ({
        severity: v.severity,
        description: v.description,
        file: v.file,
        line: v.line,
        commit: v.commit,
        suggestion: v.suggestion,
      })),
      summary: result.summary,
      improvements: result.improvements,
      warnings: result.warnings,
      modelUpdates: result.modelUpdates,
    },
    dependencyChanges: result.dependencyChanges.dependencies.map((d) => ({
      type: d.type,
      dependency: d.dependency,
      file: d.file,
      description: d.description,
    })),
    selectedComponentId: extras?.selectedComponentId,
    candidateComponents: extras?.candidateComponents,
    generatedChangeRequest: extras?.generatedChangeRequest,
  };
}

const COMMENT_MARKER = '<!-- erode -->';

/** Format analysis results as a markdown PR comment matching the entrypoint.sh format. */
export function formatAnalysisAsComment(
  result: DriftAnalysisResult,
  extras?: {
    selectedComponentId?: string;
    candidateComponents?: { id: string; name: string; type: string }[];
    generatedChangeRequest?: {
      url: string;
      number: number;
      action: 'created' | 'updated';
      branch: string;
    };
    modelInfo?: { provider: string; fastModel: string; advancedModel: string };
  }
): string {
  const lines: string[] = [];

  lines.push(COMMENT_MARKER);
  lines.push('## Architectural Drift Analysis');
  lines.push('');

  lines.push(`**Component**: \`${result.component.id}\` (${result.component.name})`);

  if (
    extras?.selectedComponentId &&
    extras.candidateComponents &&
    extras.candidateComponents.length > 1
  ) {
    lines.push('');
    lines.push('<details>');
    lines.push(
      `<summary>Selected from ${String(extras.candidateComponents.length)} candidates</summary>`
    );
    lines.push('');
    for (const c of extras.candidateComponents) {
      const checked = c.id === extras.selectedComponentId ? 'x' : ' ';
      lines.push(`- [${checked}] \`${c.id}\` (${c.name})`);
    }
    lines.push('');
    lines.push('</details>');
  }
  lines.push('');

  const status = result.hasViolations
    ? ':warning: Issues detected'
    : ':white_check_mark: No drift found';
  lines.push(`**Status**: ${status}`);

  if (result.hasViolations) {
    lines.push('');
    lines.push(`### Detected Issues (${String(result.violations.length)})`);
    lines.push('');
    for (const v of result.violations) {
      lines.push(`- **[${v.severity.toUpperCase()}]** ${v.description}`);
      if (v.file) lines.push(`  - Source: \`${v.file}\``);
      if (v.suggestion) lines.push(`  - Recommendation: ${v.suggestion}`);
    }
    lines.push('');
    lines.push('**How to Resolve:**');
    lines.push('Adjust the architecture model to:');
    lines.push('- Include missing relationships between components');
    lines.push('- Revise component boundaries if code has been relocated');
    lines.push('- Record intentional architectural changes');
    lines.push('');
  } else {
    lines.push('');
    lines.push('### No Issues Found');
    lines.push('');
    lines.push('No architectural drift found in this change request.');
    lines.push('');
  }

  const hasAdd = result.modelUpdates?.add && result.modelUpdates.add.length > 0;
  const hasRemove = result.modelUpdates?.remove && result.modelUpdates.remove.length > 0;
  if (hasAdd || hasRemove) {
    lines.push('### Suggested LikeC4 Changes');
    lines.push('');
    if (hasAdd && result.modelUpdates?.add) {
      lines.push('**Add:**');
      for (const a of result.modelUpdates.add) lines.push(`- ${a}`);
      lines.push('');
    }
    if (hasRemove && result.modelUpdates?.remove) {
      lines.push('**Remove:**');
      for (const r of result.modelUpdates.remove) lines.push(`- ${r}`);
      lines.push('');
    }
  }

  if (extras?.generatedChangeRequest) {
    const cr = extras.generatedChangeRequest;
    const actionCapitalized = cr.action.charAt(0).toUpperCase() + cr.action.slice(1);
    lines.push(`### Model Update ${actionCapitalized}`);
    lines.push('');
    lines.push(`A change request was ${cr.action} to update the architecture model:`);
    lines.push(cr.url);
    lines.push('');
  }

  if (result.summary) {
    lines.push('### Overview');
    lines.push('');
    lines.push(result.summary);
    lines.push('');
  }

  if (extras?.modelInfo) {
    lines.push('<details>');
    lines.push('<summary>Analysis details</summary>');
    lines.push('');
    lines.push('| | |');
    lines.push('|---|---|');
    lines.push(`| **AI Provider** | ${extras.modelInfo.provider} |`);
    lines.push(`| **Quick model** (Stages 0, 1) | \`${extras.modelInfo.fastModel}\` |`);
    lines.push(`| **Deep model** (Stages 2, 3) | \`${extras.modelInfo.advancedModel}\` |`);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  lines.push('---');
  lines.push('*Automated by [erode](https://github.com/erode-app/core)*');

  return lines.join('\n');
}

/** Returns true if the analysis result has violations or model updates worth commenting about. */
export function analysisHasFindings(result: DriftAnalysisResult): boolean {
  if (result.hasViolations) return true;
  const hasAdd = result.modelUpdates?.add && result.modelUpdates.add.length > 0;
  const hasRemove = result.modelUpdates?.remove && result.modelUpdates.remove.length > 0;
  return !!(hasAdd ?? hasRemove);
}

/** Format an error as a markdown PR comment so CI failures are visible on the PR. */
export function formatErrorAsComment(error: unknown): string {
  const lines: string[] = [];

  lines.push(COMMENT_MARKER);
  lines.push('## Architectural Drift Analysis');
  lines.push('');
  lines.push(':x: **Analysis unsuccessful**');
  lines.push('');

  if (error instanceof ApiError) {
    if (error.code === ErrorCode.RATE_LIMITED) {
      lines.push(
        'The AI provider rate limit was hit. This is typically temporary — re-run the check in a few minutes, or review your API plan quota.'
      );
    } else if (error.code === ErrorCode.TIMEOUT) {
      lines.push(
        'The AI provider request timed out. This can occur with large PRs — try re-running.'
      );
    } else {
      lines.push(
        'An unexpected error happened during analysis. Review the workflow logs for more details.'
      );
    }
  } else if (error instanceof ConfigurationError) {
    lines.push(
      'A configuration issue was detected. Verify that API keys and tokens are correctly set.'
    );
  } else {
    lines.push(
      'An unexpected error happened during analysis. Review the workflow logs for more details.'
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('*Automated by [erode](https://github.com/erode-app/core)*');

  return lines.join('\n');
}

/** The HTML comment marker used for upsert/delete of erode PR comments. */
export { COMMENT_MARKER };

/** Write structured analysis output as JSON to a file. */
export function writeOutputToFile(output: StructuredAnalysisOutput, filePath: string): void {
  writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
}
