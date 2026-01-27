// Path: src/environment/environment.ts
// WARNING: Never commit real API tokens to version control!
// Consider adding this file to .gitignore and using environment.example.ts as a template.

export const environment = {
  production: false,
  // Replace with your actual token before running locally
  apiToken: 'PLACEHOLDER_TOKEN',
  // In development, requests are proxied via angular dev server to avoid CORS
  apiBaseUrl: '/api/user'
};