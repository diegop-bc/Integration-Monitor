import { supabase } from '../lib/supabase';
import type { GroupRole } from '../types/group';

export interface SendInvitationEmailRequest {
  email: string;
  groupName: string;
  inviterName: string;
  role: GroupRole;
  token: string;
}

export class EmailService {
  /**
   * Send invitation email using Supabase Edge Function
   */
  async sendInvitationEmail(request: SendInvitationEmailRequest): Promise<void> {
    try {
      console.log('Sending invitation email via Edge Function:', {
        email: request.email,
        groupName: request.groupName,
        role: request.role
      });

      const { data, error } = await supabase.functions.invoke('send-invitation', {
        body: {
          email: request.email,
          groupName: request.groupName,
          inviterName: request.inviterName,
          role: request.role,
          token: request.token,
        }
      });

      if (error) {
        console.error('Edge Function error:', error);
        throw new Error(`Failed to send invitation email: ${error.message}`);
      }

      if (!data?.success) {
        console.error('Email sending failed:', data);
        throw new Error('Failed to send invitation email');
      }

      console.log('Invitation email sent successfully:', data);
    } catch (err) {
      console.error('EmailService error:', err);
      throw err instanceof Error ? err : new Error('Unknown email service error');
    }
  }
}

export const emailService = new EmailService(); 