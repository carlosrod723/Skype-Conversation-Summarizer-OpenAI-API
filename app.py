import os
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from skpy import Skype, SkypeAuthException
import openai
from dotenv import load_dotenv

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Add CORS back

# Load environment variables
load_dotenv()

class SkypeManager:
    def __init__(self):
        self.sk = None
        self.username = None
        self.password = None
        
    def authenticate(self, username, password):
        """Authenticate with Skype"""
        try:
            self.username = username
            self.password = password
            self.sk = Skype(username, password)
            return True
        except SkypeAuthException:
            return False

    def refresh_connection(self):
        """Refresh Skype connection using stored credentials"""
        if self.username and self.password:
            try:
                self.sk = Skype(self.username, self.password)
                return True
            except SkypeAuthException:
                return False
        return False
            
    def get_recent_conversations(self, days=5):
        """Retrieve conversations from the last N days"""
        if not self.sk:
            raise ValueError("Skype not authenticated")
            
        try:
            # Force refresh connection before getting conversations
            if not self.refresh_connection():
                raise ValueError("Failed to refresh Skype connection")

            conversations = []
            chats = self.sk.chats.recent()
            current_time = datetime.now()
            time_limit = current_time - timedelta(days=days)

            for chat_id, chat in chats.items():
                try:
                    messages = []
                    user_info = "Unknown User"
                    if hasattr(chat, 'user'):
                        user = chat.user
                        user_info = str(user.name) if hasattr(user, 'name') else str(user)

                    # Get messages
                    recent_messages = chat.getMsgs()
                    for msg in recent_messages:
                        msg_time = msg.time if hasattr(msg, 'time') else None
                        if msg_time and msg_time >= time_limit:
                            messages.append({
                                'id': msg.id if hasattr(msg, 'id') else 'unknown',
                                'content': msg.content if hasattr(msg, 'content') else '',
                                'time': msg_time.isoformat() if msg_time else '',
                                'sender': msg.userId if hasattr(msg, 'userId') else 'unknown'
                            })

                    if messages:
                        conversations.append({
                            'id': chat_id,
                            'title': user_info,
                            'messages': messages
                        })

                except Exception as e:
                    app.logger.error(f"Error processing chat {chat_id}: {str(e)}")
                    continue

            return conversations
        except Exception as e:
            app.logger.error(f"Error in get_recent_conversations: {str(e)}")
            raise

class ConversationSummarizer:
    def __init__(self):
        self.client = None

    def initialize(self, api_key):
        """Initialize OpenAI with the given API key"""
        try:
            self.client = openai.OpenAI(api_key=api_key)
            # Test the API key
            self.client.models.list()
            return True
        except Exception:
            self.client = None
            return False

    def summarize(self, messages):
        """Summarize a conversation using OpenAI"""
        if not self.client:
            return "Summary unavailable - OpenAI not configured"

        try:
            conversation_text = "\n".join([
                f"{msg['sender']}: {msg['content']}" 
                for msg in messages
            ])

            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Please provide a brief, concise summary of this conversation."},
                    {"role": "user", "content": conversation_text}
                ],
                max_tokens=150
            )

            return response.choices[0].message.content.strip()
        except Exception as e:
            return f"Summary unavailable - Error: {str(e)}"

# Initialize managers
skype_manager = SkypeManager()
summarizer = ConversationSummarizer()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/auth', methods=['POST'])
def authenticate():
    """Handle Skype authentication"""
    try:
        data = request.json
        if not data:
            return jsonify({
                "status": "error",
                "message": "No data provided"
            }), 400
            
        # Validate required fields
        required_fields = ['openai_api_key', 'skype_username', 'skype_password']
        if not all(field in data for field in required_fields):
            return jsonify({
                "status": "error",
                "message": "Missing required fields"
            }), 400

        # Initialize OpenAI with provided key
        if not summarizer.initialize(data['openai_api_key']):
            return jsonify({
                "status": "error",
                "message": "Invalid OpenAI API key"
            }), 401
            
        # Test Skype authentication
        if not skype_manager.authenticate(data['skype_username'], data['skype_password']):
            return jsonify({
                "status": "error",
                "message": "Skype authentication failed"
            }), 401
        
        return jsonify({
            "status": "success",
            "message": "Authentication successful"
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/conversations')
def get_conversations():
    """Retrieve and summarize conversations"""
    try:
        if not skype_manager.sk:
            return jsonify({
                "status": "error",
                "message": "Not authenticated"
            }), 401

        # Force refresh the Skype connection
        if not skype_manager.refresh_connection():
            return jsonify({
                "status": "error",
                "message": "Failed to refresh connection"
            }), 401

        conversations = skype_manager.get_recent_conversations()
        
        # Add summaries if OpenAI is configured
        if summarizer.client:
            for conv in conversations:
                conv['summary'] = summarizer.summarize(conv['messages'])
                
        return jsonify({
            "status": "success",
            "data": conversations
        })
    except Exception as e:
        app.logger.error(f"Error in get_conversations: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)