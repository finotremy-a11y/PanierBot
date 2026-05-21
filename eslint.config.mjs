export default [
  {
    files: ["app/javascript/**/*.js"],
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-undef": "warn",
      "no-console": "off",
      "semi": ["error", "never"],
      "quotes": ["error", "double"]
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        clearInterval: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly"
      }
    }
  }
]
