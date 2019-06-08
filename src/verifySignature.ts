import * as moment from 'moment';

import crypto = require('crypto');
const timingSafeCompare = require('tsscmp');

export function isVerified(req) {
  if (!req || !req.headers) return false;
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  if (!signature || !timestamp) return false;
  const [version, hash] = signature.split('=');

  // Check if the timestamp is too old
  const fiveMinutesAgo = moment().subtract(5, 'minutes');
  if (moment(parseInt(timestamp)).isBefore(fiveMinutesAgo)) return false;

  const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET);
  hmac.update(`${version}:${timestamp}:${req.rawBody}`);

  // check that the request signature matches expected value
  return timingSafeCompare(hmac.digest('hex'), hash);
}
