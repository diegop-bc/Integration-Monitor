import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, groupName, inviterName, role, token } = await req.json()

    // Get Resend API key from environment
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    // Create invitation URL
    const invitationUrl = `${Deno.env.get('FRONTEND_URL') || 'http://localhost:5173'}/invite/${token}?email=${encodeURIComponent(email)}`

    // Create email content
    const emailContent = {
      from: 'Integration Monitor <no-reply@postman.integrations.me>',
      to: [email],
      subject: `You're invited to join ${groupName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>You're invited to join ${groupName}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .card { background: white; border-radius: 8px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
              .header { text-align: center; margin-bottom: 32px; }
              .logo { width: 48px; height: 48px; background: #3b82f6; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; margin-bottom: 16px; }
              .title { font-size: 24px; font-weight: bold; color: #111827; margin: 0; }
              .subtitle { color: #6b7280; margin: 8px 0 0 0; }
              .content { margin-bottom: 32px; }
              .content p { color: #374151; line-height: 1.6; margin: 16px 0; }
              .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; }
              .button:hover { background: #2563eb; }
              .footer { border-top: 1px solid #e5e7eb; padding-top: 24px; color: #6b7280; font-size: 14px; }
              .role-badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 500; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="card">
                <div class="header">
                  <div class="logo">IM</div>
                  <h1 class="title">You're invited to join the team!</h1>
                  <p class="subtitle">Join <strong>${groupName}</strong> and start collaborating</p>
                </div>
                
                <div class="content">
                  <p>Hi there! 👋</p>
                  <p><strong>${inviterName}</strong> has invited you to join <strong>${groupName}</strong> on Integration Monitor as a <span class="role-badge">${role.charAt(0).toUpperCase() + role.slice(1)}</span>.</p>
                  <p>Integration Monitor helps teams track and monitor updates from their favorite tools and services in one centralized dashboard.</p>
                  <p>Click the button below to accept your invitation and create your account:</p>
                  
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${invitationUrl}" class="button">Accept Invitation & Join Team</a>
                  </div>
                  
                  <p><strong>What you'll be able to do:</strong></p>
                  <ul style="color: #374151; line-height: 1.6;">
                    ${role === 'admin' ? '<li>Manage team members and group settings</li>' : ''}
                    ${role === 'admin' || role === 'member' ? '<li>Add and manage integrations</li>' : ''}
                    <li>View all integration updates in real-time</li>
                    <li>Get notified about important changes</li>
                    ${role === 'viewer' ? '<li>Read-only access to all group content</li>' : ''}
                  </ul>
                </div>
                
                <div class="footer">
                  <p>This invitation will expire in 7 days. If you have any questions, please contact ${inviterName}.</p>
                  <p>If you can't click the button above, copy and paste this link into your browser:<br>
                     <a href="${invitationUrl}" style="color: #3b82f6;">${invitationUrl}</a>
                  </p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
You're invited to join ${groupName}!

${inviterName} has invited you to join ${groupName} on Integration Monitor as a ${role}.

Integration Monitor helps teams track and monitor updates from their favorite tools and services in one centralized dashboard.

To accept your invitation and create your account, visit:
${invitationUrl}

This invitation will expire in 7 days.

If you have any questions, please contact ${inviterName}.
      `.trim()
    }

    // Send email using Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailContent),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Resend API error:', error)
      throw new Error(`Failed to send email: ${response.status}`)
    }

    const result = await response.json()
    console.log('Email sent successfully:', result)

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error sending invitation email:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
}) 