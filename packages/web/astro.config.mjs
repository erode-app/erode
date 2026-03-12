import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightBlog from 'starlight-blog';
import starlightLinksValidator from 'starlight-links-validator';

export default defineConfig({
  site: 'https://erode.dev',
  integrations: [
    starlight({
      plugins: [
        starlightBlog({
          title: 'Announcements',
          prefix: 'announcements',
          postCount: 5,
          recentPostCount: 5,
          authors: {
            anders: {
              name: 'Anders Hassis',
              title: 'Core maintainer',
              url: 'https://github.com/parse',
            },
          },
        }),
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
          label: 'Integrations',
          items: [
            { slug: 'docs/integrations', label: 'Overview' },
            { slug: 'docs/integrations/self-hosted' },
            { slug: 'docs/integrations/github-actions' },
            {
              slug: 'docs/integrations/gitlab-ci',
              badge: { text: 'Experimental', variant: 'caution' },
            },
            {
              slug: 'docs/integrations/bitbucket-pipelines',
              badge: { text: 'Experimental', variant: 'caution' },
            },
            { slug: 'docs/integrations/claude-code' },
          ],
        },
        { label: 'Model Formats', autogenerate: { directory: 'docs/models' } },
        {
          label: 'Reference',
          items: [
            { slug: 'docs/reference/configuration' },
            { slug: 'docs/reference/cli-commands' },
            { slug: 'docs/reference/authentication' },
            { slug: 'docs/reference/ai-providers' },
            { slug: 'docs/reference/analysis-pipeline' },
          ],
        },
        { label: 'Contributing', items: [{ slug: 'docs/contributing' }] },
      ],
    }),
  ],
});
