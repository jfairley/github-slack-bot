import { LoggingWinston } from '@google-cloud/logging-winston';
import { createLogger } from 'winston';

// Create a Winston logger that streams to Stackdriver Logging
export const logger = createLogger({
  level: 'debug',
  transports: [new LoggingWinston()]
});
