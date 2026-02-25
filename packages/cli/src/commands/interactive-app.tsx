import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { WizardSelect } from '../ui/components/wizard-select.js';
import { WizardInput } from '../ui/components/wizard-input.js';
import { WizardPathInput } from '../ui/components/wizard-path-input.js';
import { renderApp } from '../ui/app.js';

type WizardStep = 'select-command' | 'model-path' | 'extra-args' | 'done';

interface WizardState {
  command?: string;
  modelPath?: string;
  url?: string;
  repo?: string;
}

const COMMANDS = [
  { label: 'analyze    — Inspect a PR for architectural deviations', value: 'analyze' },
  { label: 'validate   — Verify components are linked to repositories', value: 'validate' },
  { label: 'components — Display all model components', value: 'components' },
  { label: 'connections — Display component relationships', value: 'connections' },
  { label: 'quit       — Close erode', value: 'quit' },
];

function needsExtraArgs(command: string): boolean {
  return command === 'analyze' || command === 'connections';
}

/**
 * Run the interactive wizard and return argv-style arguments for Commander to parse.
 * Returns undefined if the user cancels (Ctrl+C).
 */
export async function runInteractiveWizard(): Promise<string[] | undefined> {
  let resolveArgs: (args: string[] | undefined) => void;
  const argsPromise = new Promise<string[] | undefined>((resolve) => {
    resolveArgs = resolve;
  });

  function Wizard(): React.ReactElement {
    const [step, setStep] = useState<WizardStep>('select-command');
    const [state, setState] = useState<WizardState>({});
    const { exit } = useApp();

    function finish(finalState: WizardState): void {
      const args = [finalState.command ?? '', finalState.modelPath ?? ''];
      if (finalState.command === 'analyze' && finalState.url) {
        args.push('--url', finalState.url);
      }
      if (finalState.command === 'connections' && finalState.repo) {
        args.push('--repo', finalState.repo);
      }
      resolveArgs(args);
      exit();
    }

    if (step === 'select-command') {
      return (
        <Box flexDirection="column">
          <Text bold>Erode — Architectural Drift Detector</Text>
          <Text dimColor>Choose a command:{'\n'}</Text>
          <WizardSelect
            label=""
            items={COMMANDS}
            onSelect={(value) => {
              if (value === 'quit') {
                resolveArgs(undefined);
                exit();
                return;
              }
              setState((s) => ({ ...s, command: value }));
              setStep('model-path');
            }}
          />
        </Box>
      );
    }

    if (step === 'model-path') {
      return (
        <WizardPathInput
          key="model-path"
          label="Directory containing architecture model files:"
          placeholder="./models"
          onSubmit={(value) => {
            const modelPath = value || './models';
            const next = { ...state, modelPath };
            setState(next);
            if (state.command && needsExtraArgs(state.command)) {
              setStep('extra-args');
            } else {
              finish(next);
            }
          }}
        />
      );
    }

    if (step === 'extra-args') {
      if (state.command === 'analyze') {
        return (
          <WizardInput
            key="extra-args-analyze"
            label="Pull request or merge request URL:"
            placeholder="https://github.com/owner/repo/pull/123"
            onSubmit={(value) => {
              finish({ ...state, url: value });
            }}
          />
        );
      }

      if (state.command === 'connections') {
        return (
          <WizardInput
            key="extra-args-connections"
            label="Repository address:"
            placeholder="https://github.com/owner/repo"
            onSubmit={(value) => {
              finish({ ...state, repo: value });
            }}
          />
        );
      }
    }

    // Fallback — shouldn't reach here
    exit();
    return <Text dimColor>Initializing...</Text>;
  }

  await renderApp(<Wizard />);
  return argsPromise;
}
