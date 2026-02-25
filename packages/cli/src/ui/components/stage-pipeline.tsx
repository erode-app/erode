import React from 'react';
import { Box, Static } from 'ink';
import { ProgressStep } from './progress-step.js';
import type { PipelineStep } from '../hooks/use-pipeline.js';

interface Props {
  steps: PipelineStep[];
}

/**
 * Renders pipeline steps using Ink's <Static> for completed items (permanent output)
 * and a live area for the currently running step (with spinner).
 */
export function StagePipeline({ steps }: Props): React.ReactElement {
  const completed = steps.filter((s) => s.status !== 'running');
  const running = steps.find((s) => s.status === 'running');

  return (
    <Box flexDirection="column">
      <Static items={completed}>
        {(step) => <ProgressStep key={step.id} message={step.message} status={step.status} />}
      </Static>
      {running ? <ProgressStep message={running.message} status={running.status} /> : null}
    </Box>
  );
}
