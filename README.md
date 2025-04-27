# Healthcare Appointment Management System

A comprehensive voice agent application that handles both inbound and outbound calls for healthcare appointment management. This system integrates Ultravox for voice interactions, Twilio for telephony, Cal.com for appointment scheduling, Gmail for email reminders, and N8N for workflow automation.

## Features

### Inbound Call Handling
- Receive incoming calls from patients
- Natural language conversation for appointment booking, rescheduling, and cancellation
- Integration with Cal.com calendar for real-time availability checking
- Confirmation of appointments via voice

### Outbound Call Handling
- Automated appointment reminder calls
- Configurable reminder timing (default: 24 hours before appointment)
- Natural conversation to confirm attendance or handle rescheduling requests

### Email Reminders
- Automated email reminders to patients with appointments
- Sent daily at 7:00 AM for all appointments scheduled that day

### Admin Configuration
- API endpoint to configure reminder timings
- Customizable outbound call schedule

### Logging and Tracking
- Comprehensive logging of all communications
- Integration with N8N for workflow automation and tracking
- Call status monitoring and reporting

## Prerequisites

- Node.js (v14 or higher)
- An Ultravox API key
- A Twilio account with:
  - Account SID
  - Auth Token
  - A phone number
- A Cal.com account with:
  - API key
  - Existing event type
- Gmail API credentials:
  - Client ID
  - Client Secret
  - Refresh Token
- N8N instance with a webhook URL
- A way to expose your local server to the internet (e.g., ngrok)

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure your environment variables by creating a `.env` file with the following variables:
   ```
   # API Keys and Configuration
   ULTRAVOX_API_KEY=YOUR_ULTRAVOX_API_KEY_HERE
   TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID_HERE
   TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN_HERE
   TWILIO_PHONE_NUMBER=YOUR_TWILIO_PHONE_NUMBER_HERE

   # Cal.com Integration
   CALCOM_API_KEY=YOUR_CALCOM_API_KEY_HERE
   CALCOM_EVENT_TYPE_ID=YOUR_CALCOM_EVENT_TYPE_ID_HERE

   # Gmail API Integration
   GMAIL_CLIENT_ID=YOUR_GMAIL_CLIENT_ID_HERE
   GMAIL_CLIENT_SECRET=YOUR_GMAIL_CLIENT_SECRET_HERE
   GMAIL_REFRESH_TOKEN=YOUR_GMAIL_REFRESH_TOKEN_HERE

   # N8N Integration
   N8N_WEBHOOK_URL=YOUR_N8N_WEBHOOK_URL_HERE

   # Reminder Configuration
   REMINDER_HOURS_BEFORE=24
   OUTBOUND_CALL_TIME=09:00
   ```
4. Start your server:
   ```
   npm start
   ```
5. Expose your local server using ngrok or similar:
   ```
   ngrok http 3000
   ```
6. Configure your Twilio webhook:
   - Go to your Twilio phone number settings
   - Set the webhook URL for incoming calls to: `https://your-ngrok-url/incoming`
   - Make sure the HTTP method is set to POST

## API Endpoints

### Inbound Call Handling
- `POST /incoming` - Webhook for incoming Twilio calls

### Outbound Call Handling
- `POST /outbound-connect` - Connects outbound calls to Ultravox
- `POST /call-status` - Receives call status updates from Twilio

### Admin Configuration
- `POST /admin/settings` - Update reminder settings
  - Request body:
    ```json
    {
      "reminderHoursBefore": 24,
      "outboundCallTime": "09:00"
    }
    ```

## Scheduled Tasks

- **Email Reminders**: Runs daily at 7:00 AM to send email reminders for appointments scheduled that day
- **Outbound Reminder Calls**: Runs at the configured time (default: 9:00 AM) to make calls for appointments scheduled for the next day (or as configured by `REMINDER_HOURS_BEFORE`)

## N8N Integration

The system triggers N8N workflows for the following events:

- `incomingCall` - When a new call is received
- `outboundCall` - When an outbound reminder call is made
- `callStatusUpdate` - When a call status changes
- `emailReminderSent` - When an email reminder is sent

## Troubleshooting

- Check the log files (`error.log` and `combined.log`) for detailed error information
- Ensure all API keys and credentials are correctly set in the `.env` file
- Verify that your ngrok URL is properly set in Twilio
- Ensure your server is running and accessible

## License

ISC
