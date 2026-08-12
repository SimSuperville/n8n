import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { vitestConfig } from '@n8n/vitest-config/frontend';
import pkg from './package.json';

const includeVue = process.env.INCLUDE_VUE === 'true';
const srcPath = resolve(__dirname, 'src');

const banner = `/*! Package version @n8n/forms@${pkg.version} */`;

export default mergeConfig(
	defineConfig({
		plugins: [
			vue(),
			...(includeVue ? [] : [dts({ entryRoot: 'src', exclude: ['src/__tests__/**'] })]),
		],
		resolve: {
			alias: [
				{ find: '@', replacement: srcPath },
				// Only the self-contained bundle inlines form-core from source;
				// the lib build externalizes it so dts doesn't traverse foreign sources.
				...(includeVue
					? [
							{
								find: /^@n8n\/form-core$/,
								replacement: resolve(
									__dirname,
									'..',
									'..',
									'..',
									'@n8n',
									'form-core',
									'src',
									'index.ts',
								),
							},
						]
					: []),
			],
		},
		define: {
			'process.env.NODE_ENV': process.env.NODE_ENV ? `"${process.env.NODE_ENV}"` : '"production"',
		},
		build: {
			emptyOutDir: !includeVue,
			lib: {
				entry: resolve(__dirname, 'src', 'index.ts'),
				name: 'N8nForms',
				fileName: (format) => (includeVue ? `forms.bundle.${format}.js` : `forms.${format}.js`),
			},
			rollupOptions: {
				external: includeVue ? [] : ['vue', '@n8n/form-core'],
				output: {
					exports: 'named',
					banner,
					assetFileNames: (assetInfo) =>
						assetInfo.names?.some((name) => name.endsWith('.css')) ? 'style.css' : '[name][extname]',
					globals: includeVue ? {} : { vue: 'Vue', '@n8n/form-core': 'N8nFormCore' },
				},
			},
		},
	}),
	vitestConfig,
);
