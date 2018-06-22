import { IssueState } from './issue-state';
import { Link } from './link';
import { PullRequestReviewAction } from './pull-request-review-action';
import { Repository } from './repository';
import { ReviewState } from './review-state';
import { Userish } from './userish';

export interface PullRequestReviewWebhook {
  action: PullRequestReviewAction;
  review: {
    id: number;
    node_id: string;
    user: Userish;
    body: string;
    commit_id: string;
    submitted_at: string;
    state: ReviewState;
    html_url: string;
    pull_request_url: string;
    author_association: string;
    _links: {
      html: Link;
      pull_request: Link;
    };
  };
  pull_request: {
    url: string;
    id: number;
    node_id: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
    issue_url: string;
    number: number;
    state: IssueState;
    locked: boolean;
    title: string;
    user: Userish;
    body: string;
    created_at: string;
    updated_at: string;
    closed_at: string;
    merged_at: string;
    merge_commit_sha: string;
    assignee: Userish;
    assignees: Userish[];
    requested_reviewers: Userish[];
    requested_teams: any[];
    labels: any[];
    milestone: string;
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
  };
  repository: Repository;
  sender: Userish;
}
