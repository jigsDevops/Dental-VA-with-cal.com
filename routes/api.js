import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Helper function to read log files
function readLogFile(filename) {
  try {
    if (!fs.existsSync(filename)) {
      return [];
    }
    const data = fs.readFileSync(filename, 'utf8');
    return data.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error(`Error reading log file ${filename}:`, error);
    return [];
  }
}

// Get call logs
router.get('/logs/calls', (req, res) => {
  const filter = req.query.filter || 'all';
  
  try {
    // In a real implementation, you would query a database
    // For this example, we'll read from log files created by N8N
    const incomingCallLogs = readLogFile(path.resolve('./logs/call_logs.json'));
    const outboundCallLogs = readLogFile(path.resolve('./logs/outbound_call_logs.json'));
    const callStatusLogs = readLogFile(path.resolve('./logs/call_status_logs.json'));
    
    // Combine and filter logs
    let logs = [];
    
    if (filter === 'all' || filter === 'incoming') {
      logs = logs.concat(incomingCallLogs);
    }
    
    if (filter === 'all' || filter === 'outbound') {
      logs = logs.concat(outboundCallLogs);
    }
    
    // Add call status information
    logs = logs.map(log => {
      if (log.callSid) {
        const statusLog = callStatusLogs.find(status => status.callSid === log.callSid);
        if (statusLog) {
          return { ...log, callStatus: statusLog.callStatus };
        }
      }
      return log;
    });
    
    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(logs);
  } catch (error) {
    console.error('Error retrieving call logs:', error);
    res.status(500).json({ error: 'Failed to retrieve call logs' });
  }
});

// Get email logs
router.get('/logs/emails', (req, res) => {
  try {
    // In a real implementation, you would query a database
    const emailLogs = readLogFile(path.resolve('./logs/email_logs.json'));
    res.json(emailLogs);
  } catch (error) {
    console.error('Error retrieving email logs:', error);
    res.status(500).json({ error: 'Failed to retrieve email logs' });
  }
});

// Get system logs
router.get('/logs/system', (req, res) => {
  const level = req.query.level || 'all';
  
  try {
    // In a real implementation, you would query a database or parse log files
    const logFile = path.resolve('./combined.log');
    let logs = readLogFile(logFile);
    
    // Filter by level if specified
    if (level !== 'all') {
      logs = logs.filter(log => log.level === level);
    }
    
    res.json(logs);
  } catch (error) {
    console.error('Error retrieving system logs:', error);
    res.status(500).json({ error: 'Failed to retrieve system logs' });
  }
});

export default router;
