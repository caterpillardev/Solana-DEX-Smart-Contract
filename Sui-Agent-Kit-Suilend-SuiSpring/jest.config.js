/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: [
      '**/tests/**/*.test.ts' // Pattern to find test files
    ],
    moduleNameMapper: { // If you use paths in tsconfig, map them here too
      '^@/(.*)$': '<rootDir>/src/$1',
    },
    transform: {
      '^.+\\.tsx?$': ['ts-jest', { // <<< Regex padrão para arquivos TS/TSX
          tsconfig: 'tsconfig.json' // <<< Configuração do ts-jest vai aqui
        }
      ]
    },
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    collectCoverage: true,
    coverageDirectory: "coverage",
    coverageReporters: ["json", "lcov", "text", "clover"],
};