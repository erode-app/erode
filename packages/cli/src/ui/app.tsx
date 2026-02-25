import React from 'react';
import { render } from 'ink';

/**
 * Render an Ink element, wait for it to finish, then return.
 * Callers use `useApp().exit()` inside the component to signal completion.
 */
export async function renderApp(element: React.ReactElement): Promise<void> {
  const { waitUntilExit } = render(element);
  await waitUntilExit();
}
