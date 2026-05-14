import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['server/modules/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types.ts'],
    },
  },
})
