import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup/jest.setup.ts'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '!**/__tests__/**/*.helper.ts',
    '!**/__tests__/setup/jest.setup.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.d.ts',
    '!**/*.helper.ts',
    '!**/node_modules/**',
    '!**/lib/**',
    '!**/coverage/**',
    // exclude type-only files
    '!**/types/**',
    '!jest.config.ts',
    '!jest.config.js',
    // exclude index files from testing
    '!index.ts',
    '!**/schemas/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  moduleFileExtensions: ['ts', 'js', 'json']
};

export default config;

