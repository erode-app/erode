import React from 'react';
import { Box, Text } from 'ink';
import type { ComponentConnections } from '@erode/core';

interface Props {
  connections: ComponentConnections[];
}

function ConnectionSection({ conn }: { conn: ComponentConnections }): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">
        ── {conn.component.name} ({conn.component.id}) ──
      </Text>
      <Text dimColor> Kind: {conn.component.type}</Text>
      {conn.component.repository && <Text dimColor> Repo: {conn.component.repository}</Text>}

      <Box flexDirection="column" marginTop={1}>
        {conn.dependencies.length > 0 ? (
          <Box flexDirection="column">
            <Text bold> Depends on:</Text>
            {conn.dependencies.map((dep) => (
              <Text key={dep.id} color="blue">
                {'    → '}
                {dep.name} ({dep.type})
              </Text>
            ))}
          </Box>
        ) : (
          <Text dimColor> Depends on: none</Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {conn.dependents.length > 0 ? (
          <Box flexDirection="column">
            <Text bold> Depended on by:</Text>
            {conn.dependents.map((dep) => (
              <Text key={dep.id} color="magenta">
                {'    ← '}
                {dep.name} ({dep.type})
              </Text>
            ))}
          </Box>
        ) : (
          <Text dimColor> Depended on by: none</Text>
        )}
      </Box>

      {conn.relationships.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold> Relations:</Text>
          {conn.relationships.map((rel, i) => (
            <Text key={i}>
              {'    → '}
              {rel.targetName}
              <Text dimColor>
                {rel.kind ? ` [${rel.kind}]` : ''}
                {rel.title ? ` "${rel.title}"` : ''}
              </Text>
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function ConnectionsDisplay({ connections }: Props): React.ReactElement {
  return (
    <Box flexDirection="column">
      {connections.map((conn) => (
        <ConnectionSection key={conn.component.id} conn={conn} />
      ))}
    </Box>
  );
}
