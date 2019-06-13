import { Dialog, KnownBlock, MessageAttachment, WebClient } from '@slack/web-api';
import axios from 'axios';
import { ParsedUrlQuery } from 'querystring';
import { logger } from '../logger';

export interface IncomingSlackMessageBody extends ParsedUrlQuery {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

export interface SlackMessageArguments {
  text: string;
  attachments?: MessageAttachment[];
  blocks?: KnownBlock[];
}

// create slack client
logger.debug('creating slack client ...');
const web = new WebClient(process.env.SLACK_ACCESS_TOKEN, {
  logger: {
    debug(...msgs) {
      logger.debug(`[SLACK CLIENT]: ${msgs}`);
    },
    info(...msgs) {
      logger.info(`[SLACK CLIENT]: ${msgs}`);
    },
    warn(...msgs) {
      logger.warn(`[SLACK CLIENT]: ${msgs}`);
    },
    error(...msgs) {
      logger.error(`[SLACK CLIENT]: ${msgs}`);
    },
    setLevel() {},
    setName() {}
  }
});
logger.debug('slack client created ...');

/**
 * post an "ephemeral" message visible only to the current user
 * @param message
 * @param options
 */
export async function postEphemeral(
  message: Pick<IncomingSlackMessageBody, 'channel_id' | 'user_id'>,
  options: string | SlackMessageArguments
) {
  options = typeof options === 'string' ? { text: options } : options;
  return web.chat.postEphemeral({
    ...options,
    channel: message.channel_id,
    user: message.user_id
  });
}

export async function respondEphemeral(responseUrl: string, options: string | SlackMessageArguments) {
  options = typeof options === 'string' ? { text: options } : options;
  return axios.post(responseUrl, {
    ...options,
    replace_original: true
  });
}

/**
 * post a message to the origin channel
 * @param message
 * @param options
 */
export async function postMessage(
  message: Pick<IncomingSlackMessageBody, 'channel_id'>,
  options: string | SlackMessageArguments
) {
  options = typeof options === 'string' ? { text: options } : options;
  return web.chat.postMessage({
    ...options,
    channel: message.channel_id
  });
}

/**
 * post a dialog to the user
 * @param trigger_id
 * @param dialog
 */
export async function postDialog(trigger_id, dialog: Dialog) {
  if (typeof trigger_id !== 'string') {
    throw new Error(`Invalid trigger_id for dialog: ${trigger_id}`);
  }
  return web.dialog
    .open({
      trigger_id,
      dialog
    })
    .catch(err => {
      logger.error(`'postDialog()' got an error response ${JSON.stringify(err, null, 2)}`);
    });
}

/**
 * delete the original message corresponding to the given 'response_url'
 * @param response_url
 */
export async function deleteOriginal(response_url) {
  return axios.post(response_url, { delete_original: 'true' });
}
