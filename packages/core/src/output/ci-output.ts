import { randomUUID } from 'crypto';
import { appendFileSync } from 'fs';
import type { StructuredAnalysisOutput } from './structured-output.js';

/**
 * Append GitHub Actions outputs (has-violations, violations-count, analysis-summary)
 * to the file pointed to by GITHUB_OUTPUT.
 */
export function writeGitHubActionsOutputs(output: StructuredAnalysisOutput): void {
  const outputFile = process.env['GITHUB_OUTPUT'];
  if (!outputFile) return;

  const delimiter = `SUMMARY_EOF_${randomUUID().replace(/-/g, '')}`;
  const lines = [
    `has-violations=${String(output.analysis.hasViolations)}`,
    `violations-count=${String(output.analysis.violations.length)}`,
    `analysis-summary<<${delimiter}`,
    output.analysis.summary,
    delimiter,
  ];

  appendFileSync(outputFile, lines.join('\n') + '\n', 'utf-8');
}

/** Build a GitHub Actions step summary as a markdown string (pure function). */
export function buildStepSummary(output: StructuredAnalysisOutput): string {
  const lines: string[] = [];

  lines.push('## Drift Analysis Results');
  lines.push('');

  if (output.status === 'success' && !output.analysis.hasViolations) {
    lines.push('### Analysis Passed');
    lines.push('');
    lines.push('No architectural drift found in this change request.');
  } else if (output.status === 'violations' || output.analysis.hasViolations) {
    lines.push('### Issues Detected');
  } else if (output.status === 'error') {
    lines.push('### Analysis Unsuccessful');
  } else if (output.status === 'skipped') {
    lines.push('### Analysis Omitted');
  } else {
    lines.push('### Analysis Done');
  }

  lines.push('');
  const componentId = output.metadata.component?.id ?? 'unknown';
  const componentName = output.metadata.component?.name ?? 'N/A';
  lines.push(`**Inspected Component:** \`${componentId}\` (${componentName})`);
  lines.push(`**Status:** ${output.status}`);
  lines.push(`**Violations:** ${String(output.analysis.violations.length)}`);
  lines.push(`**Warnings:** ${String(output.analysis.warnings?.length ?? 0)}`);
  lines.push('');

  if (output.analysis.summary) {
    lines.push('### Overview');
    lines.push('');
    lines.push(output.analysis.summary);
    lines.push('');
  }

  if (output.analysis.hasViolations && output.analysis.violations.length > 0) {
    lines.push('### Detected Issues');
    lines.push('');
    for (const v of output.analysis.violations) {
      lines.push(`- **[${v.severity.toUpperCase()}]** ${v.description}`);
    }
    lines.push('');
  }

  if (output.analysis.warnings && output.analysis.warnings.length > 0) {
    lines.push('### Advisories');
    lines.push('');
    for (const w of output.analysis.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  const hasAdd = output.analysis.modelUpdates?.add && output.analysis.modelUpdates.add.length > 0;
  const hasRemove =
    output.analysis.modelUpdates?.remove && output.analysis.modelUpdates.remove.length > 0;
  if (hasAdd || hasRemove) {
    lines.push('### Suggested Model Changes');
    lines.push('');
    if (hasAdd && output.analysis.modelUpdates?.add) {
      lines.push(`**Add (${String(output.analysis.modelUpdates.add.length)}):**`);
      for (const a of output.analysis.modelUpdates.add) {
        lines.push(`- ${a}`);
      }
      lines.push('');
    }
    if (hasRemove && output.analysis.modelUpdates?.remove) {
      lines.push(`**Remove (${String(output.analysis.modelUpdates.remove.length)}):**`);
      for (const r of output.analysis.modelUpdates.remove) {
        lines.push(`- ${r}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Write the step summary markdown to the file pointed to by GITHUB_STEP_SUMMARY.
 */
export function writeGitHubStepSummary(output: StructuredAnalysisOutput): void {
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (!summaryFile) return;

  appendFileSync(summaryFile, buildStepSummary(output), 'utf-8');
}
