import type React from 'react';
import { useEffect, useState } from 'react';
import { Box, useApp } from 'ink';
import { runAnalyze } from '@erode/core';
import type { AnalyzeOptions, AnalyzeResult } from '@erode/core';
import { usePipeline } from '../ui/hooks/use-pipeline.js';
import { StagePipeline } from '../ui/components/stage-pipeline.js';
import { AnalysisResults } from '../ui/components/analysis-results.js';
import { ErrorDisplay } from '../ui/components/error-display.js';
import { renderApp } from '../ui/app.js';

interface ResultRef {
  value?: AnalyzeResult;
  error?: unknown;
}

function AnalyzeInkApp({
  options,
  resultRef,
}: {
  options: AnalyzeOptions;
  resultRef: ResultRef;
}): React.ReactElement {
  const { steps, reporter } = usePipeline();
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { exit } = useApp();

  useEffect(() => {
    void (async () => {
      try {
        const r = await runAnalyze(options, reporter);
        resultRef.value = r;
        setResult(r);
      } catch (e: unknown) {
        resultRef.error = e;
        setError(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run pipeline once on mount
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- Ink requires useEffect to exit the app after async pipeline completes
    if (result || error) exit();
  }, [result, error, exit]);

  return (
    <Box flexDirection="column">
      <StagePipeline steps={steps} />
      {result && <AnalysisResults result={result.analysisResult} />}
      {error ? <ErrorDisplay error={error} /> : null}
    </Box>
  );
}

function rethrow(error: unknown): never {
  if (error instanceof Error) throw error;
  throw new Error(String(error));
}

export async function runAnalyzeApp(options: AnalyzeOptions): Promise<AnalyzeResult | undefined> {
  const resultRef: ResultRef = {};
  await renderApp(<AnalyzeInkApp options={options} resultRef={resultRef} />);
  if (resultRef.error) rethrow(resultRef.error);
  return resultRef.value;
}
