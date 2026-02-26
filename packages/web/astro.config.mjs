import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Resolve zod to Astro's bundled version to avoid conflicts with root zod@4
const require = createRequire(import.meta.url);
const astroDir = dirname(require.resolve('astro/package.json'));
const zodEntry = join(astroDir, 'node_modules', 'zod', 'index.js');

export default defineConfig({
  output: 'static',
  vite: {
    resolve: {
      alias: [{ find: 'zod', replacement: zodEntry }],
    },
  },
  integrations: [
    starlight({
      title: 'erode',
      disable404Route: true,
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/erode-app/core' }],
      head: [
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        },
        {
          tag: 'link',
          attrs: {
            href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
            rel: 'stylesheet',
          },
        },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
      sidebar: [
        {
          label: 'Start Here',
          items: [{ slug: 'docs/getting-started' }, { slug: 'docs/how-it-works' }],
        },
        {
          label: 'CI Integration',
          items: [
            { slug: 'docs/ci/github-actions' },
            { slug: 'docs/ci/gitlab-ci' },
            { slug: 'docs/ci/self-hosted' },
          ],
        },
        { label: 'Model Formats', autogenerate: { directory: 'docs/models' } },
        { label: 'Guides', autogenerate: { directory: 'docs/guides' } },
        { label: 'Reference', autogenerate: { directory: 'docs/reference' } },
      ],
    }),
  ],
});
