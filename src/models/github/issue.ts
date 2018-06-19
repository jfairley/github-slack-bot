import { MergeableState } from './mergeable-state';
import { Repository } from './repository';
import { Userish } from './userish';

interface Link {
  href: string;
}

interface Label {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
}

export interface Issue {
  url: string;
  id: number;
  node_id: string;
  html_url: string;
  diff_url: string;
  patch_url: string;
  issue_url: string;
  number: number;
  state: 'open' | 'closed' | 'all';
  locked: boolean;
  title: string;
  user: Userish;
  body: string;
  created_at: string;
  updated_at: string;
  closed_at: string;
  merged_at: string;
  merge_commit_sha: string;
  assignee?: Userish;
  assignees: Userish[];
  requested_reviewers: Userish[];
  requested_teams: any[];
  labels: Label[];
  milestone: null;
  commits_url: string;
  review_comments_url: string;
  review_comment_url: string;
  comments_url: string;
  statuses_url: string;
  head: {
    label: string;
    ref: string;
    sha: string;
    user: Userish;
    repo: Repository;
  };
  base: {
    label: string;
    ref: string;
    sha: string;
    user: Userish;
    repo: Repository;
  };
  _links: {
    self: Link;
    html: Link;
    issue: Link;
    comments: Link;
    review_comments: Link;
    review_comment: Link;
    commits: Link;
    statuses: Link;
  };
  author_association: string;
  merged: boolean;
  mergeable: boolean;
  rebaseable: boolean;
  mergeable_state: MergeableState;
  merged_by: Userish;
  comments: number;
  review_comments: number;
  maintainer_can_modify: boolean;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
}
