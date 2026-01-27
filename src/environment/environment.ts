// Path: src/environment/environment.ts
// WARNING: Never commit real credentials to version control!
// Consider adding this file to .gitignore and using environment.example.ts as a template.

export const environment = {
  production: false,
  // In development, requests are proxied via angular dev server to avoid CORS
  apiBaseUrl: '/api/user',
  loginUrl: '/api/user/login/',
  credentials: {
    username: 'admin',
    password: 'admin@123'
  }
};