import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// Resolve zod to Astro's bundled version to avoid conflicts with root zod@4
const require = createRequire(import.meta.url);
const astroDir = dirname(require.resolve('astro/package.json'));
const zodEntry = join(astroDir, 'node_modules', 'zod', 'index.js');

export default defineConfig({
  site: 'https://erode.dev',
  output: 'static',
  vite: {
    resolve: {
      alias: [{ find: 'zod', replacement: zodEntry }],
    },
  },
  integrations: [
    starlight({
      plugins: [
        starlightLinksValidator({
          exclude: ['/architecture/**'],
        }),
      ],
      title: 'erode',
      disable404Route: true,
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/erode-app/erode' }],
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
        ...(process.env.NODE_ENV === 'production'
          ? [
              {
                tag: 'script',
                attrs: {
                  defer: true,
                  src: 'https://cloud.umami.is/script.js',
                  'data-website-id': '66f0c303-fba0-4095-8732-f6230c3d6209',
                },
              },
            ]
          : []),
      ],
      customCss: ['./src/styles/starlight-custom.css'],
      sidebar: [
        {
          label: 'Start Here',
          items: [
            { slug: 'docs/getting-started' },
            { slug: 'docs/how-it-works' },
            { slug: 'docs/why-it-matters' },
          ],
        },
        {
          label: 'CI Integration',
          items: [
            { slug: 'docs/ci', label: 'Overview' },
            { slug: 'docs/ci/self-hosted' },
            { slug: 'docs/ci/github-actions' },
            { slug: 'docs/ci/gitlab-ci', badge: { text: 'Experimental', variant: 'caution' } },
            {
              slug: 'docs/ci/bitbucket-pipelines',
              badge: { text: 'Experimental', variant: 'caution' },
            },
          ],
        },
        { label: 'Model Formats', autogenerate: { directory: 'docs/models' } },
        { label: 'Guides', autogenerate: { directory: 'docs/guides' } },
        { label: 'Reference', autogenerate: { directory: 'docs/reference' } },
        { label: 'Contributing', items: [{ slug: 'docs/contributing' }] },
      ],
    }),
  ],
});
