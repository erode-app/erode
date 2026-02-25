import React from 'react';
import { Box, Text } from 'ink';
import type { DriftAnalysisResult } from '@erode/core';

interface Props {
  result: DriftAnalysisResult;
}

function severityColor(severity: string): string {
  if (severity === 'high') return 'red';
  if (severity === 'medium') return 'yellow';
  return 'blue';
}

export function AnalysisResults({ result }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">
        ── Analysis Results: #{String(result.metadata.number)} ──
      </Text>
      <Text dimColor> {result.metadata.title}</Text>
      <Text dimColor>
        {' '}
        Component: {result.component.name} ({result.component.id})
      </Text>

      <Text bold>{'\n'}Summary:</Text>
      <Text> {result.summary}</Text>

      {result.violations.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="red">
            Violations ({String(result.violations.length)}):
          </Text>
          {result.violations.map((v, i) => (
            <Box key={i} flexDirection="column">
              <Text>
                {'  '}
                <Text color={severityColor(v.severity)}>[{v.severity.toUpperCase()}]</Text>{' '}
                {v.description}
              </Text>
              {(v.file ?? v.commit) && (
                <Text dimColor>
                  {'    '}
                  {[v.file, v.commit?.substring(0, 7)].filter(Boolean).join(' @ ')}
                </Text>
              )}
              {v.suggestion && <Text color="green"> Suggestion: {v.suggestion}</Text>}
            </Box>
          ))}
        </Box>
      ) : (
        <Text color="green">{'\n'}No violations found.</Text>
      )}

      {result.improvements && result.improvements.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">
            Improvements:
          </Text>
          {result.improvements.map((imp, i) => (
            <Text key={i} color="green">
              {'  + '}
              {imp}
            </Text>
          ))}
        </Box>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            Warnings:
          </Text>
          {result.warnings.map((w, i) => (
            <Text key={i} color="yellow">
              {'  ! '}
              {w}
            </Text>
          ))}
        </Box>
      )}

      {result.modelUpdates && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Model Updates:</Text>
          {result.modelUpdates.add && result.modelUpdates.add.length > 0 && (
            <Box flexDirection="column">
              <Text color="green"> Add:</Text>
              {result.modelUpdates.add.map((a, i) => (
                <Text key={i} color="green">
                  {'    + '}
                  {a}
                </Text>
              ))}
            </Box>
          )}
          {result.modelUpdates.remove && result.modelUpdates.remove.length > 0 && (
            <Box flexDirection="column">
              <Text color="red"> Remove:</Text>
              {result.modelUpdates.remove.map((r, i) => (
                <Text key={i} color="red">
                  {'    - '}
                  {r}
                </Text>
              ))}
            </Box>
          )}
          {result.modelUpdates.notes && <Text dimColor> Notes: {result.modelUpdates.notes}</Text>}
        </Box>
      )}
    </Box>
  );
}
