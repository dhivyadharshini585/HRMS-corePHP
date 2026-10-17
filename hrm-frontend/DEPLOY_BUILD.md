# HRMS frontend deployment

1. Open this folder on a machine with Node.js installed.
2. Run `npm ci`.
3. Run `npm run build`.
4. Upload the **contents of `dist/`** to `public_html/hrms.zusatechnologies.in/`.
5. Keep the supplied production API URL. It points to `https://hrms.zusatechnologies.in/api`.

The source has responsive authentication and application-shell layouts for desktop, tablet and mobile.
Do not upload `node_modules`.
