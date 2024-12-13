// Configuration
const API_BASE_URL = '/api';
const MIN_TIME_BETWEEN_ATTEMPTS = 10000; // 10 seconds
let lastSubmitTime = 0;

// DOM Content Loaded Event Handler
document.addEventListener('DOMContentLoaded', () => {
    initializeFormHandler();
    initializeButtons();
});

// Form Initialization
function initializeFormHandler() {
    const form = document.getElementById('api-credentials');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!checkTimeLimit()) return;
        
        const apiKey = document.getElementById('openai-api-key').value;
        const username = document.getElementById('skype-username').value;
        const password = document.getElementById('skype-password').value;
        
        if (!apiKey.startsWith('sk-')) {
            showError('Please enter a valid OpenAI API key');
            return;
        }
        
        await handleLogin(username, password, apiKey);
    });
}

// Button Initialization
function initializeButtons() {
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await refreshConversations();
        });
    }

    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', handleLogout);
    }
}

// Authentication Handler
async function handleLogin(username, password, apiKey) {
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                openai_api_key: apiKey,
                skype_username: username,
                skype_password: password
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Store credentials in sessionStorage
            sessionStorage.setItem('credentials', JSON.stringify({
                openai_api_key: apiKey,
                skype_username: username,
                skype_password: password
            }));
            
            document.getElementById('credentials-form').classList.add('hidden');
            document.getElementById('conversations-section').classList.remove('hidden');
            await loadConversations();
        } else {
            showError(data.message || 'Login failed');
        }
    } catch (error) {
        showError('Network error. Please try again.');
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}

// Load Conversations
async function loadConversations() {
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/conversations`, {
            method: 'GET',
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            renderConversations(data.data);
        } else {
            showError(data.message || 'Failed to load conversations');
            if (response.status === 401) {
                handleLogout();
            }
        }
    } catch (error) {
        showError('Error loading conversations');
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}

// Refresh Conversations
async function refreshConversations() {
    showLoading(true);
    
    // Add loading placeholders
    const conversationsList = document.querySelector('.conversations-list');
    conversationsList.innerHTML = `
        <div class="loading-card">
            <div class="loading-title"></div>
            <div class="loading-summary"></div>
            <div class="loading-meta"></div>
        </div>
        <div class="loading-card">
            <div class="loading-title"></div>
            <div class="loading-summary"></div>
            <div class="loading-meta"></div>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/conversations`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.status === "success") {
            renderConversations(data.data);
            showError('Conversations refreshed successfully!', true);
        } else {
            throw new Error(data.message || 'Failed to refresh conversations');
        }
    } catch (error) {
        console.error('Refresh error:', error);
        showError('Error refreshing conversations. ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Render Functions
function renderConversations(conversations) {
    const conversationsList = document.querySelector('.conversations-list');
    
    if (!conversations || conversations.length === 0) {
        renderNoConversations();
        return;
    }
    
    const sortedConversations = conversations.sort((a, b) => {
        const timeA = new Date(a.messages[a.messages.length - 1]?.time || 0);
        const timeB = new Date(b.messages[b.messages.length - 1]?.time || 0);
        return timeB - timeA;
    });
    
    conversationsList.innerHTML = sortedConversations.map(conv => `
        <div class="conversation-card" onclick="handleConversationClick('${conv.id}')">
            <div class="conversation-title">${conv.title}</div>
            <div class="summary-content">
                ${conv.summary || 'Processing summary...'}
            </div>
            <div class="conversation-meta">
                <span class="message-count">${conv.messages.length} messages</span>
                <span class="timestamp">${formatTimeAgo(conv.messages[conv.messages.length - 1]?.time)}</span>
            </div>
        </div>
    `).join('');
}

function renderNoConversations() {
    const conversationsList = document.querySelector('.conversations-list');
    conversationsList.innerHTML = `
        <div class="no-conversations">
            <h3>No Recent Conversations Found</h3>
            <p>This could be because:</p>
            <ul>
                <li>You haven't had any recent Skype conversations</li>
                <li>You might need to log into Skype directly first</li>
            </ul>
            <p>Try logging into Skype first, then come back here.</p>
        </div>
    `;
}

// Utility Functions
function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Unknown time';
    
    const messageTime = new Date(timestamp);
    const now = new Date();
    const diff = now - messageTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
}

function showError(message, isSuccess = false) {
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.className = isSuccess ? 'success-message' : 'error-message';
        errorContainer.classList.remove('hidden');
        setTimeout(() => {
            errorContainer.classList.add('hidden');
        }, 5000);
    }
}

function showLoading(show) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

function checkTimeLimit() {
    const now = Date.now();
    if (now - lastSubmitTime < MIN_TIME_BETWEEN_ATTEMPTS) {
        showError('Please wait a few seconds before trying again');
        return false;
    }
    lastSubmitTime = now;
    return true;
}

function handleLogout() {
    sessionStorage.removeItem('credentials');
    document.getElementById('conversations-section').classList.add('hidden');
    document.getElementById('credentials-form').classList.remove('hidden');
    document.getElementById('api-credentials').reset();
}

// Make this function available to the onclick handler in the HTML
window.handleConversationClick = async function(conversationId) {
};
