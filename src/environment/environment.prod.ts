// Path: src/environments/environment.prod.ts
// WARNING: Never commit real credentials to version control!

export const environment = {
  production: true,
  apiBaseUrl: 'https://infobhoomiback.geoinfobox.com/api/user',
  loginUrl: 'https://infobhoomiback.geoinfobox.com/api/user/login/',
  credentials: {
    username: 'admin',
    password: 'admin@123'
  }
};