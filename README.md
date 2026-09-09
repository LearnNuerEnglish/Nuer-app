# Scripture App

A Bible reading app that connects to a Supabase table (`bible`) with columns:
book, chapter, verse, heading, text, reference.

## Deploying (no local setup needed)

1. Create a free account at https://github.com
2. Create a new repository and upload every file in this folder
   (drag the whole folder into the "upload files" box, keeping the
   `src` folder structure intact).
3. Create a free account at https://vercel.com and sign in with GitHub.
4. Click "Add New Project", pick this repository, and click "Deploy".
   Vercel automatically detects Vite and builds the site.
5. You'll get a live URL like `your-app.vercel.app`.

## Running on your own computer (optional)

Requires Node.js (https://nodejs.org) installed first.

```
npm install
npm run dev
```

Then open the local address it prints in your browser.
