// The app's CSS keeps to the Dusk & Dawn scales (node_modules/dusk-dawn/style.md):
// type sizes from the type scale, the two breakpoints, and gaps from the
// spacing tokens. Colours are checked separately, by `dusk-dawn colours`.
const TYPE_SCALE = [
  0.625, 0.6875, 0.75, 0.8125, 0.875, 0.9375, 1, 1.125, 1.25, 1.5, 1.875, 2.25, 2.5, 3, 3.5, 4
];

/** @type {import('stylelint').Config} */
export default {
  overrides: [{ files: ['**/*.svelte'], customSyntax: 'postcss-html' }],
  rules: {
    'declaration-property-value-allowed-list': {
      'font-size': [
        new RegExp(`^(${TYPE_SCALE.join('|').replaceAll('.', '\\.')})rem$`),
        /^var\(/,
        'inherit',
        'inherit !important'
      ],
      '/^(gap|row-gap|column-gap)$/': [/^(0|1px|2px|var\(--space-\d\))( (0|1px|2px|var\(--space-\d\)))?$/]
    },
    'media-feature-name-value-allowed-list': {
      'max-width': ['639px', '899px'],
      'min-width': ['640px', '900px']
    }
  }
};
