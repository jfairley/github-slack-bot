import { Commit } from './commit';
import { Organization } from './organization';
import { Repository } from './repository';
import { Userish } from './userish';

export enum StatusState {
  ERROR = 'error',
  FAILURE = 'failure',
  PENDING = 'pending',
  SUCCESS = 'success'
}

export interface StatusWebhook {
  id: number;
  sha: string;
  name: string;
  target_url: string;
  context: string;
  description: string;
  state: StatusState;
  commit: Commit;
  branches: any[];
  created_at: string;
  updated_at: string;
  repository: Repository;
  organization: Organization;
  sender: Userish;
}
