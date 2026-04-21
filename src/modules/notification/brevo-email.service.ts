import { Injectable, Logger } from '@nestjs/common';

const BREVO_API_URL = 'https://api.sendinblue.com/v3/smtp/email';

const TEMPLATE_IDS = {
  EMERGENCY_MOVEMENT_ALERT: 11,
} as const;

type BrevoRecipient = { email: string; name?: string };

@Injectable()
export class BrevoEmailService {
  private readonly logger = new Logger(BrevoEmailService.name);

  private getConfig() {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || 'Calico';

    if (!apiKey) {
      throw new Error('BREVO_API_KEY environment variable is not configured');
    }
    if (!senderEmail) {
      throw new Error(
        'BREVO_SENDER_EMAIL environment variable is not configured',
      );
    }

    return { apiKey, senderEmail, senderName };
  }

  private async sendBrevoEmail({
    to,
    templateId,
    params,
  }: {
    to: BrevoRecipient | BrevoRecipient[];
    templateId: number;
    params: Record<string, string>;
  }) {
    const { apiKey, senderEmail, senderName } = this.getConfig();
    const recipients = Array.isArray(to) ? to : [to];

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': apiKey,
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: recipients,
        templateId,
        params,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Brevo API error (${response.status}): ${errorText || 'no details'}`,
      );
      throw new Error(`Brevo email failed (${response.status})`);
    }

    return { success: true };
  }

  /**
   * Uses Brevo templateId 11 by default.
   *
   * Suggested template params in Brevo:
   * - ALERT_CONTACT_NAME
   * - STUDENT_NAME
   * - ALERT_REASON
   * - ALERT_TIME
   * - LOCATION
   */
  async sendEmergencyMovementAlertEmail({
    toEmail,
    toName,
    studentName,
    alertReason,
    location,
  }: {
    toEmail: string;
    toName?: string;
    studentName: string;
    alertReason: string;
    location?: string;
  }) {
    const alertTime = new Date().toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
    });

    return this.sendBrevoEmail({
      to: [{ email: toEmail, name: toName || 'Contacto de emergencia' }],
      templateId: TEMPLATE_IDS.EMERGENCY_MOVEMENT_ALERT,
      params: {
        ALERT_CONTACT_NAME: toName || 'Contacto de emergencia',
        STUDENT_NAME: studentName,
        ALERT_REASON: alertReason,
        ALERT_TIME: alertTime,
        LOCATION: location || 'No disponible',
      },
    });
  }
}
