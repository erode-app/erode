import { useState, useCallback, useRef, useMemo } from 'react';
import type { ProgressReporter } from '@erode/core';

export type StepStatus = 'running' | 'success' | 'fail' | 'warn' | 'info' | 'section';

export interface PipelineStep {
  id: number;
  message: string;
  status: StepStatus;
}

/**
 * Hook that manages pipeline stage state and provides an Ink-backed ProgressReporter.
 *
 * The reporter is a stable object (via useMemo) safe to pass to async pipeline functions.
 * State updates from async code are batched by React 18.
 */
export function usePipeline(): { steps: PipelineStep[]; reporter: ProgressReporter } {
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const nextId = useRef(0);

  const addStep = useCallback((message: string, status: StepStatus) => {
    const id = nextId.current++;
    setSteps((prev) => [...prev, { id, message, status }]);
  }, []);

  const updateLastRunning = useCallback((message: string, status: StepStatus) => {
    setSteps((prev) => {
      const idx = prev.findLastIndex((s) => s.status === 'running');
      if (idx === -1) return prev;
      const next = [...prev];
      const existing = next[idx];
      if (existing) next[idx] = { ...existing, message, status };
      return next;
    });
  }, []);

  const reporter: ProgressReporter = useMemo(
    () => ({
      section(title: string) {
        addStep(title, 'section');
      },
      start(message: string) {
        addStep(message, 'running');
      },
      succeed(message: string) {
        updateLastRunning(message, 'success');
      },
      fail(message: string) {
        updateLastRunning(message, 'fail');
      },
      warn(message: string) {
        addStep(message, 'warn');
      },
      info(message: string) {
        addStep(message, 'info');
      },
    }),
    [addStep, updateLastRunning]
  );

  return { steps, reporter };
}
