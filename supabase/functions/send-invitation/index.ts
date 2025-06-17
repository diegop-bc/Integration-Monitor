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
      from: 'integrations.me <no-reply@postman.integrations.me>',
      to: [email],
      subject: `You're invited to join ${groupName} on integrations.me`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #3B82F6, #8B5CF6); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
              .role-badge { background: #E5E7EB; color: #374151; padding: 2px 8px; border-radius: 12px; font-size: 0.875rem; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 1.5rem;">integrations.me</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">RSS Changelog Monitoring</p>
              </div>
              <div class="content">
                <h2>You're invited to join a team!</h2>
                
                <p><strong>${inviterName}</strong> has invited you to join <strong>${groupName}</strong> on integrations.me as a <span class="role-badge">${role.charAt(0).toUpperCase() + role.slice(1)}</span>.</p>
                <p>integrations.me helps teams track and monitor updates from their favorite tools and services in one centralized dashboard.</p>
                
                <p><strong>What you'll get access to:</strong></p>
                <ul>
                  <li>📊 Unified dashboard for all your integrations</li>
                  <li>🔔 Real-time notifications for updates</li>
                  <li>📈 Timeline view of all changes</li>
                  <li>👥 Collaborate with your team</li>
                </ul>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${invitationUrl}" class="button">Accept Invitation</a>
                </div>
                
                <p style="font-size: 0.875rem; color: #6B7280;">
                  If you're having trouble clicking the button, copy and paste this URL into your browser:<br>
                  <a href="${invitationUrl}" style="color: #3B82F6; word-break: break-all;">${invitationUrl}</a>
                </p>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
                
                <p style="font-size: 0.875rem; color: #6B7280; margin: 0;">
                  This invitation was sent by ${inviterName} (${Deno.env.get('FRONTEND_URL') || 'http://localhost:5173'}). 
                  If you weren't expecting this invitation, you can safely ignore this email.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
You're invited to join ${groupName} on integrations.me!

${inviterName} has invited you to join ${groupName} on integrations.me as a ${role}.

integrations.me helps teams track and monitor updates from their favorite tools and services in one centralized dashboard.

Accept your invitation: ${invitationUrl}

If you weren't expecting this invitation, you can safely ignore this email.
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