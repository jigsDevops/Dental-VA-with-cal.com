import express from 'express';
import https from 'https';
import twilio from 'twilio';
import cron from 'node-cron';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import winston from 'winston';
import path from 'path';
import 'dotenv/config';
import apiRoutes from './routes/api.js';

// Initialize Express app
const app = express();
const port = 3000;

// Configure middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Register API routes
app.use('/api', apiRoutes);

// Serve admin interface
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve('./admin.html'));
});


// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'healthcare-appointment-system' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Load environment variables
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;
const ULTRAVOX_API_URL = "https://api.ultravox.ai/api/calls";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
const CALCOM_EVENT_TYPE_ID = process.env.CALCOM_EVENT_TYPE_ID;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const REMINDER_HOURS_BEFORE = parseInt(process.env.REMINDER_HOURS_BEFORE || '24');
const OUTBOUND_CALL_TIME = process.env.OUTBOUND_CALL_TIME || '09:00';

// Validate required environment variables
const requiredEnvVars = [
  'ULTRAVOX_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'CALCOM_API_KEY',
  'CALCOM_EVENT_TYPE_ID',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'N8N_WEBHOOK_URL'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Initialize Twilio client
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Initialize Gmail API
const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// Ultravox configuration for healthcare appointments
const HEALTHCARE_SYSTEM_PROMPT = `Your name is Dr. AI Assistant and you are handling calls for a healthcare clinic.

When speaking with patients:
1. Greet them warmly and introduce yourself as the clinic's appointment assistant.
2. Help patients with booking new appointments, rescheduling existing appointments, or canceling appointments.
3. For new appointments, collect:
   - Patient name
   - Reason for visit
   - Preferred date and time
   - Insurance information if applicable
4. For rescheduling, ask for:
   - Patient name
   - Current appointment details
   - Preferred new date and time
5. For cancellations, confirm:
   - Patient name
   - Appointment details to be canceled
   - Reason for cancellation (optional)

Always be professional, empathetic, and respectful of patient privacy.
Remind patients that this call may be recorded for quality assurance.
If you cannot assist with a specific request, offer to connect them with a human staff member.
`;

const ULTRAVOX_CALL_CONFIG_BASE = {
  model: 'fixie-ai/ultravox',
  voice: 'Allison', // Professional female voice for healthcare
  temperature: 0.2, // Lower temperature for more consistent responses
  firstSpeaker: 'FIRST_SPEAKER_AGENT',
  medium: { "twilio": {} }
};

// Create Ultravox call and get Join URL
async function createUltravoxCall(config) {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': ULTRAVOX_API_KEY
    }
  };

  return new Promise((resolve, reject) => {
    const request = https.request(ULTRAVOX_API_URL, options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            logger.error(`Ultravox API Error: ${response.statusCode}`, data);
            reject(new Error(`Ultravox API request failed with status ${response.statusCode}`));
          }
        } catch (parseError) {
          logger.error("Error parsing Ultravox response:", parseError);
          reject(parseError);
        }
      });
    });

    request.on('error', (error) => {
      logger.error("Error making Ultravox request:", error);
      reject(error);
    });

    request.write(JSON.stringify(config));
    request.end();
  });
}

// Cal.com API functions
async function getCalComAvailability(date) {
  try {
    const response = await fetch(`https://api.cal.com/v1/availability?eventTypeId=${CALCOM_EVENT_TYPE_ID}&date=${date}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CALCOM_API_KEY}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Cal.com API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Error fetching Cal.com availability:', error);
    throw error;
  }
}

async function createCalComBooking(bookingData) {
  try {
    const response = await fetch(`https://api.cal.com/v1/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CALCOM_API_KEY}`
      },
      body: JSON.stringify({
        eventTypeId: CALCOM_EVENT_TYPE_ID,
        ...bookingData
      })
    });
    
    if (!response.ok) {
      throw new Error(`Cal.com API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Error creating Cal.com booking:', error);
    throw error;
  }
}

async function rescheduleCalComBooking(bookingId, rescheduleData) {
  try {
    const response = await fetch(`https://api.cal.com/v1/bookings/${bookingId}/reschedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CALCOM_API_KEY}`
      },
      body: JSON.stringify(rescheduleData)
    });
    
    if (!response.ok) {
      throw new Error(`Cal.com API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Error rescheduling Cal.com booking:', error);
    throw error;
  }
}

async function cancelCalComBooking(bookingId) {
  try {
    const response = await fetch(`https://api.cal.com/v1/bookings/${bookingId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CALCOM_API_KEY}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Cal.com API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Error canceling Cal.com booking:', error);
    throw error;
  }
}

async function getCalComBookings(filters = {}) {
  try {
    const queryParams = new URLSearchParams(filters).toString();
    const response = await fetch(`https://api.cal.com/v1/bookings?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CALCOM_API_KEY}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Cal.com API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Error fetching Cal.com bookings:', error);
    throw error;
  }
}

// Gmail API functions
async function sendEmailReminder(appointment) {
  try {
    const emailContent = `
      Subject: Appointment Reminder: ${appointment.title}
      
      Dear ${appointment.attendees[0].name},
      
      This is a friendly reminder about your upcoming appointment:
      
      Date: ${new Date(appointment.startTime).toLocaleDateString()}
      Time: ${new Date(appointment.startTime).toLocaleTimeString()}
      
      If you need to reschedule, please call our office at ${TWILIO_PHONE_NUMBER}.
      
      Thank you,
      Healthcare Clinic
    `;

    const encodedEmail = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
      },
    });

    logger.info(`Email reminder sent to ${appointment.attendees[0].email} for appointment on ${new Date(appointment.startTime).toLocaleString()}`);
    return true;
  } catch (error) {
    logger.error('Error sending email reminder:', error);
    return false;
  }
}

// N8N Integration
async function triggerN8NWorkflow(eventType, data) {
  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventType,
        data
      })
    });
    
    if (!response.ok) {
      throw new Error(`N8N webhook error: ${response.status}`);
    }
    
    logger.info(`N8N workflow triggered: ${eventType}`);
    return await response.json();
  } catch (error) {
    logger.error(`Error triggering N8N workflow (${eventType}):`, error);
    throw error;
  }
}

// Handle incoming calls for appointment management
app.post('/incoming', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    // Get caller's phone number
    const callerNumber = req.body.From;
    if (!callerNumber) {
      logger.warn('Incoming call without a "From" number.');
      twiml.say('Sorry, we could not identify your number. Please try again.');
      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }
    logger.info(`Incoming call from: ${callerNumber}`);

    // Log call to N8N
    await triggerN8NWorkflow('incomingCall', {
      callerNumber,
      timestamp: new Date().toISOString(),
      callSid: req.body.CallSid
    });

    // Try to find patient by phone number
    let patientInfo = null;
    try {
      // This would typically be a database lookup
      // For now, we'll just use the phone number as identifier
      patientInfo = { phoneNumber: callerNumber };
    } catch (error) {
      logger.error('Error finding patient by phone number:', error);
    }

    // Create dynamic system prompt with caller's info
    const dynamicSystemPrompt = `${HEALTHCARE_SYSTEM_PROMPT}

IMPORTANT CONTEXT:
- The caller's phone number is: ${callerNumber}
${patientInfo ? `- This appears to be an existing patient.` : '- This may be a new patient.'}

Your goal is to help the patient book, reschedule, or cancel an appointment. Collect all necessary information to complete their request.`;

    // Create the final Ultravox call config
    const callConfig = {
      ...ULTRAVOX_CALL_CONFIG_BASE,
      systemPrompt: dynamicSystemPrompt
    };

    // Create Ultravox call with updated config
    logger.info("Creating Ultravox call with config:", JSON.stringify(callConfig));
    const { joinUrl } = await createUltravoxCall(callConfig);
    logger.info(`Received Ultravox joinUrl: ${joinUrl}`);

    // Connect the call to the Ultravox stream
    const connect = twiml.connect();
    connect.stream({
      url: joinUrl,
      name: 'Healthcare Appointment Assistant'
    });

    // Send the TwiML response
    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    logger.error('Error handling incoming call:', error);
    twiml.say('Sorry, there was an error connecting your call. Please try again later.');
    res.type('text/xml');
    res.status(500).send(twiml.toString());
  }
});

// Make outbound call for appointment reminder
async function makeOutboundCall(appointment) {
  try {
    // Get patient phone number from appointment
    const patientPhone = appointment.attendees[0].phone;
    if (!patientPhone) {
      logger.error(`No phone number found for appointment ${appointment.id}`);
      return false;
    }

    // Create dynamic system prompt for outbound reminder call
    const reminderPrompt = `${HEALTHCARE_SYSTEM_PROMPT}

IMPORTANT CONTEXT:
- This is an OUTBOUND call to remind a patient of their upcoming appointment.
- Patient Name: ${appointment.attendees[0].name}
- Appointment Date: ${new Date(appointment.startTime).toLocaleDateString()}
- Appointment Time: ${new Date(appointment.startTime).toLocaleTimeString()}
- Appointment Type: ${appointment.title}

Your goal is to:
1. Confirm the patient is aware of their upcoming appointment
2. Ask if they still plan to attend
3. If they need to reschedule, collect their preferred new date/time
4. If they need to cancel, confirm the cancellation
5. Thank them for their time`;

    // Create Ultravox call config for outbound call
    const outboundCallConfig = {
      ...ULTRAVOX_CALL_CONFIG_BASE,
      systemPrompt: reminderPrompt
    };

    // Create Ultravox call
    logger.info(`Creating outbound reminder call for appointment ${appointment.id}`);
    const { joinUrl } = await createUltravoxCall(outboundCallConfig);

    // Make the outbound call with Twilio
    const call = await twilioClient.calls.create({
      url: `${req.protocol}://${req.get('host')}/outbound-connect?joinUrl=${encodeURIComponent(joinUrl)}`,
      to: patientPhone,
      from: TWILIO_PHONE_NUMBER,
      statusCallback: `${req.protocol}://${req.get('host')}/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST'
    });

    logger.info(`Outbound call initiated: ${call.sid}`);

    // Log to N8N
    await triggerN8NWorkflow('outboundCall', {
      appointmentId: appointment.id,
      patientPhone,
      callSid: call.sid,
      timestamp: new Date().toISOString()
    });

    return true;
  } catch (error) {
    logger.error('Error making outbound call:', error);
    return false;
  }
}

// Handle outbound call connection
app.post('/outbound-connect', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const joinUrl = req.query.joinUrl;

  if (!joinUrl) {
    logger.error('No joinUrl provided for outbound call');
    twiml.say('Sorry, there was an error connecting this call.');
    res.type('text/xml');
    res.send(twiml.toString());
    return;
  }

  try {
    // Connect to Ultravox stream
    const connect = twiml.connect();
    connect.stream({
      url: joinUrl,
      name: 'Healthcare Appointment Reminder'
    });

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    logger.error('Error connecting outbound call:', error);
    twiml.say('Sorry, there was an error connecting this call.');
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Track call status
app.post('/call-status', async (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  
  logger.info(`Call ${callSid} status: ${callStatus}`);
  
  // Log to N8N
  await triggerN8NWorkflow('callStatusUpdate', {
    callSid,
    callStatus,
    timestamp: new Date().toISOString()
  });
  
  res.sendStatus(200);
});

// Admin API to configure reminder settings
app.post('/admin/settings', (req, res) => {
  try {
    const { reminderHoursBefore, outboundCallTime } = req.body;
    
    if (reminderHoursBefore) {
      process.env.REMINDER_HOURS_BEFORE = reminderHoursBefore.toString();
    }
    
    if (outboundCallTime) {
      process.env.OUTBOUND_CALL_TIME = outboundCallTime;
    }
    
    logger.info('Admin settings updated', { reminderHoursBefore, outboundCallTime });
    res.status(200).json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    logger.error('Error updating admin settings:', error);
    res.status(500).json({ success: false, message: 'Error updating settings' });
  }
});

// Schedule daily tasks
// 1. Send email reminders to all patients with appointments today
cron.schedule('0 7 * * *', async () => {
  logger.info('Running scheduled task: Send email reminders');
  
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Get all appointments for today
    const appointments = await getCalComBookings({ date: today });
    
    logger.info(`Found ${appointments.length} appointments for today`);
    
    // Send email reminder for each appointment
    for (const appointment of appointments) {
      const emailSent = await sendEmailReminder(appointment);
      
      // Log to N8N
      await triggerN8NWorkflow('emailReminderSent', {
        appointmentId: appointment.id,
        patientEmail: appointment.attendees[0].email,
        success: emailSent,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Error in scheduled email reminder task:', error);
  }
});

// 2. Make outbound reminder calls at configured time
cron.schedule(`0 ${OUTBOUND_CALL_TIME.split(':')[0]} ${OUTBOUND_CALL_TIME.split(':')[1]} * * *`, async () => {
  logger.info('Running scheduled task: Make outbound reminder calls');
  
  try {
    // Calculate the date for appointments to remind (based on REMINDER_HOURS_BEFORE)
    const targetDate = new Date();
    targetDate.setHours(targetDate.getHours() + REMINDER_HOURS_BEFORE);
    const reminderDate = targetDate.toISOString().split('T')[0];
    
    // Get all appointments for the target date
    const appointments = await getCalComBookings({ date: reminderDate });
    
    logger.info(`Found ${appointments.length} appointments for reminder calls on ${reminderDate}`);
    
    // Make outbound call for each appointment (with a delay between calls)
    for (const appointment of appointments) {
      await makeOutboundCall(appointment);
      
      // Add a delay between calls to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 60000)); // 1-minute delay
    }
  } catch (error) {
    logger.error('Error in scheduled outbound call task:', error);
  }
});

// Start server
app.listen(port, () => {
  logger.info(`Healthcare appointment system running on port ${port}`);
});
