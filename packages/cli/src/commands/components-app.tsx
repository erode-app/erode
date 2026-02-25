import React, { useEffect, useState } from 'react';
import { Box, useApp } from 'ink';
import { runComponents } from '@erode/core';
import type { ComponentsOptions, SimpleComponent } from '@erode/core';
import { usePipeline } from '../ui/hooks/use-pipeline.js';
import { StagePipeline } from '../ui/components/stage-pipeline.js';
import { DataTable } from '../ui/components/data-table.js';
import { ErrorDisplay } from '../ui/components/error-display.js';
import { renderApp } from '../ui/app.js';

interface ResultRef {
  error?: unknown;
}

function ComponentsInkApp({
  options,
  resultRef,
}: {
  options: ComponentsOptions;
  resultRef: ResultRef;
}): React.ReactElement {
  const { steps, reporter } = usePipeline();
  const [components, setComponents] = useState<SimpleComponent[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { exit } = useApp();

  useEffect(() => {
    void (async () => {
      try {
        const c = await runComponents(options, reporter);
        setComponents(c);
      } catch (e: unknown) {
        resultRef.error = e;
        setError(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run pipeline once on mount
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- Ink requires useEffect to exit the app after async pipeline completes
    if (components || error) exit();
  }, [components, error, exit]);

  const tableData = components?.map((c) => ({
    id: c.id,
    title: c.title ?? c.id,
    kind: c.kind,
    links: c.links.join(', '),
  }));

  return (
    <Box flexDirection="column">
      <StagePipeline steps={steps} />
      {tableData && <DataTable data={tableData} />}
      {error ? <ErrorDisplay error={error} /> : null}
    </Box>
  );
}

function rethrow(error: unknown): never {
  if (error instanceof Error) throw error;
  throw new Error(String(error));
}

export async function runComponentsApp(options: ComponentsOptions): Promise<void> {
  const resultRef: ResultRef = {};
  await renderApp(<ComponentsInkApp options={options} resultRef={resultRef} />);
  if (resultRef.error) rethrow(resultRef.error);
}
