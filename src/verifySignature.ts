import * as crypto from 'crypto';
import * as moment from 'moment';
import * as timingSafeCompare from 'tsscmp';

const { GITHUB_WEBHOOK_SECRET, SLACK_SIGNING_SECRET } = process.env;

export function isGithubVerified(req): boolean {
  const signature: string = req.headers['x-hub-signature'];
  if (!signature) return false;

  // check if the header is the right format
  const [algorithm, checksum] = signature.split('=');
  if (!algorithm || !checksum) return false;

  // validate the signature
  const payload = JSON.stringify(req.body);
  const hmac = crypto.createHmac(algorithm, GITHUB_WEBHOOK_SECRET);
  const hash = hmac.update(payload).digest('hex');
  return checksum && hash && timingSafeCompare(checksum, hash);
}

export function isSlackVerified(req): boolean {
  if (!req || !req.headers) return false;

  // check if the timestamp is too old
  const timestamp = req.headers['x-slack-request-timestamp'];
  if (!timestamp) return false;
  const fiveMinutesAgo = moment().subtract(5, 'minutes');
  if (moment(parseInt(timestamp), 'X').isBefore(fiveMinutesAgo)) return false;

  // check that the request signature matches expected value
  const signature = req.headers['x-slack-signature'];
  if (!signature) return false;
  const [version, hash] = signature.split('=');
  const hmac = crypto.createHmac('sha256', SLACK_SIGNING_SECRET);
  hmac.update(`${version}:${timestamp}:${req.rawBody}`);
  return timingSafeCompare(hmac.digest('hex'), hash);
}
