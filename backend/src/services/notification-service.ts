import nodemailer from 'nodemailer';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface NotificationConfig {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  fromName: string;
  adminEmail: string;
}

/**
 * Sends email notifications for operational events.
 *
 * Events that trigger notifications:
 * - App crash (health monitor detects process down, max restarts exceeded)
 * - Memory limit exceeded (resource monitor stops a process)
 * - Backup completed or failed
 * - Deployment succeeded or failed
 *
 * Uses nodemailer with SMTP. Configured via environment variables.
 * All sends are fire-and-forget — failures are logged but do not
 * propagate to the caller.
 */
export class NotificationService {
  private transporter: nodemailer.Transporter | null = null;
  private cfg: NotificationConfig;

  constructor() {
    this.cfg = config.notifications;
  }

  /**
   * Initialize the SMTP transport. Safe to call multiple times.
   */
  init(): void {
    if (!this.cfg.enabled) {
      logger.info('Notifications disabled');
      return;
    }

    if (!this.cfg.smtpHost || !this.cfg.adminEmail) {
      logger.warn('Notifications enabled but SMTP host or admin email not configured');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: this.cfg.smtpHost,
      port: this.cfg.smtpPort,
      secure: this.cfg.smtpSecure,
      auth: {
        user: this.cfg.smtpUser,
        pass: this.cfg.smtpPass,
      },
    });

    logger.info(`Notification service initialized (SMTP: ${this.cfg.smtpHost}:${this.cfg.smtpPort})`);
  }

  /**
   * Verify the SMTP connection is working.
   */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.transporter) {
      return { ok: false, error: 'Notifications not initialized' };
    }

    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, error: msg };
    }
  }

  /**
   * Get current notification configuration (passwords masked).
   */
  getConfig(): NotificationConfig & { smtpPass: string } {
    return {
      ...this.cfg,
      smtpPass: this.cfg.smtpPass ? '********' : '',
    };
  }

  /**
   * Send a notification email. Failures are logged, never thrown.
   */
  async send(subject: string, body: string, severity: AlertSeverity = 'info'): Promise<void> {
    if (!this.transporter || !this.cfg.enabled) return;

    const severityLabel = severity.toUpperCase();
    const fullSubject = `[CipherHost] [${severityLabel}] ${subject}`;

    const html = this.buildHtml(subject, body, severity);
    const logoPath = path.resolve(__dirname, '../../..', 'frontend', 'public', 'logo.png');

    try {
      await this.transporter.sendMail({
        from: `"${this.cfg.fromName}" <${this.cfg.fromEmail}>`,
        to: this.cfg.adminEmail,
        subject: fullSubject,
        text: `${severityLabel}: ${subject}\n\n${body}\n\n— CipherHost`,
        html,
        attachments: [{
          filename: 'logo.png',
          path: logoPath,
          cid: 'cipherhost-logo',
        }],
      });

      logger.info(`Notification sent: ${fullSubject}`);
    } catch (error) {
      logger.error(`Failed to send notification "${subject}": ${error}`);
    }
  }

  // ─── Specific alert methods ───

  async alertAppCrashed(appName: string, projectId: string, reason: string): Promise<void> {
    await this.send(
      `Application crashed: ${appName}`,
      `The application "${appName}" (${projectId}) has crashed.\n\nReason: ${reason}\n\nThe process has been marked as CRASHED and will not be restarted automatically. Check the application logs in the CipherHost dashboard and restart manually when the issue is resolved.`,
      'critical'
    );
  }

  async alertMemoryExceeded(appName: string, projectId: string, usedMB: number, limitMB: number): Promise<void> {
    await this.send(
      `Memory limit exceeded: ${appName}`,
      `The application "${appName}" (${projectId}) exceeded its memory limit and was stopped.\n\nUsage: ${usedMB} MB\nLimit: ${limitMB} MB\n\nThe process has been stopped to protect server stability. Increase the memory limit or investigate the memory usage before restarting.`,
      'critical'
    );
  }

  async alertHealthCheckFailed(appName: string, projectId: string, message: string): Promise<void> {
    await this.send(
      `Health check failed: ${appName}`,
      `The HTTP health check for "${appName}" (${projectId}) failed.\n\nDetails: ${message}\n\nThe process is still running but may not be responding to requests.`,
      'warning'
    );
  }

  async alertBackupCompleted(filename: string, sizeKB: number): Promise<void> {
    await this.send(
      'Backup completed',
      `A scheduled backup was created successfully.\n\nFile: ${filename}\nSize: ${sizeKB.toFixed(1)} KB`,
      'info'
    );
  }

  async alertBackupFailed(error: string): Promise<void> {
    await this.send(
      'Backup failed',
      `A scheduled backup failed.\n\nError: ${error}\n\nCheck the server logs and disk space. Manual intervention may be required.`,
      'critical'
    );
  }

  async alertDeploymentCompleted(appName: string, projectId: string): Promise<void> {
    await this.send(
      `Deployment succeeded: ${appName}`,
      `The application "${appName}" (${projectId}) was deployed successfully and is now running.`,
      'info'
    );
  }

  async alertDeploymentFailed(appName: string, projectId: string, error: string): Promise<void> {
    await this.send(
      `Deployment failed: ${appName}`,
      `The deployment of "${appName}" (${projectId}) failed.\n\nError: ${error}`,
      'critical'
    );
  }

  // ─── HTML template ───

  private buildHtml(title: string, body: string, severity: AlertSeverity): string {
    const colors: Record<AlertSeverity, { banner: string; badge: string; badgeText: string }> = {
      info: { banner: '#1e40af', badge: '#3b82f6', badgeText: 'INFO' },
      warning: { banner: '#92400e', badge: '#f59e0b', badgeText: 'WARNING' },
      critical: { banner: '#991b1b', badge: '#ef4444', badgeText: 'CRITICAL' },
    };
    const c = colors[severity];
    const bodyHtml = body.replace(/\n/g, '<br>');
    const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
    .body-wrap { width: 100% !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .body-wrap { width: 100% !important; }
      .inner-pad { padding: 20px 16px !important; }
      .header-pad { padding: 24px 16px !important; }
      .footer-pad { padding: 16px !important; }
      .title-text { font-size: 18px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100%; background-color: #0f1117; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f1117;">
    <tr>
      <td align="center" style="padding: 24px 12px;">

        <!-- Main Container -->
        <table role="presentation" class="body-wrap" width="580" cellpadding="0" cellspacing="0" style="max-width: 580px; width: 100%;">

          <!-- Logo Header -->
          <tr>
            <td align="center" class="header-pad" style="padding: 32px 24px 20px; background-color: #1a1f2e; border: 1px solid #1e293b; border-bottom: none; border-radius: 16px 16px 0 0;">
              <img src="cid:cipherhost-logo" alt="CipherHost" width="120" style="display: block; max-width: 120px; height: auto;" />
            </td>
          </tr>

          <!-- Severity Banner -->
          <tr>
            <td style="background-color: ${c.banner}; border-left: 1px solid #1e293b; border-right: 1px solid #1e293b;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="inner-pad" style="padding: 20px 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right: 12px; vertical-align: middle;">
                          <span style="display: inline-block; background-color: ${c.badge}; color: #ffffff; padding: 3px 10px; border-radius: 100px; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">${c.badgeText}</span>
                        </td>
                        <td style="vertical-align: middle;">
                          <span class="title-text" style="color: #ffffff; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 20px; font-weight: 700; line-height: 1.3;">${title}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td class="inner-pad" style="padding: 28px 24px; background-color: #1a1f2e; border-left: 1px solid #1e293b; border-right: 1px solid #1e293b;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color: #cbd5e1; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; line-height: 1.7;">
                    ${bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="background-color: #1a1f2e; border-left: 1px solid #1e293b; border-right: 1px solid #1e293b; padding: 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="border-top: 1px solid #1e293b; font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Timestamp -->
          <tr>
            <td class="inner-pad" style="padding: 16px 24px; background-color: #1a1f2e; border-left: 1px solid #1e293b; border-right: 1px solid #1e293b;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color: #64748b; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px;">
                    ${timestamp}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" class="footer-pad" style="padding: 20px 24px; background-color: #0f1117; border: 1px solid #1e293b; border-top: none; border-radius: 0 0 16px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="color: #475569; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px; line-height: 1.5;">
                    CipherHost &mdash; Secure Windows Orchestration<br />
                    <span style="color: #334155; font-size: 11px;">Automated alert. Do not reply.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}

// Singleton for use across the application
export const notificationService = new NotificationService();
