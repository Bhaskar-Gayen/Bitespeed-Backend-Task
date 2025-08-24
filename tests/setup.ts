
import { config } from 'dotenv';

config({ path: '.env' });

process.env.NODE_ENV = 'test';

jest.setTimeout(30000);

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});