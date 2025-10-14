# Your Rebuilt Vite Project (for GitHub)

This project was rebuilt by the AI Code Security Auditor to provide a modern, secure foundation using Vite, ready for version control with Git and GitHub.

---

## Option 1: Deploying Using Only Your Web Browser (Recommended for Beginners)

This method lets you get your site live without using a terminal or any local software.

### Step 1: Create a New Repository on GitHub
1. Go to [GitHub.com](https://github.com) and sign up or log in.
2. Click the **"+"** icon in the top right and select **"New repository"**.
3. Give your repository a name (e.g., `my-new-app`) and click **"Create repository"**. Keep it empty – do not add a README or .gitignore.

### Step 2: Upload Your Code
1. First, **unzip the file** you just downloaded from the auditor tool on your computer.
2. In your new, empty GitHub repository, click on the **"uploading an existing file"** link.
3. **Drag and drop ALL files and folders** from the unzipped folder into the browser window.
4. Wait for them to upload, then click **"Commit changes"**. Your code is now on GitHub!

### Step 3: Connect to Netlify & Deploy
1. Go to [Netlify.com](https://www.netlify.com/) and sign up for a free account (you can use your GitHub account to sign up).
2. After logging in, go to the **"Sites"** section and click **"Add new site"** > **"Import an existing project"**.
3. Click on **"Deploy with GitHub"** and authorize Netlify to access your repositories.
4. Find and select the new repository you just created.
5. Netlify will automatically detect that it's a Vite project. The settings should be correct, but double-check them:
    - **Build command:** `npm run build`
    - **Publish directory:** `dist`
6. Click **"Deploy site"**. Netlify will start building and deploying your project.

### Step 4: Add Your Secrets to Netlify (Very Important!)
Your deployed site won't work until you add your Supabase keys.
1. On Netlify, in your new site's dashboard, go to **Site configuration** > **Build & deploy** > **Environment**.
2. Click **"Edit variables"**.
3. Add your secrets one by one. Click **"New variable"** for each:
    - **Key:** `VITE_SUPABASE_URL`, **Value:** `YOUR_SUPABASE_URL_HERE`
    - **Key:** `VITE_SUPABASE_ANON_KEY`, **Value:** `YOUR_SUPABASE_ANON_KEY_HERE`
4. Once you've added the keys, you need to redeploy the site for the changes to apply. Go to the **"Deploys"** tab, click the "Trigger deploy" dropdown, and select **"Deploy site"**.

**Congratulations!** Your site is now live on the web. Every time you upload changes to your main branch on GitHub, Netlify will automatically redeploy the new version.

---

## Option 2: Using the Command Line (for Advanced Users)

This method uses Git on your local machine and includes an automated deployment workflow with GitHub Actions.

### 1. Local Setup
First, get the app running on your own computer.
- **Unzip & Open**: Unzip the file and open the folder in a code editor like VS Code.
- **Install Dependencies**: Open a terminal and run `npm install`.
- **Set Up Local Secrets**: Create a file named `.env.local` in the project root. This file is ignored by Git. Add your keys:
  ```
  VITE_SUPABASE_URL="YOUR_SUPABASE_URL_HERE"
  VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY_HERE"
  ```
- **Run Locally**: Run `npm run dev` to see your app at `http://localhost:5173`.

### 2. Pushing to GitHub
- **Create Repository**: Create a new, empty repository on GitHub.
- **Initialize Git Locally**: In your project's terminal, run:
  ```bash
  git init
  git add .
  git commit -m "Initial commit"
  git branch -M main
  ```
- **Connect and Push**: Replace the URL with your repository's URL and run:
  ```bash
  git remote add origin https://github.com/your-username/your-repo-name.git
  git push -u origin main
  ```

### 3. Automated Deployment Setup
This project includes a GitHub Actions workflow to auto-deploy to Netlify.
- **Secure Secrets on GitHub**: In your GitHub repo, go to **Settings > Secrets and variables > Actions**. Click **"New repository secret"** for each of the following: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Connect Netlify**: Create a Netlify account and a new site by importing your GitHub repo. Find your **Site ID** in the site settings and generate a **Personal Access Token** in your Netlify user settings.
- **Add Netlify Secrets to GitHub**: Go back to your GitHub Actions secrets and add two more: `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.

Now, every time you `git push` to your `main` branch, the workflow in `.github/workflows/deploy.yml` will automatically build and deploy your site to Netlify.