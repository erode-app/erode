import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface Props {
  label: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
}

export function WizardInput({ label, placeholder, onSubmit }: Props): React.ReactElement {
  const [value, setValue] = useState('');

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {label}
      </Text>
      <Box>
        <Text color="green">{'> '}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={onSubmit}
          placeholder={placeholder}
        />
      </Box>
    </Box>
  );
}
