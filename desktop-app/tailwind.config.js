/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: { extend: { colors: { surface: v('surface'), panel: v('panel'), line: v('line'), ink: v('ink'), muted: v('muted'), accent: v('accent') } } },
  plugins: [],
};
