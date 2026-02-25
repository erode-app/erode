import React, { useEffect, useState } from 'react';
import { Box, useApp } from 'ink';
import { runConnections } from '@erode/core';
import type { ConnectionsOptions, ComponentConnections } from '@erode/core';
import { usePipeline } from '../ui/hooks/use-pipeline.js';
import { StagePipeline } from '../ui/components/stage-pipeline.js';
import { ConnectionsDisplay } from '../ui/components/connections-display.js';
import { ErrorDisplay } from '../ui/components/error-display.js';
import { renderApp } from '../ui/app.js';

interface ResultRef {
  error?: unknown;
}

function ConnectionsInkApp({
  options,
  resultRef,
}: {
  options: ConnectionsOptions;
  resultRef: ResultRef;
}): React.ReactElement {
  const { steps, reporter } = usePipeline();
  const [connections, setConnections] = useState<ComponentConnections[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { exit } = useApp();

  useEffect(() => {
    void (async () => {
      try {
        const c = await runConnections(options, reporter);
        setConnections(c);
      } catch (e: unknown) {
        resultRef.error = e;
        setError(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run pipeline once on mount
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- Ink requires useEffect to exit the app after async pipeline completes
    if (connections || error) exit();
  }, [connections, error, exit]);

  return (
    <Box flexDirection="column">
      <StagePipeline steps={steps} />
      {connections && connections.length > 0 && <ConnectionsDisplay connections={connections} />}
      {error ? <ErrorDisplay error={error} /> : null}
    </Box>
  );
}

function rethrow(error: unknown): never {
  if (error instanceof Error) throw error;
  throw new Error(String(error));
}

export async function runConnectionsApp(options: ConnectionsOptions): Promise<void> {
  const resultRef: ResultRef = {};
  await renderApp(<ConnectionsInkApp options={options} resultRef={resultRef} />);
  if (resultRef.error) rethrow(resultRef.error);
}
