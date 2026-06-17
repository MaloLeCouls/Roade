// Roade — flat ESLint config (ESLint 9+).
// Anti-slop: règles utiles et calmes, pas dogmatiques. Le style relève de Prettier,
// pas d'ESLint (cf. eslint-config-prettier en fin de pipeline).
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default [
  { ignores: ['dist', 'node_modules', 'package-lock.json'] },

  js.configs.recommended,

  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      // React 18 + nouveau JSX transform : pas besoin d'importer React.
      'react/react-in-jsx-scope': 'off',
      // On n'utilise pas PropTypes (cf. todo 0.9 — typage à venir).
      'react/prop-types': 'off',
      // Projet FR : les apostrophes typographiques dans le JSX ne sont pas un risque,
      // les forcer en &apos; / &#39; rend le code illisible (et c'est du slop).
      'react/no-unescaped-entities': 'off',
      // autoFocus est utilisé volontairement sur les nodes (création d'un Bouchon /
      // Sortie : on focus le champ titre dès l'apparition). Geste UX, pas un piège a11y.
      'jsx-a11y/no-autofocus': 'off',

      // Tolère les variables non utilisées préfixées par _ (ex. arg ignoré volontairement).
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // a11y: l'audit a déjà identifié des trous (Chantier E.7) — on ne fait pas tout péter
      // d'un coup. Les règles bloquantes seront resserrées en v0.4.
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/no-noninteractive-tabindex': 'warn',

      // React Refresh : aide à garder le HMR sain.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Doit rester en dernier : neutralise les règles ESLint qui se chamaillent avec Prettier.
  prettier,
]
