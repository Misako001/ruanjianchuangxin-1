module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['web/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'react-native/no-inline-styles': 'off',
      },
    },
  ],
};
