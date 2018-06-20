import { StatusState } from './status-webhook';
import { Userish } from './userish';

export interface Status {
  url: string;
  id: number;
  node_id: string;
  state: StatusState;
  description: string;
  target_url: string;
  context: string;
  created_at: string;
  updated_at: string;
  creator: Userish;
}
