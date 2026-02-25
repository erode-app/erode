import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { readdirSync, statSync } from 'fs';
import { dirname, basename, join, resolve } from 'path';

interface CompletionResult {
  completed: string;
  suggestions: string[];
}

function completePathSync(input: string): CompletionResult {
  const trimmed = input.trim();
  const resolved = resolve(trimmed || '.');

  // Determine the directory to read and the partial name to match
  let dir: string;
  let partial: string;

  if (trimmed === '' || trimmed.endsWith('/')) {
    dir = resolved;
    partial = '';
  } else {
    dir = dirname(resolved);
    partial = basename(resolved);
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return { completed: input, suggestions: [] };
  }

  const matches = partial ? entries.filter((e) => e.startsWith(partial)) : entries;

  if (matches.length === 0) {
    return { completed: input, suggestions: [] };
  }

  if (matches.length === 1) {
    const match = matches[0] ?? '';
    const fullPath = join(dir, match);
    let completedPath = rebuildPath(trimmed, match);
    try {
      if (statSync(fullPath).isDirectory()) {
        completedPath += '/';
      }
    } catch {
      // Not a directory or inaccessible — leave as-is
    }
    return { completed: completedPath, suggestions: [] };
  }

  // Multiple matches — find longest common prefix
  const prefix = longestCommonPrefix(matches);
  const completedPath = prefix.length > partial.length ? rebuildPath(trimmed, prefix) : input;

  return { completed: completedPath, suggestions: matches };
}

function rebuildPath(original: string, name: string): string {
  if (original === '' || original.endsWith('/')) {
    return original + name;
  }
  const prefix = original.slice(0, original.length - basename(original).length);
  return prefix + name;
}

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  let prefix = strings[0] ?? '';
  for (let i = 1; i < strings.length; i++) {
    const s = strings[i] ?? '';
    let j = 0;
    while (j < prefix.length && j < s.length && prefix[j] === s[j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
    if (prefix === '') break;
  }
  return prefix;
}

const MAX_SUGGESTIONS = 12;

interface Props {
  label: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
}

export function WizardPathInput({ label, placeholder, onSubmit }: Props): React.ReactElement {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [completionKey, setCompletionKey] = useState(0);

  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      if (suggestions.length > 0) {
        setSuggestions([]);
      }
    },
    [suggestions.length]
  );

  useInput((_input, key) => {
    if (key.tab) {
      const result = completePathSync(value);
      setValue(result.completed);
      setSuggestions(result.suggestions);
      setCompletionKey((k) => k + 1);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {label}
      </Text>
      <Box>
        <Text color="green">{'> '}</Text>
        <TextInput
          key={completionKey}
          value={value}
          onChange={handleChange}
          onSubmit={onSubmit}
          placeholder={placeholder}
        />
      </Box>
      {suggestions.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text dimColor>
            {suggestions.length} matches
            {suggestions.length > MAX_SUGGESTIONS
              ? ` (showing first ${String(MAX_SUGGESTIONS)})`
              : ''}
            :
          </Text>
          {suggestions.slice(0, MAX_SUGGESTIONS).map((s) => (
            <Text key={s} color="yellow">
              {' '}
              {s}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
