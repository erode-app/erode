import React from 'react';
import { Box, Text, useApp } from 'ink';
import { WizardSelect } from './wizard-select.js';
import { renderApp } from '../app.js';

const CHOICES = [
  { label: 'Run another command', value: 'continue' },
  { label: 'Quit', value: 'quit' },
];

function ContinuePrompt({
  onSelect,
}: {
  onSelect: (shouldContinue: boolean) => void;
}): React.ReactElement {
  const { exit } = useApp();

  return (
    <Box flexDirection="column">
      <Text dimColor>{'─'.repeat(40)}</Text>
      <WizardSelect
        label="What next?"
        items={CHOICES}
        onSelect={(value) => {
          onSelect(value === 'continue');
          exit();
        }}
      />
    </Box>
  );
}

export async function promptContinue(): Promise<boolean> {
  let result = false;
  await renderApp(
    <ContinuePrompt
      onSelect={(shouldContinue) => {
        result = shouldContinue;
      }}
    />
  );
  return result;
}
