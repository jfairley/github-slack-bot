import * as nock from 'nock';
import { slack } from '..';
import * as moment from 'moment';

describe('slack function', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis()
    };
  });

  describe('verification', () => {
    it('should reject request missing headers', async () => {
      await slack(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Error: Unable to verify slack secret');
      expect(res.end).toHaveBeenCalled();
    });

    it('should reject expired request', async () => {
      req.headers['x-slack-signature'] = '';
      req.headers['x-slack-request-timestamp'] = moment()
        .subtract(6, 'minutes')
        .unix()
        .toString();
      await slack(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Error: Unable to verify slack secret');
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('configure team', () => {
    it('should handle not configured team', async () => {
      nock('https://api.slack.com');
      await slack(req, res);
    });
  });
});
