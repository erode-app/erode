import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { runValidate } from '@erode/core';
import type { ValidateOptions, ValidateResult } from '@erode/core';
import { usePipeline } from '../ui/hooks/use-pipeline.js';
import { StagePipeline } from '../ui/components/stage-pipeline.js';
import { DataTable } from '../ui/components/data-table.js';
import { ErrorDisplay } from '../ui/components/error-display.js';
import { renderApp } from '../ui/app.js';

interface ResultRef {
  value?: ValidateResult;
  error?: unknown;
}

function ValidateInkApp({
  options,
  resultRef,
}: {
  options: ValidateOptions;
  resultRef: ResultRef;
}): React.ReactElement {
  const { steps, reporter } = usePipeline();
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { exit } = useApp();

  useEffect(() => {
    void (async () => {
      try {
        const r = await runValidate(options, reporter);
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
      {result && (
        <Box flexDirection="column" marginTop={1}>
          <DataTable data={result.components} />
          <Box marginTop={1}>
            <Text>
              Total: {String(result.total)} | Connected: {String(result.linked)} | Unconnected:{' '}
              {String(result.unlinked)}
            </Text>
          </Box>
          {result.versionCheck && (
            <Text dimColor>
              Detected version: {result.versionCheck.detected ?? 'unknown'} (required:{' '}
              {result.versionCheck.minimum})
            </Text>
          )}
        </Box>
      )}
      {error ? <ErrorDisplay error={error} /> : null}
    </Box>
  );
}

function rethrow(error: unknown): never {
  if (error instanceof Error) throw error;
  throw new Error(String(error));
}

export async function runValidateApp(
  options: ValidateOptions
): Promise<ValidateResult | undefined> {
  const resultRef: ResultRef = {};
  await renderApp(<ValidateInkApp options={options} resultRef={resultRef} />);
  if (resultRef.error) rethrow(resultRef.error);
  return resultRef.value;
}
