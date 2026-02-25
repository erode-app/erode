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
        ── Drift Report: #{String(result.metadata.number)} ──
      </Text>
      <Text dimColor> {result.metadata.title}</Text>
      <Text dimColor>
        {' '}
        Analyzed component: {result.component.name} ({result.component.id})
      </Text>

      <Text bold>{'\n'}Overview:</Text>
      <Text> {result.summary}</Text>

      {result.violations.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="red">
            Issues ({String(result.violations.length)}):
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
              {v.suggestion && <Text color="green"> Recommendation: {v.suggestion}</Text>}
            </Box>
          ))}
        </Box>
      ) : (
        <Text color="green">{'\n'}No issues detected.</Text>
      )}

      {result.improvements && result.improvements.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">
            Positive changes:
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
            Advisories:
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
          <Text bold>Suggested model changes:</Text>
          {result.modelUpdates.add && result.modelUpdates.add.length > 0 && (
            <Box flexDirection="column">
              <Text color="green"> Include:</Text>
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
              <Text color="red"> Exclude:</Text>
              {result.modelUpdates.remove.map((r, i) => (
                <Text key={i} color="red">
                  {'    - '}
                  {r}
                </Text>
              ))}
            </Box>
          )}
          {result.modelUpdates.notes && <Text dimColor> Remarks: {result.modelUpdates.notes}</Text>}
        </Box>
      )}
    </Box>
  );
}
