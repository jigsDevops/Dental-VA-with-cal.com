// Admin Panel JavaScript

// Fetch call logs from the server
async function fetchCallLogs(filter = 'all') {
  try {
    const response = await fetch('/api/logs/calls?filter=' + filter);
    if (!response.ok) {
      throw new Error('Failed to fetch call logs');
    }
    const logs = await response.json();
    displayCallLogs(logs);
  } catch (error) {
    console.error('Error fetching call logs:', error);
    // Display error message in the UI
    document.getElementById('callLogEntries').innerHTML = `
      <div class="log-entry">
        <span class="status status-error">Error</span>
        <strong>Failed to load call logs</strong>
        <div>${error.message}</div>
      </div>
    `;
  }
}

// Display call logs in the UI
function displayCallLogs(logs) {
  const container = document.getElementById('callLogEntries');
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="log-entry">No call logs found</div>';
    return;
  }
  
  container.innerHTML = logs.map(log => {
    const statusClass = getStatusClass(log.callStatus);
    const callType = log.eventType === 'incomingCall' ? 'Incoming Call' : 'Outbound Call';
    const phoneNumber = log.callerNumber || log.patientPhone || 'Unknown';
    const timestamp = new Date(log.timestamp).toLocaleString();
    
    return `
      <div class="log-entry">
        <span class="status ${statusClass}">${log.callStatus || log.eventType}</span>
        <strong>${callType}</strong> ${phoneNumber ? 'with ' + phoneNumber : ''} at ${timestamp}
        ${log.appointmentId ? `<div>Appointment ID: ${log.appointmentId}</div>` : ''}
        ${log.callSid ? `<div>Call SID: ${log.callSid}</div>` : ''}
      </div>
    `;
  }).join('');
}

// Get appropriate status class based on call status
function getStatusClass(status) {
  if (!status) return 'status-info';
  
  switch(status.toLowerCase()) {
    case 'completed':
    case 'answered':
      return 'status-success';
    case 'busy':
    case 'failed':
    case 'no-answer':
      return 'status-error';
    default:
      return 'status-info';
  }
}

// Fetch email logs from the server
async function fetchEmailLogs() {
  try {
    const response = await fetch('/api/logs/emails');
    if (!response.ok) {
      throw new Error('Failed to fetch email logs');
    }
    const logs = await response.json();
    displayEmailLogs(logs);
  } catch (error) {
    console.error('Error fetching email logs:', error);
    // Display error message in the UI
    document.getElementById('emailLogEntries').innerHTML = `
      <div class="log-entry">
        <span class="status status-error">Error</span>
        <strong>Failed to load email logs</strong>
        <div>${error.message}</div>
      </div>
    `;
  }
}

// Display email logs in the UI
function displayEmailLogs(logs) {
  const container = document.getElementById('emailLogEntries');
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="log-entry">No email logs found</div>';
    return;
  }
  
  container.innerHTML = logs.map(log => {
    const statusClass = log.success ? 'status-success' : 'status-error';
    const status = log.success ? 'Sent' : 'Failed';
    const timestamp = new Date(log.timestamp).toLocaleString();
    
    return `
      <div class="log-entry">
        <span class="status ${statusClass}">${status}</span>
        <strong>Appointment Reminder</strong> to ${log.patientEmail} at ${timestamp}
        ${log.appointmentId ? `<div>Appointment ID: ${log.appointmentId}</div>` : ''}
      </div>
    `;
  }).join('');
}

// Fetch system logs from the server
async function fetchSystemLogs(level = 'all') {
  try {
    const response = await fetch('/api/logs/system?level=' + level);
    if (!response.ok) {
      throw new Error('Failed to fetch system logs');
    }
    const logs = await response.json();
    displaySystemLogs(logs);
  } catch (error) {
    console.error('Error fetching system logs:', error);
    // Display error message in the UI
    document.getElementById('systemLogEntries').innerHTML = `
      <div class="log-entry">
        <span class="status status-error">Error</span>
        <strong>Failed to load system logs</strong>
        <div>${error.message}</div>
      </div>
    `;
  }
}

// Display system logs in the UI
function displaySystemLogs(logs) {
  const container = document.getElementById('systemLogEntries');
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="log-entry">No system logs found</div>';
    return;
  }
  
  container.innerHTML = logs.map(log => {
    const levelClass = getLevelClass(log.level);
    const timestamp = new Date(log.timestamp).toLocaleString();
    
    return `
      <div class="log-entry">
        <span class="status ${levelClass}">${log.level.toUpperCase()}</span>
        <strong>${timestamp}</strong> - ${log.message}
      </div>
    `;
  }).join('');
}

// Get appropriate class based on log level
function getLevelClass(level) {
  if (!level) return 'status-info';
  
  switch(level.toLowerCase()) {
    case 'error':
      return 'status-error';
    case 'warn':
    case 'warning':
      return 'status-warning';
    case 'info':
    default:
      return 'status-info';
  }
}

// Initialize event listeners when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Load initial data
  fetchCallLogs();
  fetchEmailLogs();
  fetchSystemLogs();
  
  // Set up filter change handlers
  document.getElementById('callLogFilter').addEventListener('change', (e) => {
    fetchCallLogs(e.target.value);
  });
  
  document.getElementById('logLevel').addEventListener('change', (e) => {
    fetchSystemLogs(e.target.value);
  });
});
