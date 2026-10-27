import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
const env = runtime.process?.env
const repositoryName = env?.GITHUB_REPOSITORY?.split('/')[1]
const isUserSite = repositoryName?.endsWith('.github.io') ?? false
const base = env?.GITHUB_ACTIONS === 'true' && repositoryName && !isUserSite
  ? `/${repositoryName}/`
  : '/'

export default defineConfig({
  plugins: [react()],
  // GitHub Actions sets the base path automatically for project repositories.
  base,
})
