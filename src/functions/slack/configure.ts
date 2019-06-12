import { isEmpty } from 'lodash';
import {
  deleteOriginal,
  IncomingSlackMessageBody,
  postDialog,
  postEphemeral,
  respondEphemeral,
  SlackMessageArguments
} from '../../api';
import { logger } from '../../logger';
import { createUser, findUser, SlackAttachmentColor, updateUser, User } from '../../models';

enum Action {
  CHANNEL = 'channel',
  GITHUB_USERNAME = 'github_username',
  NEW_TEAM = 'new_team',
  ADD_SNIPPET = 'add_snippet',
  REMOVE_SNIPPET = 'remove_snippet',
  DONE = 'done'
}

function buildActionId(action: Action, team: string = '') {
  return `${action}|${team}`;
}

function parseActionId(actionId: string): [Action, string] {
  return actionId.split('|') as [Action, string];
}

export function configureNewTeamPayload(team: string): SlackMessageArguments {
  return {
    text: `Unrecognized team: ${team}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'plain_text',
          text: `Unrecognized team: ${team}`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: `Configure new team`
            },
            action_id: buildActionId(Action.NEW_TEAM, team)
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Cancel'
            },
            action_id: buildActionId(Action.DONE)
          }
        ]
      }
    ]
  };
}

function configureExistingTeamPayload(user: User, forUser: boolean): SlackMessageArguments {
  const title = `:gear: Configure the bot for ${forUser ? 'the current user' : `team: ${user.name}`}`;
  return {
    text: title,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: title
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'plain_text',
          text: 'Select where to notify'
        },
        block_id: Action.CHANNEL,
        accessory: {
          // for team messages
          type: 'conversations_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select where to notify',
            emoji: true
          },
          initial_conversation: user.slack_channel,
          action_id: buildActionId(Action.CHANNEL, user.name)
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'plain_text',
          text: `GitHub Username: ${user.github_user ? `${user.github_user}` : '_undefined_'}`
        },
        block_id: Action.GITHUB_USERNAME,
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Change'
          },
          action_id: buildActionId(Action.GITHUB_USERNAME, user.name)
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Snippets\n${(user.snippets || []).map(snippet => ` • ${snippet}`).join('\n')}`
        },
        block_id: 'snippets'
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Add'
            },
            style: SlackAttachmentColor.GOOD,
            action_id: buildActionId(Action.ADD_SNIPPET, user.name)
          },
          isEmpty(user.snippets)
            ? undefined
            : {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Remove'
                },
                style: SlackAttachmentColor.DANGER,
                action_id: buildActionId(Action.REMOVE_SNIPPET, user.name)
              }
        ].filter(e => !!e)
      },
      {
        type: 'divider'
      },
      {
        type: 'actions',
        block_id: 'misc',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Done'
            },
            action_id: buildActionId(Action.DONE)
          }
        ]
      }
    ]
  };
}

export const actions: Array<{
  command?: string;
  commands?: string[];
  message?: string;
  pattern: RegExp;
  callback: (message?: IncomingSlackMessageBody, arg?: string) => void;
}> = [
  {
    command: 'configure',
    message: 'configure settings for the current user',
    pattern: /^configure$/i,
    callback: configureUser
  },
  {
    command: 'configure <team>',
    message: 'configure settings for the specified team',
    pattern: /^configure\s+(.*)$/i,
    callback: configureTeam
  }
];

export async function configureTeam(message: IncomingSlackMessageBody) {
  const team = actions[1].pattern.exec(message.text)[1];
  return configure(message, team, false);
}

export async function configureUser(message: IncomingSlackMessageBody) {
  return configure(message, message.user_id, true);
}

async function configure(message: IncomingSlackMessageBody, team: string, forUser: boolean) {
  // lookup current values
  const user = await findUser(team);
  logger.debug(`Found user ${JSON.stringify(user, null, 2)}`);
  if (user) {
    // extract / build dialog
    return postEphemeral(message, configureExistingTeamPayload(user, forUser));
  } else {
    // confirm creation
    return postEphemeral(message, configureNewTeamPayload(team));
  }
}

export async function handleConfiguration(payload) {
  switch (payload.type) {
    case 'block_actions':
      return handleBlockActions(payload);
    case 'dialog_submission':
      return handleDialogSubmission(payload);
    default:
      logger.error(`Unhandled payload type: ${payload.type}`);
  }
}

async function handleBlockActions(payload) {
  if (isEmpty(payload.actions)) {
    logger.debug('Ignoring empty actions payload');
    return;
  }
  if (payload.actions.length !== 1) {
    logger.warn(`WTF!! MORE THAN ONE ACTION: ${JSON.stringify(payload, null, 2)}`);
  }
  const action = payload.actions[0];
  const actionId = action.action_id;
  const [actionType, team] = parseActionId(actionId);
  switch (actionType) {
    case Action.CHANNEL: {
      const user = await findUser(team);
      user.slack_channel = action.selected_conversation;
      return updateUser(user);
    }
    case Action.NEW_TEAM: {
      const user = await createUser(team);
      return respondEphemeral(payload.response_url, configureExistingTeamPayload(user, team === payload.user.id));
    }
    case Action.GITHUB_USERNAME: {
      const user = await findUser(team);
      return postDialog(payload.trigger_id, {
        title: 'GitHub username',
        callback_id: Action.GITHUB_USERNAME,
        state: actionId,
        elements: [
          {
            type: 'text',
            name: 'github_username',
            label: 'Username',
            value: user.github_user
          }
        ]
      });
    }
    case Action.ADD_SNIPPET: {
      return postDialog(payload.trigger_id, {
        title: 'Add snippet',
        callback_id: Action.ADD_SNIPPET,
        state: actionId,
        elements: [
          {
            type: 'text',
            name: 'snippet',
            label: 'Snippet'
          }
        ]
      });
    }
    case Action.REMOVE_SNIPPET: {
      const user = await findUser(team);
      return postDialog(payload.trigger_id, {
        title: 'Remove snippet',
        callback_id: Action.REMOVE_SNIPPET,
        state: actionId,
        elements: [
          {
            type: 'select',
            name: 'snippet',
            label: 'Snippet',
            options: user.snippets.map(snippet => ({ label: snippet, value: snippet }))
          }
        ]
      });
    }
    case Action.DONE: {
      return deleteOriginal(payload.response_url);
    }
    default:
      logger.error(`Unexpected action type: ${actionType}`);
  }
}

async function handleDialogSubmission(payload) {
  logger.debug(`dialog submission: ${JSON.stringify(payload, null, 2)}`);
  const [actionType, team] = parseActionId(payload.state);
  const user = await findUser(team);
  switch (actionType) {
    case Action.GITHUB_USERNAME: {
      const username = payload.submission.github_username;
      logger.info(`update user ${user.name} with github_username ${username}`);
      user.github_user = username;
      break;
    }
    case Action.ADD_SNIPPET: {
      const snippet = payload.submission.snippet;
      user.snippets = user.snippets || [];
      if (user.snippets.includes(snippet)) {
        return;
      }
      user.snippets.push(snippet);
      break;
    }
    case Action.REMOVE_SNIPPET: {
      const snippet = payload.submission.snippet;
      user.snippets = user.snippets.filter(oldSnippet => oldSnippet !== snippet);
      break;
    }
  }
  await updateUser(user);
  return respondEphemeral(payload.response_url, configureExistingTeamPayload(user, user.name === payload.user.id));
}
