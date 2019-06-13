import { Request, Response } from 'express';
import { isEmpty } from 'lodash';
import * as moment from 'moment';
import { IncomingSlackMessageBody, postEphemeral } from '../../api';
import { logger } from '../../logger';
import { findUser } from '../../models';
import { isSlackVerified } from '../../verifySignature';
import { actions as configureActions, handleConfiguration } from './configure';
import { actions, listPRs } from './pulls';

require('@google-cloud/debug-agent').start({ allowExpressions: true });

export default async function slackFn(req: Request, res: Response) {
  const start = moment();
  const message: IncomingSlackMessageBody = req.body;

  try {
    // grab the body
    logger.debug(`body: ${JSON.stringify(message, null, 2)}`);

    // verify
    if (!isSlackVerified(req)) {
      const msg = 'Error: Unable to verify slack secret';
      logger.error(msg);
      return res
        .status(500)
        .send(msg)
        .end();
    }

    // check for github token
    if (isEmpty(process.env.GITHUB_TOKEN)) {
      const msg = 'Error: Specify GITHUB_TOKEN in environment';
      logger.error(msg);
      return res
        .status(500)
        .send(msg)
        .end();
    }

    // check for slack token
    if (isEmpty(process.env.SLACK_ACCESS_TOKEN)) {
      const msg = 'Error: Specify SLACK_ACCESS_TOKEN in environment';
      logger.error(msg);
      return res
        .status(500)
        .send(msg)
        .end();
    }

    // ack to slack
    logger.debug('Ack to slack...');
    res.status(200).send();

    if (typeof message.payload === 'string') {
      // interactive message callback
      const payload = JSON.parse(message.payload);
      logger.debug(`Interactive message payload: ${JSON.stringify(payload, null, 2)}`);
      return handleConfiguration(payload);
    } else {
      // look for a user input match
      const text = message.text.trim();
      logger.debug(`Beginning command pattern checking for ${text}`);
      if (helpPattern.test(text)) {
        return postEphemeral(message, getHelpText());
      }
      const action = [...actions, ...configureActions].find(action => !!action.pattern.exec(text));
      if (action) {
        logger.debug('Found action match');
        await action.callback(message, text);
      } else {
        logger.debug('No matching action');
        await handleUnrecognized(message);
      }
    }
  } catch (err) {
    logger.error(err.toString());
    await postEphemeral(message, err.toString());
  } finally {
    // end
    logger.info(`execution time: ${moment().diff(start, 'milliseconds')} ms`);
  }
}

async function handleUnrecognized(message: IncomingSlackMessageBody) {
  const userId = message.text.trim();
  logger.debug('Looking up...');
  const user = await findUser(userId);
  logger.debug('found...', user);
  if (!user) {
    logger.debug('returning nothing...');
  } else {
    return listPRs(message, userId);
  }
}

const helpPattern = /help\s*/i;

function getHelpText() {
  return `*Summary*

• Set up a team with a list of snippets to filter open issues and pull requests.

*Usage*

• \`help\` - display this message
${[...actions, ...configureActions]
  .map(command => `• \`${command.command || command.commands.join('` / `')}\` - ${command.message}`)
  .join('\n')}
`;
}
