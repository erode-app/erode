import { describe, it, expect } from 'vitest';
import { DriftAnalysisResponseSchema } from '../drift-analysis.schema.js';

const violation = { severity: 'high', description: 'Undeclared dependency', suggestion: 'Fix' };

describe('DriftAnalysisResponseSchema', () => {
  it('derives hasViolations=true when the model claims false but lists violations', () => {
    const parsed = DriftAnalysisResponseSchema.parse({
      hasViolations: false,
      violations: [violation],
      summary: 'ok',
    });
    expect(parsed.hasViolations).toBe(true);
  });

  it('derives hasViolations=false when the model claims true but lists none', () => {
    const parsed = DriftAnalysisResponseSchema.parse({
      hasViolations: true,
      violations: [],
      summary: 'ok',
    });
    expect(parsed.hasViolations).toBe(false);
  });

  it('accepts a response without hasViolations', () => {
    const parsed = DriftAnalysisResponseSchema.parse({ violations: [violation], summary: 'ok' });
    expect(parsed.hasViolations).toBe(true);
  });
});
