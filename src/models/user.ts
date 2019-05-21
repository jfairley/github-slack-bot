import { Datastore } from '@google-cloud/datastore';
import { logger } from '../logger';

export interface User {
  id: string;
  name: string;
  github_user?: string;
  slack_channel?: string;
  snippets?: string[];
}

const kind = 'user';

// Instantiate a datastore client
logger.debug('creating data store ...');
const datastore = new Datastore();
logger.debug('data store created ...');

export async function createUser(name: string): Promise<User> {
  const userKey = datastore.key([kind, name]);
  await datastore.save({
    key: userKey,
    data: [
      {
        name: 'name',
        value: name
      }
    ]
  });
  return findUser(name);
}

export async function findUser(name: string): Promise<User | undefined> {
  return (await datastore.get(datastore.key([kind, name])))[0];
}

export async function findUsers(): Promise<User[]> {
  return datastore.get(datastore.key(kind));
}

export async function updateUser(user: User) {
  const userKey = datastore.key([kind, user.name]);
  await datastore.save({
    key: userKey,
    data: user
  });
}
