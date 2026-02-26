import type React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';

interface Item {
  label: string;
  value: string;
}

interface Props {
  label: string;
  items: Item[];
  onSelect: (value: string) => void;
}

export function WizardSelect({ label, items, onSelect }: Props): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {label}
      </Text>
      <SelectInput
        items={items}
        onSelect={(item) => {
          onSelect(item.value);
        }}
      />
    </Box>
  );
}
