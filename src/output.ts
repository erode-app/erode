import { writeFileSync } from 'fs';
import chalk from 'chalk';
import type { DriftAnalysisResult } from './analysis/analysis-types.js';
import type { StructuredAnalysisOutput } from './output/structured-output.js';

/** Build a structured JSON output object from analysis results for CI/CD consumption. */
export function buildStructuredOutput(
  result: DriftAnalysisResult,
  extras?: {
    selectedComponentId?: string;
    candidateComponents?: { id: string; name: string; type: string }[];
    generatedChangeRequest?: { url: string; number: number; action: 'created' | 'updated'; branch: string };
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

/** Format analysis results as a human-readable console string with color highlighting. */
export function formatAnalysisForConsole(
  result: DriftAnalysisResult
): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan(`\n── Analysis Results: #${String(result.metadata.number)} ──`));
  lines.push(chalk.gray(`  ${result.metadata.title}`));
  lines.push(chalk.gray(`  Component: ${result.component.name} (${result.component.id})`));

  lines.push('');
  lines.push(chalk.bold('Summary:'));
  lines.push(`  ${result.summary}`);

  if (result.violations.length > 0) {
    lines.push('');
    lines.push(chalk.bold.red(`Violations (${String(result.violations.length)}):`));
    for (const v of result.violations) {
      const severityColor =
        v.severity === 'high' ? chalk.red : v.severity === 'medium' ? chalk.yellow : chalk.blue;
      const location = [v.file, v.commit?.substring(0, 7)].filter(Boolean).join(' @ ');
      lines.push(`  ${severityColor(`[${v.severity.toUpperCase()}]`)} ${v.description}`);
      if (location) lines.push(chalk.gray(`    ${location}`));
      if (v.suggestion) lines.push(chalk.green(`    Suggestion: ${v.suggestion}`));
    }
  } else {
    lines.push('');
    lines.push(chalk.green('No violations found.'));
  }

  if (result.improvements && result.improvements.length > 0) {
    lines.push('');
    lines.push(chalk.bold.green('Improvements:'));
    for (const imp of result.improvements) {
      lines.push(chalk.green(`  + ${imp}`));
    }
  }

  if (result.warnings && result.warnings.length > 0) {
    lines.push('');
    lines.push(chalk.bold.yellow('Warnings:'));
    for (const w of result.warnings) {
      lines.push(chalk.yellow(`  ! ${w}`));
    }
  }

  if (result.modelUpdates) {
    lines.push('');
    lines.push(chalk.bold('Model Updates:'));
    if (result.modelUpdates.add && result.modelUpdates.add.length > 0) {
      lines.push(chalk.green('  Add:'));
      for (const a of result.modelUpdates.add) lines.push(chalk.green(`    + ${a}`));
    }
    if (result.modelUpdates.remove && result.modelUpdates.remove.length > 0) {
      lines.push(chalk.red('  Remove:'));
      for (const r of result.modelUpdates.remove) lines.push(chalk.red(`    - ${r}`));
    }
    if (result.modelUpdates.notes) {
      lines.push(chalk.gray(`  Notes: ${result.modelUpdates.notes}`));
    }
  }

  return lines.join('\n');
}

const COMMENT_MARKER = '<!-- erode -->';

/** Format analysis results as a markdown PR comment matching the entrypoint.sh format. */
export function formatAnalysisAsComment(
  result: DriftAnalysisResult,
  extras?: {
    selectedComponentId?: string;
    candidateComponents?: { id: string; name: string; type: string }[];
    generatedChangeRequest?: { url: string; number: number; action: 'created' | 'updated'; branch: string };
    modelInfo?: { provider: string; fastModel: string; advancedModel: string };
  }
): string {
  const lines: string[] = [];

  lines.push(COMMENT_MARKER);
  lines.push('## Architecture Drift Detection');
  lines.push('');

  lines.push(`**Component**: \`${result.component.id}\` (${result.component.name})`);

  if (extras?.selectedComponentId && extras.candidateComponents && extras.candidateComponents.length > 1) {
    lines.push('');
    lines.push('<details>');
    lines.push(`<summary>Selected from ${String(extras.candidateComponents.length)} candidates</summary>`);
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
    ? ':warning: Violations detected'
    : ':white_check_mark: No drift detected';
  lines.push(`**Status**: ${status}`);

  if (result.hasViolations) {
    lines.push('');
    lines.push(`### Architectural Violations (${String(result.violations.length)})`);
    lines.push('');
    for (const v of result.violations) {
      lines.push(`- **[${v.severity.toUpperCase()}]** ${v.description}`);
      if (v.file) lines.push(`  - File: \`${v.file}\``);
      if (v.suggestion) lines.push(`  - Suggestion: ${v.suggestion}`);
    }
    lines.push('');
    lines.push('**How to Fix:**');
    lines.push('Update the architecture model to:');
    lines.push('- Add missing relationships between components');
    lines.push('- Update component boundaries if code has moved');
    lines.push('- Document intentional architectural changes');
    lines.push('');
  } else {
    lines.push('');
    lines.push('### No Violations Detected');
    lines.push('');
    lines.push('No architectural drift detected in this change request.');
    lines.push('');
  }

  const hasAdd = result.modelUpdates?.add && result.modelUpdates.add.length > 0;
  const hasRemove = result.modelUpdates?.remove && result.modelUpdates.remove.length > 0;
  if (hasAdd || hasRemove) {
    lines.push('### Recommended LikeC4 Updates');
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
    lines.push(`### Architecture Model Update ${actionCapitalized}`);
    lines.push('');
    lines.push(`Change request ${cr.action} to update the architecture model:`);
    lines.push(cr.url);
    lines.push('');
  }

  if (result.summary) {
    lines.push('### Summary');
    lines.push('');
    lines.push(result.summary);
    lines.push('');
  }

  if (extras?.modelInfo) {
    lines.push('<details>');
    lines.push('<summary>Analysis metadata</summary>');
    lines.push('');
    lines.push('| | |');
    lines.push('|---|---|');
    lines.push(`| **Provider** | ${extras.modelInfo.provider} |`);
    lines.push(`| **Fast model** (Stage 0, 1) | \`${extras.modelInfo.fastModel}\` |`);
    lines.push(`| **Advanced model** (Stage 2, 3) | \`${extras.modelInfo.advancedModel}\` |`);
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

/** The HTML comment marker used for upsert/delete of erode PR comments. */
export { COMMENT_MARKER };

/** Write structured analysis output as JSON to a file. */
export function writeOutputToFile(output: StructuredAnalysisOutput, filePath: string): void {
  writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
}
