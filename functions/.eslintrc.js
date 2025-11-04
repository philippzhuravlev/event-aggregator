module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2018,
  },
  extends: [
    "eslint:recommended",
  ],
  rules: {
    'no-restricted-globals': ['error', 'name', 'length'],
    'max-len': 'off',
    'prefer-arrow-callback': 'error',
    'quotes': 'off', // allow both single and double quotes
    'linebreak-style': 'off', // allow both CRLF and LF
    'object-curly-spacing': 'off', // allow spacing in object literals
    'comma-dangle': 'off', // allow trailing commas or not
    'indent': 'off', // dont enforce strict indentation
    'no-trailing-spaces': 'off', // allow trailing spaces
    'eol-last': 'off', // dont require newline at end of file
    'valid-jsdoc': 'off', // dont enforce JSDoc format
    'arrow-parens': 'off', // dont require parens around arrow function args
  },
  overrides: [
    {
      files: ['**/*.spec.*'],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
