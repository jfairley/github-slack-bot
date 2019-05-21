import * as Github from '@octokit/rest';
import { logger } from '../logger';

logger.debug('creating github ...');
export const github = new Github({
  auth: `token ${process.env.GITHUB_TOKEN}`
});
logger.debug('github created ...');
