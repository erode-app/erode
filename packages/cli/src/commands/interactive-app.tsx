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
  { label: 'analyze    — Analyze a PR for architecture drift', value: 'analyze' },
  { label: 'validate   — Check components have repository links', value: 'validate' },
  { label: 'components — List architecture model components', value: 'components' },
  { label: 'connections — Show component connections', value: 'connections' },
  { label: 'quit       — Exit erode', value: 'quit' },
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
          <Text bold>Erode — Architecture Drift Detection</Text>
          <Text dimColor>Select a command to run:{'\n'}</Text>
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
          label="Path to architecture models directory:"
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
            label="Change request URL (GitHub PR or GitLab MR):"
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
            label="Repository URL:"
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
    return <Text dimColor>Starting...</Text>;
  }

  await renderApp(<Wizard />);
  return argsPromise;
}
