// Path: src/environment/environment.ts
// WARNING: Never commit real API tokens to version control!
// Use environment variables or a secrets manager in production.
// Consider adding this file to .gitignore and using environment.example.ts as a template.

export const environment = {
  production: false,
  // Replace with your actual token or use process.env at build time
  apiToken: process.env['API_TOKEN'] || 'PLACEHOLDER_TOKEN'
};