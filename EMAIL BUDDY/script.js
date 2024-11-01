class EmailDispenser {
    constructor() {
        this.currentEmail = '';
        this.apiBase = 'https://www.1secmail.com/api/v1';
        this.emailDatabase = [];
        this.expirationCheckerInterval = null;
        this.lastCheckedMessages = new Map(); // Track last checked messages
        this.notificationQueue = new Set(); // Track pending notifications
        this.verificationLinks = new Map(); // Track verification links
        this.hasNotificationPermission = false;
        this.checkNotificationPermission();
        this.deviceId = this.getOrCreateDeviceId();
        this.init();
        this.messagesList = document.getElementById('messagesList');
        this.setupMessageClickHandlers();
    }

    init() {
        this.loadFromLocalStorage();
        this.setupEventListeners();
        this.startExpirationChecker();
        this.updateDatabaseDisplay();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.generateNewEmail());
        document.getElementById('copyBtn').addEventListener('click', () => this.copyEmail());
        document.getElementById('checkMailBtn').addEventListener('click', () => this.checkMail());
        document.getElementById('clearAllBtn').addEventListener('click', () => this.clearDatabase());
        
        // Setup expiration option handlers
        const expirationOptions = document.querySelectorAll('.option');
        expirationOptions.forEach(option => {
            option.addEventListener('click', () => this.handleExpirationOption(option));
        });

        // Setup custom time confirmation
        document.getElementById('confirmCustomTime')?.addEventListener('click', 
            () => this.saveCustomExpiration());

        // Add event delegation for email history clicks
        document.getElementById('dbContent').addEventListener('click', (e) => {
            const emailCell = e.target.closest('.email-cell');
            if (emailCell) {
                const email = emailCell.querySelector('.email-address').textContent;
                this.selectEmailFromHistory(email);
            }
        });
    }

    async generateNewEmail() {
        try {
            const response = await fetch(`${this.apiBase}/?action=genRandomMailbox&count=1`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                this.currentEmail = data[0];
                document.getElementById('currentEmail').value = this.currentEmail;
                this.showExpirationDialog();
            }
        } catch (error) {
            console.error('Error generating email:', error);
            this.showToast('Failed to generate email', 'error');
        }
    }

    showExpirationDialog() {
        const dialog = document.getElementById('expirationDialog');
        dialog.style.display = 'flex';
        
        // Reset custom time input
        const customInput = document.getElementById('customTimeInput');
        customInput.style.display = 'none';
        document.getElementById('customTime').value = '';
    }

    handleExpirationOption(option) {
        const customInput = document.getElementById('customTimeInput');
        
        // Remove selection from all options
        document.querySelectorAll('.option').forEach(opt => 
            opt.classList.remove('selected'));
        option.classList.add('selected');

        if (option.dataset.custom === 'true') {
            customInput.style.display = 'flex';
        } else {
            customInput.style.display = 'none';
            
            if (option.dataset.manual === 'true') {
                this.saveEmailWithExpiration(null);
            } else {
                const hours = parseInt(option.dataset.hours);
                this.saveEmailWithExpiration(hours);
            }
        }
    }

    saveCustomExpiration() {
        const timeInput = document.getElementById('customTime');
        const unitSelect = document.getElementById('customTimeUnit');
        
        const time = parseFloat(timeInput.value);
        const unit = parseFloat(unitSelect.value);
        
        if (!time || time <= 0) {
            this.showToast('Please enter a valid time', 'error');
            return;
        }

        const hours = time * unit;
        this.saveEmailWithExpiration(hours);
    }

    saveEmailWithExpiration(hours) {
        const expirationTime = hours ? new Date(Date.now() + (hours * 3600000)).toISOString() : null;
        
        const newEntry = {
            email: this.currentEmail,
            date: new Date().toISOString(),
            expiration: expirationTime,
            messages: 0
        };

        this.emailDatabase.push(newEntry);
        this.saveToLocalStorage();
        this.updateDatabaseDisplay();
        
        // Close dialog
        document.getElementById('expirationDialog').style.display = 'none';
        this.showToast(`Email saved${hours ? ` with ${hours} hour expiration` : ' without expiration'}`);
    }

    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(`emailDatabase_${this.deviceId}`);
            this.emailDatabase = stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            this.emailDatabase = [];
        }
    }

    saveToLocalStorage() {
        try {
            localStorage.setItem(`emailDatabase_${this.deviceId}`, JSON.stringify(this.emailDatabase));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    async checkMail(silent = false) {
        if (!this.currentEmail) {
            if (!silent) this.showToast('No email selected', 'error');
            return;
        }

        try {
            const [login, domain] = this.currentEmail.split('@');
            const response = await fetch(
                `${this.apiBase}/?action=getMessages&login=${login}&domain=${domain}`
            );
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const messages = await response.json();
            
            // Update message count in database
            const index = this.emailDatabase.findIndex(e => e.email === this.currentEmail);
            if (index !== -1) {
                this.emailDatabase[index].messages = messages.length;
                this.saveToLocalStorage();
                this.updateDatabaseDisplay();
            }

            // Update messages display
            this.updateMessageDisplay(messages);
            
            // Check for new messages and show notifications
            const lastChecked = this.lastCheckedMessages.get(this.currentEmail) || new Set();
            const newMessages = messages.filter(msg => !lastChecked.has(msg.id));
            
            // Update last checked messages
            this.lastCheckedMessages.set(
                this.currentEmail, 
                new Set(messages.map(msg => msg.id))
            );

            // Show notifications for new messages
            newMessages.forEach(msg => this.showEmailNotification(msg));
            
            return messages;
        } catch (error) {
            console.error('Error checking mail:', error);
            if (!silent) this.showToast('Failed to check messages', 'error');
        }
    }

    filterNewMessages(messages) {
        const lastChecked = this.lastCheckedMessages.get(this.currentEmail) || new Set();
        return messages.filter(msg => !lastChecked.has(msg.id));
    }

    showEmailNotification(message) {
        if (!("Notification" in window) || !this.hasNotificationPermission) {
            this.showToast(`New email from ${message.from}`);
            return;
        }

        const notificationId = `${this.currentEmail}-${message.id}`;

        const notification = new Notification("New Email Received", {
            body: `From: ${message.from}\nSubject: ${message.subject || 'No Subject'}`,
            icon: '/favicon.ico', // Add your app icon path
            tag: notificationId,
            requireInteraction: true,
            silent: false
        });

        notification.onclick = () => {
            window.focus();
            this.showMessageDetail(message);
            notification.close();
            this.notificationQueue.delete(notificationId);
        };

        // Auto-remove from queue after 1 hour
        setTimeout(() => {
            this.notificationQueue.delete(notificationId);
        }, 3600000);
    }

    async showMessageDetail(message) {
        try {
            // Fetch full message content if needed
            const [login, domain] = this.currentEmail.split('@');
            const response = await fetch(
                `${this.apiBase}/?action=readMessage&login=${login}&domain=${domain}&id=${message.id}`
            );
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const fullMessage = await response.json();

            // Create modal with enhanced content
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>${fullMessage.subject || 'No Subject'}</h2>
                        <button onclick="this.closest('.modal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="message-meta">
                            <p><strong>From:</strong> ${fullMessage.from}</p>
                            <p><strong>To:</strong> ${this.currentEmail}</p>
                            <p><strong>Date:</strong> ${new Date(fullMessage.date).toLocaleString()}</p>
                        </div>
                        <div class="message-content">
                            ${this.formatMessageContent(fullMessage)}
                        </div>
                        ${this.formatAttachments(fullMessage)}
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } catch (error) {
            console.error('Error fetching message details:', error);
            this.showToast('Failed to load message details', 'error');
        }
    }

    formatMessageContent(message) {
        // Prefer HTML content if available
        if (message.htmlBody) {
            const sanitizedHtml = this.sanitizeHtml(message.htmlBody);
            return `<div class="html-content">${sanitizedHtml}</div>`;
        }
        
        // Format plain text with clickable links
        if (message.textBody) {
            const withLinks = message.textBody.replace(
                /(https?:\/\/[^\s]+)/g,
                '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
            );
            return `<div class="text-content">${withLinks.replace(/\n/g, '<br>')}</div>`;
        }

        return '<p>No content available</p>';
    }

    formatAttachments(message) {
        if (!message.attachments?.length) return '';

        return `
            <div class="attachments">
                <h4>Attachments</h4>
                <div class="attachment-list">
                    ${message.attachments.map(att => `
                        <div class="attachment-item">
                            <span class="attachment-icon">📎</span>
                            <a href="#" onclick="emailDispenser.downloadAttachment('${att.filename}', '${message.id}')">${att.filename}</a>
                            <span class="attachment-size">${this.formatFileSize(att.size)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    sanitizeHtml(html) {
        // Basic HTML sanitization
        const temp = document.createElement('div');
        temp.innerHTML = html;
        
        // Remove potentially dangerous elements and attributes
        const dangerous = ['script', 'style', 'iframe', 'object', 'embed'];
        dangerous.forEach(tag => {
            temp.querySelectorAll(tag).forEach(el => el.remove());
        });

        return temp.innerHTML;
    }

    updateDatabaseDisplay() {
        const dbContent = document.getElementById('dbContent');
        if (!dbContent) return;

        if (this.emailDatabase.length === 0) {
            dbContent.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-state">
                        <div class="empty-icon">📧</div>
                        <h3>No Email History</h3>
                        <p>Generated emails will appear here</p>
                    </td>
                </tr>`;
            return;
        }

        dbContent.innerHTML = this.emailDatabase.map((entry, index) => `
            <tr class="email-row ${entry.email === this.currentEmail ? 'active' : ''}" 
                data-email="${entry.email}">
                <td class="email-cell">
                    <div class="email-info">
                        <span class="email-address">${entry.email}</span>
                        <div class="email-meta">
                            ${entry.expiration 
                                ? `<span class="expiration-badge" id="timer-${index}">
                                     ${this.getExpirationInfo(entry)}
                                   </span>`
                                : '<span class="expiration-badge manual">Manual deletion</span>'
                            }
                            <span class="message-count ${entry.messages > 0 ? 'has-messages' : ''}">
                                ${entry.messages} message${entry.messages !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                </td>
                <td>${new Date(entry.date).toLocaleString()}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn primary" onclick="emailDispenser.copyEmailFromDB('${entry.email}')">
                            <span class="icon">📋</span>
                        </button>
                        <button class="btn danger" onclick="emailDispenser.deleteEmailFromDB(${index})">
                            <span class="icon">🗑️</span>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    getExpirationInfo(entry) {
        if (!entry.expiration) {
            return 'Manual deletion';
        }

        const now = new Date();
        const expirationDate = new Date(entry.expiration);
        const hoursLeft = (expirationDate - now) / 3600000;

        return `⏳ ${this.formatTimeLeft(hoursLeft)}`;
    }

    formatTimeLeft(totalHours) {
        if (totalHours < 0) return 'Expired';
        
        if (totalHours < 1/60) { // Less than a minute
            const seconds = Math.max(1, Math.floor(totalHours * 3600));
            return `${seconds}s`;
        } else if (totalHours < 1) { // Less than an hour
            const minutes = Math.floor(totalHours * 60);
            const seconds = Math.floor((totalHours * 3600) % 60);
            return `${minutes}m ${seconds}s`;
        } else if (totalHours < 24) { // Less than a day
            const hours = Math.floor(totalHours);
            const minutes = Math.floor((totalHours % 1) * 60);
            return `${hours}h ${minutes}m`;
        } else if (totalHours < 168) { // Less than a week
            const days = Math.floor(totalHours / 24);
            const hours = Math.floor(totalHours % 24);
            return `${days}d ${hours}h`;
        } else if (totalHours < 730) { // Less than a month
            const weeks = Math.floor(totalHours / 168);
            const days = Math.floor((totalHours % 168) / 24);
            return `${weeks}w ${days}d`;
        } else { // Months or more
            const months = Math.floor(totalHours / 730);
            const weeks = Math.floor((totalHours % 730) / 168);
            return `${months}mo ${weeks}w`;
        }
    }

    async copyEmail() {
        if (!this.currentEmail) {
            this.showToast('No email to copy', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(this.currentEmail);
            this.showToast('Email copied to clipboard!');
        } catch (error) {
            console.error('Error copying email:', error);
            this.showToast('Failed to copy email', 'error');
        }
    }

    copyEmailFromDB(email) {
        navigator.clipboard.writeText(email)
            .then(() => this.showToast('Email copied to clipboard!'))
            .catch(() => this.showToast('Failed to copy email', 'error'));
    }

    deleteEmailFromDB(index) {
        this.emailDatabase.splice(index, 1);
        this.saveToLocalStorage();
        this.updateDatabaseDisplay();
        this.showToast('Email deleted from history');
    }

    clearDatabase() {
        if (confirm('Are you sure you want to clear all email history?')) {
            this.emailDatabase = [];
            localStorage.removeItem(`emailDatabase_${this.deviceId}`);
            this.updateDatabaseDisplay();
            this.showToast('History cleared');
        }
    }

    updateMessageDisplay(messages) {
        if (!this.messagesList) return;

        if (!messages || messages.length === 0) {
            this.messagesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <h3>No Messages Yet</h3>
                    <p>This inbox is empty. New messages will appear here.</p>
                    <button class="btn primary refresh-btn" onclick="emailDispenser.checkMail()">
                        <span class="icon">🔄</span>Check Again
                    </button>
                </div>`;
            return;
        }

        this.messagesList.innerHTML = `
            <div class="messages-header">
                <span>${messages.length} message${messages.length !== 1 ? 's' : ''}</span>
                <button class="btn small" onclick="emailDispenser.checkMail()">
                    <span class="icon">🔄</span>Refresh
                </button>
            </div>
            <div class="messages-list">
                ${messages.map(message => `
                    <div class="message-item" data-message-id="${message.id}">
                        <div class="message-status"></div>
                        <div class="message-content">
                            <div class="message-header">
                                <span class="message-from">${message.from}</span>
                                <span class="message-date">${this.formatDate(message.date)}</span>
                            </div>
                            <div class="message-subject">${message.subject || 'No Subject'}</div>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) {
            // Today - show time
            return date.toLocaleTimeString(undefined, { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } else if (days === 1) {
            return 'Yesterday';
        } else if (days < 7) {
            return date.toLocaleDateString(undefined, { weekday: 'long' });
        } else {
            return date.toLocaleDateString(undefined, { 
                month: 'short', 
                day: 'numeric' 
            });
        }
    }

    updateMessageCount(count) {
        const index = this.emailDatabase.findIndex(e => e.email === this.currentEmail);
        if (index !== -1) {
            this.emailDatabase[index].messages = count;
            this.saveToLocalStorage();
            this.updateDatabaseDisplay();
        }
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    startExpirationChecker() {
        // Update every second
        this.expirationCheckerInterval = setInterval(() => {
            this.checkExpirations();
            this.updateTimers(); // Add real-time timer updates
        }, 1000);
        
        // Initial check
        this.checkExpirations();
    }

    updateTimers() {
        this.emailDatabase.forEach((entry, index) => {
            if (!entry.expiration) return; // Skip manual deletion entries

            const timerElement = document.querySelector(`#timer-${index}`);
            if (timerElement) {
                const now = new Date();
                const expirationDate = new Date(entry.expiration);
                const hoursLeft = (expirationDate - now) / 3600000;
                
                let badgeClass = 'expiration-badge';
                if (hoursLeft < 1) {
                    badgeClass += ' critical';
                } else if (hoursLeft < 24) {
                    badgeClass += ' warning';
                } else {
                    badgeClass += ' normal';
                }

                timerElement.className = badgeClass;
                timerElement.innerHTML = `⏳ ${this.formatTimeLeft(hoursLeft)}`;
            }
        });
    }

    checkExpirations() {
        const now = new Date();
        let changed = false;

        this.emailDatabase = this.emailDatabase.filter(entry => {
            if (!entry.expiration) return true; // Keep entries without expiration
            const expirationDate = new Date(entry.expiration);
            if (expirationDate <= now) {
                changed = true;
                return false; // Remove expired entries silently
            }
            return true;
        });

        if (changed) {
            this.saveToLocalStorage();
            this.updateDatabaseDisplay();
        }
    }

    async selectEmailFromHistory(email) {
        this.currentEmail = email;
        document.getElementById('currentEmail').value = email;
        
        // Show loading state
        this.messagesList.innerHTML = `
            <div class="loading-messages">
                <div class="loading-spinner"></div>
                <p>Checking messages...</p>
            </div>`;
        
        const messages = await this.checkMail(true);
        
        // Update UI based on message count
        if (!messages || messages.length === 0) {
            this.messagesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <h3>No Messages Yet</h3>
                    <p>This inbox is empty. New messages will appear here.</p>
                    <button class="btn primary refresh-btn" onclick="emailDispenser.checkMail()">
                        <span class="icon">🔄</span>Check Again
                    </button>
                </div>`;
        }
    }

    showMessageDetail(message) {
        // Create modal for message detail
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${message.subject || 'No Subject'}</h2>
                    <button onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <p><strong>From:</strong> ${message.from}</p>
                    <p><strong>Date:</strong> ${new Date(message.date).toLocaleString()}</p>
                    <div class="message-content">${message.textBody || message.htmlBody || 'No content'}</div>
                    ${message.attachments ? `
                        <div class="attachments">
                            <h4>Attachments</h4>
                            ${message.attachments.map(att => `
                                <a href="#" onclick="emailDispenser.downloadAttachment('${att}')">${att}</a>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    showNotification(message) {
        // Check if browser supports notifications
        if (!("Notification" in window)) {
            this.showToast(message);
            return;
        }

        // Check if permission is already granted
        if (Notification.permission === "granted") {
            new Notification("Email Buddy", { body: message });
        }
        // Otherwise, request permission
        else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification("Email Buddy", { body: message });
                }
            });
        }

        // Also show toast for better UX
        this.showToast(message);
    }

    // Add auto-refresh functionality
    startAutoRefresh() {
        // Check mail every minute
        setInterval(() => {
            if (this.currentEmail) {
                this.checkMail(true); // Silent check
            }
        }, 60000);
    }

    async checkNotificationPermission() {
        if ("Notification" in window) {
            if (Notification.permission === "granted") {
                this.hasNotificationPermission = true;
            } else if (Notification.permission !== "denied") {
                const permission = await Notification.requestPermission();
                this.hasNotificationPermission = permission === "granted";
            }

        }
    }

    setupMessageClickHandlers() {
        this.messagesList.addEventListener('click', async (e) => {
            const messageItem = e.target.closest('.message-item');
            if (messageItem) {
                const messageId = messageItem.dataset.messageId;
                await this.openMessage(messageId);
            }
        });
    }

    async openMessage(messageId) {
        try {
            const [login, domain] = this.currentEmail.split('@');
            const response = await fetch(
                `${this.apiBase}/?action=readMessage&login=${login}&domain=${domain}&id=${messageId}`
            );
            
            if (!response.ok) throw new Error('Failed to fetch message');
            const message = await response.json();
            
            const modalHtml = `
                <div class="email-modal" id="emailModal">
                    <div class="email-modal-content">
                        <div class="email-modal-header">
                            <h3>${message.subject || 'No Subject'}</h3>
                            <button class="close-btn" onclick="document.getElementById('emailModal').remove()">×</button>
                        </div>
                        <div class="email-modal-body">
                            <div class="email-metadata">
                                <p><strong>From:</strong> ${message.from}</p>
                                <p><strong>Date:</strong> ${new Date(message.date).toLocaleString()}</p>
                            </div>
                            <div class="email-content">
                                ${message.htmlBody || `<pre>${message.textBody || 'No content'}</pre>`}
                            </div>
                            ${this.renderAttachments(message)}
                        </div>
                    </div>
                </div>`;

            // Remove existing modal if any
            const existingModal = document.getElementById('emailModal');
            if (existingModal) existingModal.remove();

            // Add new modal
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Add click handler to close modal when clicking outside
            const modal = document.getElementById('emailModal');
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

        } catch (error) {
            console.error('Error opening message:', error);
            this.showToast('Failed to open message', 'error');
        }
    }

    renderAttachments(message) {
        if (!message.attachments || message.attachments.length === 0) {
            return '';
        }

        return `
            <div class="email-attachments">
                <h4>Attachments</h4>
                <div class="attachment-list">
                    ${message.attachments.map(att => `
                        <div class="attachment-item">
                            <span class="attachment-icon">📎</span>
                            <span class="attachment-name">${att.filename}</span>
                            <span class="attachment-size">${this.formatFileSize(att.size)}</span>
                            <a href="${this.getAttachmentUrl(message.id, att.filename)}" 
                               class="btn small" 
                               download="${att.filename}">
                                Download
                            </a>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    getAttachmentUrl(messageId, filename) {
        const [login, domain] = this.currentEmail.split('@');
        return `${this.apiBase}/?action=download&login=${login}&domain=${domain}&id=${messageId}&file=${filename}`;
    }

    getOrCreateDeviceId() {
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
            deviceId = crypto.randomUUID();
            localStorage.setItem('deviceId', deviceId);
        }
        return deviceId;
    }
}

// Initialize the app globally so we can access it from HTML
const emailDispenser = new EmailDispenser();

// Font loading handler
document.documentElement.classList.add('fonts-loading');

Promise.all([
    document.fonts.load('1em "Sans Forgetica"'),
    document.fonts.load('1em "Alfa Slab One"')
]).then(() => {
    document.documentElement.classList.remove('fonts-loading');
    document.documentElement.classList.add('fonts-loaded');
});