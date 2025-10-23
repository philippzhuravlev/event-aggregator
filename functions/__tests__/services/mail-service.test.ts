import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import nodemailer from 'nodemailer';
import { createMailTransporter, sendAlertEmail } from '../../services/mail-service';
import { logger } from '../../utils/logger';

jest.mock('nodemailer');
jest.mock('../../utils/logger');

// nodemailer has a default export function; cast to any for easier mocking in tests
const mockedNodemailer = nodemailer as unknown as any;

describe('mail-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MAIL_SMTP_HOST;
    delete process.env.MAIL_SMTP_PORT;
    delete process.env.MAIL_SMTP_USER;
    delete process.env.MAIL_SMTP_PASS;
    delete process.env.MAIL_FROM;
  });

  describe('createMailTransporter', () => {
    it('returns null when config incomplete', () => {
      const transporter = createMailTransporter({ host: 'smtp.example.com', port: 587 });
      expect(transporter).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('creates transporter when config complete', () => {
      const fakeTransporter = { sendMail: jest.fn() } as any;
      mockedNodemailer.createTransport.mockReturnValue(fakeTransporter);

      const transporter = createMailTransporter({
        host: 'smtp.example.com',
        port: 587,
        user: 'user',
        pass: 'pass',
      } as any);

      expect(transporter).toBe(fakeTransporter);
      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'smtp.example.com', port: 587 })
      );
    });
  });

  describe('sendAlertEmail', () => {
    it('skips sending when no transporter can be created', async () => {
      // ensure env vars not set -> createMailTransporter will return null
      await sendAlertEmail('subj', 'body', 'to@example.com', null as any);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('sends email using provided transporter', async () => {
  const sendMail = jest.fn(async () => ({}));
  const transporter = { sendMail } as any;

      await sendAlertEmail('subj', 'body', 'to@example.com', transporter);

  expect(sendMail).toHaveBeenCalled();
  const sendMock = sendMail as unknown as jest.Mock;
  const firstArg: any = sendMock.mock.calls[0]![0];
  expect(firstArg.to).toBe('to@example.com');
  expect(firstArg.subject).toBe('subj');
      expect(logger.info).toHaveBeenCalled();
    });

    it('creates transporter from env vars and sends', async () => {
      process.env.MAIL_SMTP_HOST = 'smtp.env.com';
      process.env.MAIL_SMTP_PORT = '587';
      process.env.MAIL_SMTP_USER = 'envuser';
      process.env.MAIL_SMTP_PASS = 'envpass';
      process.env.MAIL_FROM = 'env-from@example.com';

  const sendMail = jest.fn(async () => ({}));
  const fakeTransporter = { sendMail } as any;
      mockedNodemailer.createTransport.mockReturnValue(fakeTransporter);

      await sendAlertEmail('env-subj', 'env-body', 'to2@example.com', undefined as any);

      expect(mockedNodemailer.createTransport).toHaveBeenCalled();
      expect(sendMail).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it('logs error when sendMail throws', async () => {
  const sendMail = jest.fn(async () => { throw new Error('smtp fail'); });
  const transporter = { sendMail } as any;

      await sendAlertEmail('subj', 'body', 'to@example.com', transporter);

      expect(logger.error).toHaveBeenCalled();
    });
  });
});
