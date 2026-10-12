import type { Config } from 'jest';

const baseConfig: Partial<Config> = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@app/common/(.*)$': '<rootDir>/libs/common/src/$1',
    '^@app/common$': '<rootDir>/libs/common/src/index.ts',
    '^@app/contracts/(.*)$': '<rootDir>/libs/contracts/src/$1',
    '^@app/contracts$': '<rootDir>/libs/contracts/src/index.ts',
  },
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: {
          target: 'es2022',
          parser: {
            syntax: 'typescript',
            decorators: true,
            dynamicImport: true,
          },
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
          },
        },
      },
    ],
  },
};

const config: Config = {
  projects: [
    {
      ...baseConfig,
      displayName: 'unit',
      roots: ['<rootDir>/apps/', '<rootDir>/libs/'],
      testRegex: '.*\\.spec\\.ts$',
    },
    {
      ...baseConfig,
      displayName: 'integration',
      roots: ['<rootDir>/apps/'],
      testRegex: '.*\\.integration-spec\\.ts$',
    },
    {
      ...baseConfig,
      displayName: 'e2e',
      roots: ['<rootDir>/test/e2e/'],
      testRegex: '.*\\.e2e-spec\\.ts$',
      testTimeout: 30000,
      transformIgnorePatterns: ['node_modules/(?!(viem|@noble|ox)/)'],
    },
  ],
};

export default config;
