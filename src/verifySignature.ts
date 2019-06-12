import * as crypto from 'crypto';
import * as moment from 'moment';
import * as timingSafeCompare from 'tsscmp';

export function isVerified(req) {
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
  const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET);
  hmac.update(`${version}:${timestamp}:${req.rawBody}`);
  return timingSafeCompare(hmac.digest('hex'), hash);
}
