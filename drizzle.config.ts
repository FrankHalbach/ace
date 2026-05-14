import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema/*',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.NUXT_DB_PATH ?? './data/ace.db',
  },
  verbose: true,
  strict: true,
})
