// configure jest-junit
process.env.JEST_JUNIT_OUTPUT = './reports/junit.xml';

// configure jest
module.exports = {
  collectCoverageFrom: ['index.ts', 'src/**/*.ts'],
  preset: 'ts-jest',
  reporters: ['default', 'jest-junit'],
  setupFiles: ['<rootDir>/test/initEnv.ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts']
};
