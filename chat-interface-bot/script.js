class ChatInterface {
  constructor() {
    this.initializeElements()
    this.bindEvents()
    this.conversations = []
    this.currentConversation = null
    this.isRecording = false
    this.recognition = null
    this.apiKey = 'AIzaSyBgz_NoFRYhbhHnYgl7PLs8fHm7ZcG60l4';  //  Gemini API 
    this.initializeSpeechRecognition()
    this.initializeInterfaceState()
  }

  initializeElements() {
    this.sidebar = document.querySelector(".sidebar")
    this.newChatBtn = document.querySelector(".new-chat-btn")
    this.menuBtn = document.querySelector(".menu-btn")
    this.messageInput = document.querySelector(".message-input")
    this.sendBtn = document.querySelector(".send-btn")
    this.micBtn = document.querySelector(".mic-btn")
    this.attachmentBtn = document.querySelector(".attachment-btn")
    this.chatContent = document.querySelector(".chat-content")
    this.welcomeMessage = document.querySelector(".welcome-message")
    this.conversationsHeader = document.querySelector(".conversations-header")
    this.conversationsList = document.querySelector(".conversations-list")
  }

  bindEvents() {
    // New chat button
    this.newChatBtn.addEventListener("click", () => this.startNewChat())

    // Menu button (mobile sidebar toggle)
    this.menuBtn.addEventListener("click", () => this.toggleSidebar())

    // Message input events
    this.messageInput.addEventListener("input", () => this.handleInputChange())
    this.messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        this.sendMessage()
      }
    })

    // Send button
    this.sendBtn.addEventListener("click", () => this.sendMessage())

    // Microphone button
    this.micBtn.addEventListener("click", () => this.toggleVoiceRecording())

    // Attachment button
    this.attachmentBtn.addEventListener("click", () => this.handleAttachment())

    // Close sidebar on outside click (mobile)
    document.addEventListener("click", (e) => {
      if (
        window.innerWidth <= 640 &&
        !this.sidebar.contains(e.target) &&
        !this.menuBtn.contains(e.target) &&
        this.sidebar.classList.contains("open")
      ) {
        this.closeSidebar()
      }
    })

    // Handle window resize
    window.addEventListener("resize", () => this.handleResize())
  }

  startNewChat() {
    this.currentConversation = {
      id: Date.now(),
      messages: [],
      title: "New Chat",
    }

    this.conversations.unshift(this.currentConversation)
    this.updateSidebarConversations()
    this.clearChatContent()
    this.showWelcomeMessage()

    // Focus on input
    this.messageInput.focus()
  }

  toggleSidebar() {
    this.sidebar.classList.toggle("open")
  }

  closeSidebar() {
    this.sidebar.classList.remove("open")
  }

  handleInputChange() {
    const hasText = this.messageInput.value.trim().length > 0
    this.sendBtn.disabled = !hasText

    if (hasText) {
      this.sendBtn.style.backgroundColor = "#10a37f"
    } else {
      this.sendBtn.style.backgroundColor = "#565869"
    }
  }

  sendMessage() {
    const message = this.messageInput.value.trim()
    if (!message) return

    // Add message to current conversation
    if (!this.currentConversation) {
      this.startNewChat()
    }

    const messageObj = {
      id: Date.now(),
      text: message,
      sender: "user",
      timestamp: new Date(),
    }

    this.currentConversation.messages.push(messageObj)

    // Hide welcome message and update chat content layout (moved after startNewChat to ensure it sticks)
    if (this.welcomeMessage.style.display !== "none") {
      this.hideWelcomeMessage()
      this.chatContent.classList.add("has-messages")
    }

    this.displayMessage(messageObj)

    // Clear input
    this.messageInput.value = ""
    this.handleInputChange()

    // Call real AI response (with delay for UX)
    setTimeout(async () => {
      await this.generateAIResponse(message)
    }, 1000)

    // Update conversation title if it's the first message
    if (this.currentConversation.messages.length === 1) {
      this.currentConversation.title = message.substring(0, 30) + (message.length > 30 ? "..." : "")
      this.updateSidebarConversations()
    }
  }

  async generateAIResponse(userMessage) {
    // Build full prompt with conversation history (including attachments)
    const historyMessages = this.currentConversation.messages
      .filter(msg => msg.sender !== 'ai' || !msg.isTyping)  // Exclude typing placeholders
      .slice(-10)  // Last 10 messages for context
      .map(msg => {
        if (msg.type === 'attachment') {
          return `Attachment: ${msg.fileName} (${msg.size} KB)\nContent: ${msg.content || 'Binary file'}\nPreview: ${msg.preview || ''}`;
        }
        return `${msg.sender === 'user' ? 'User: ' : 'Assistant: '}${msg.text}`;
      })
      .join('\n');

    const fullPrompt = `Chat history:\n${historyMessages}\n\nUser: ${userMessage}\nAssistant:`;

    // Show a "typing" indicator (optional, for UX)
    const typingMessage = {
      id: Date.now(),
      text: 'Thinking...',
      sender: 'ai',
      timestamp: new Date(),
      isTyping: true
    };
    this.currentConversation.messages.push(typingMessage);
    
    if (!this.chatMessagesContainer) {
      this.createChatMessagesContainer();
    }
    
    const typingElement = document.createElement('div');
    typingElement.className = `message ai-message typing-indicator`;
    typingElement.innerHTML = `
      <div class="message-content">
        <div class="message-text">Thinking...</div>
      </div>
    `;
    this.chatMessagesContainer.appendChild(typingElement);
    this.scrollToBottom();

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: fullPrompt  // Use full prompt with history and attachments
            }]
          }],
          generationConfig: {
            temperature: 0.7,  // Adjust for creativity (0-1)
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,  // Limit response length
          }
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I couldn\'t generate a response.';

      // Remove typing indicator
      typingElement.remove();
      this.currentConversation.messages.pop();  // Remove typing message

      // Add real AI response
      const messageObj = {
        id: Date.now(),
        text: aiText,
        sender: "ai",
        timestamp: new Date(),
      };

      this.currentConversation.messages.push(messageObj)
      this.displayMessage(messageObj);

    } catch (error) {
      console.error('Gemini API Error:', error);
      
      // Remove typing indicator
      typingElement.remove();
      this.currentConversation.messages.pop();

      // Fallback to a simple error message
      const errorMessageObj = {
        id: Date.now(),
        text: 'Oops! Something went wrong with the AI response. Please try again.',
        sender: "ai",
        timestamp: new Date(),
      };
      this.currentConversation.messages.push(errorMessageObj)
      this.displayMessage(errorMessageObj);
    }
  }

  displayMessage(message) {
    if (!this.chatMessagesContainer) {
      this.createChatMessagesContainer()
    }

    const messageElement = document.createElement("div")
    messageElement.className = `message ${message.sender}-message`

    if (message.type === 'attachment') {
      // Special rendering for attachments
      messageElement.innerHTML = `
        <div class="message-content attachment-content">
          <div class="attachment-header">
            <span class="file-icon">📎</span>
            <span class="file-name">${message.fileName}</span>
            <span class="file-size">(${message.size} KB)</span>
          </div>
          ${message.preview ? `<div class="attachment-preview">${message.preview}</div>` : ''}
        </div>
        <div class="message-time">${this.formatTime(message.timestamp)}</div>
      `
    } else {
      messageElement.innerHTML = `
        <div class="message-content">
          <div class="message-text">${message.text}</div>
          <div class="message-time">${this.formatTime(message.timestamp)}</div>
        </div>
      `
    }

    this.chatMessagesContainer.appendChild(messageElement)
    this.scrollToBottom()
  }

  createChatMessagesContainer() {
    this.chatMessagesContainer = document.createElement("div")
    this.chatMessagesContainer.className = "chat-messages"
    this.chatContent.appendChild(this.chatMessagesContainer)

    // Add styles for messages and attachments
    const style = document.createElement("style")
    style.textContent = `
            .chat-messages {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            
            .message {
                display: flex;
                max-width: 70%;
            }
            
            .user-message {
                align-self: flex-end;
            }
            
            .ai-message {
                align-self: flex-start;
            }
            
            .message-content {
                background-color: #f1f1f1;
                padding: 12px 16px;
                border-radius: 18px;
                position: relative;
            }
            
            .user-message .message-content {
                background-color: #10a37f;
                color: white;
            }
            
            .attachment-content {
                background-color: #e5e5e5;
                border: 1px dashed #ccc;
                padding: 8px 12px;
                border-radius: 12px;
                max-width: 80%;
            }
            
            .user-message .attachment-content {
                background-color: #d4f4e2;
                border-color: #10a37f;
            }
            
            .attachment-header {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: bold;
            }
            
            .file-icon {
                font-size: 16px;
            }
            
            .file-name {
                flex: 1;
            }
            
            .file-size {
                font-size: 12px;
                opacity: 0.7;
            }
            
            .attachment-preview {
                margin-top: 8px;
                font-size: 12px;
                opacity: 0.8;
                white-space: pre-wrap;
                max-height: 100px;
                overflow-y: auto;
            }
            
            .message-text {
                font-size: 14px;
                line-height: 1.4;
                margin-bottom: 4px;
            }
            
            .message-time {
                font-size: 11px;
                opacity: 0.7;
            }

            .typing-indicator .message-text {
              opacity: 0.7;
              font-style: italic;
            }
        `
    document.head.appendChild(style)
  }

  hideWelcomeMessage() {
    this.welcomeMessage.style.display = "none"
    this.welcomeMessage.classList.add("hidden")
  }

  showWelcomeMessage() {
    this.welcomeMessage.style.display = "block"
    this.welcomeMessage.classList.remove("hidden")
    this.chatContent.classList.remove("has-messages")
    if (this.chatMessagesContainer) {
      this.chatMessagesContainer.remove()
      this.chatMessagesContainer = null
    }
  }

  clearChatContent() {
    this.chatContent.classList.remove("has-messages")
    if (this.chatMessagesContainer) {
      this.chatMessagesContainer.remove()
      this.chatMessagesContainer = null
    }
  }

  scrollToBottom() {
    if (this.chatMessagesContainer) {
      this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight
    }
  }

  formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  updateSidebarConversations() {
    const conversationsHeader = document.querySelector(".conversations-header")
    const conversationsList = document.querySelector(".conversations-list")

    if (this.conversations.length === 0) {
      conversationsHeader.style.display = "flex"
      conversationsList.innerHTML = ""
      return
    }

    conversationsHeader.style.display = "none"
    conversationsList.innerHTML = ""

    this.conversations.slice(0, 10).forEach((conversation) => {
      const conversationElement = document.createElement("div")
      conversationElement.className = "conversation-item"

      if (this.currentConversation && conversation.id === this.currentConversation.id) {
        conversationElement.classList.add("active")
      }

      conversationElement.innerHTML = `
        <span class="conversation-title">${conversation.title}</span>
      `

      conversationElement.addEventListener("click", () => {
        this.loadConversation(conversation)
      })

      conversationsList.appendChild(conversationElement)
    })
  }

  loadConversation(conversation) {
    this.currentConversation = conversation
    this.clearChatContent()

    if (conversation.messages.length > 0) {
      this.hideWelcomeMessage()
      this.chatContent.classList.add("has-messages")
      this.createChatMessagesContainer()
      conversation.messages.forEach((message) => {
        this.displayMessage(message)
      })
    } else {
      this.showWelcomeMessage()
    }

    // Close sidebar on mobile
    if (window.innerWidth <= 640) {
      this.closeSidebar()
    }
  }

  toggleVoiceRecording() {
    if (!this.recognition) {
      alert("Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.")
      return
    }

    if (this.isRecording) {
      console.log("[v0] Stopping voice recording")
      this.recognition.stop()
    } else {
      console.log("[v0] Starting voice recording")
      try {
        this.recognition.start()
      } catch (error) {
        console.log("[v0] Error starting recognition:", error)
        alert("Could not start voice recording. Please try again.")
      }
    }
  }

  updateMicButtonState() {
    if (this.isRecording) {
      this.micBtn.style.backgroundColor = "#ef4444"
      this.micBtn.style.color = "white"
      this.micBtn.title = "Stop recording"
    } else {
      this.micBtn.style.backgroundColor = ""
      this.micBtn.style.color = ""
      this.micBtn.title = "Start voice recording"
    }
  }

  async handleAttachment() {
    // Ensure conversation exists
    if (!this.currentConversation) {
      this.startNewChat()
    }

    // Create file input
    const fileInput = document.createElement("input")
    fileInput.type = "file"
    fileInput.multiple = true
    fileInput.accept = "image/*,text/*,.pdf,.doc,.docx,.ics"  // Added .ics explicitly

    fileInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files)
      if (files.length === 0) return

      // Ensure chat is ready
      if (this.welcomeMessage.style.display !== "none") {
        this.hideWelcomeMessage()
        this.chatContent.classList.add("has-messages")
        this.createChatMessagesContainer()
      }

      for (const file of files) {
        let content = ''
        let preview = ''

        // For text-based files, read content
        if (file.type === 'text/plain' || file.name.endsWith('.ics') || file.name.endsWith('.txt')) {
          try {
            content = await this.readFileAsText(file)
            preview = content.substring(0, 200) + (content.length > 200 ? '...' : '')

            // Special parsing for .ics
            if (file.name.endsWith('.ics')) {
              const parsedEvent = this.parseICS(content)
              if (parsedEvent) {
                preview = `Event: ${parsedEvent.summary}\nDate: ${parsedEvent.start} to ${parsedEvent.end}\nDesc: ${parsedEvent.description.substring(0, 100)}...`
              }
            }
          } catch (err) {
            console.error('Error reading file:', err)
            preview = '(Could not read content)'
          }
        } else {
          // For non-text, just metadata
          preview = '(Binary file - preview not available)'
        }

        const attachmentMessage = {
          id: Date.now() + Math.random(),  // Unique ID
          type: 'attachment',
          fileName: file.name,
          content: content,  // Full content for prompt
          size: (file.size / 1024).toFixed(1),
          preview: preview,
          sender: "user",
          timestamp: new Date(),
        }

        this.currentConversation.messages.push(attachmentMessage)
        this.displayMessage(attachmentMessage)
      }

      // Focus input for user to type a message
      this.messageInput.focus()
      console.log('Files attached:', files.map(f => f.name))
    })

    fileInput.click()
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  parseICS(content) {
    // Simple .ics parser for basic VEVENT (extracts first event)
    const lines = content.split('\n')
    let inEvent = false
    let event = { summary: '', start: '', end: '', description: '' }

    for (const line of lines) {
      if (line.startsWith('BEGIN:VEVENT')) {
        inEvent = true
      } else if (line.startsWith('END:VEVENT')) {
        inEvent = false
        break  // Return first event
      } else if (inEvent) {
        if (line.startsWith('SUMMARY:')) event.summary = line.substring(8).trim()
        else if (line.startsWith('DTSTART:')) event.start = line.substring(8).trim()
        else if (line.startsWith('DTEND:')) event.end = line.substring(6).trim()
        else if (line.startsWith('DESCRIPTION:')) event.description = line.substring(12).trim()
      }
    }

    // Format dates if present (ISO-like)
    if (event.start) event.start = new Date(event.start.replace(/(\d{4})(\d{2})(\d{2})T?(\d{6})Z?/, '$1-$2-$3T$4Z')).toLocaleString()
    if (event.end) event.end = new Date(event.end.replace(/(\d{4})(\d{2})(\d{2})T?(\d{6})Z?/, '$1-$2-$3T$4Z')).toLocaleString()

    return Object.values(event).some(v => v) ? event : null
  }

  handleResize() {
    if (window.innerWidth > 640) {
      this.sidebar.classList.remove("open")
    }
  }

  initializeSpeechRecognition() {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      this.recognition = new SpeechRecognition()

      this.recognition.continuous = false
      this.recognition.interimResults = false
      this.recognition.lang = "en-US"

      this.recognition.onstart = () => {
        console.log("[v0] Speech recognition started")
        this.isRecording = true
        this.updateMicButtonState()
      }

      this.recognition.onresult = (event) => {
        console.log("[v0] Speech recognition result received")
        const transcript = event.results[0][0].transcript
        this.messageInput.value = transcript
        this.handleInputChange()
        this.messageInput.focus()
      }

      this.recognition.onerror = (event) => {
        console.log("[v0] Speech recognition error:", event.error)
        this.isRecording = false
        this.updateMicButtonState()

        if (event.error === "not-allowed") {
          alert("Microphone access denied. Please allow microphone access and try again.")
        } else if (event.error === "no-speech") {
          alert("No speech detected. Please try again.")
        } else {
          alert("Speech recognition error: " + event.error)
        }
      }

      this.recognition.onend = () => {
        console.log("[v0] Speech recognition ended")
        this.isRecording = false
        this.updateMicButtonState()
      }
    } else {
      console.log("[v0] Speech recognition not supported")
    }
  }

  initializeInterfaceState() {
    // Check if we have any conversations with messages
    const hasActiveConversations = this.conversations.some((conv) => conv.messages && conv.messages.length > 0)

    if (hasActiveConversations) {
      // If we have conversations with messages, hide welcome message immediately
      this.hideWelcomeMessage()
      this.chatContent.classList.add("has-messages")
    } else {
      // Show welcome message for new users
      this.showWelcomeMessage()
    }
  }
}

// Initialize the chat interface when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new ChatInterface()
})

// Add some additional utility functions
window.chatUtils = {
  exportConversation: (conversation) => {
    const data = JSON.stringify(conversation, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = `conversation-${conversation.id}.json`
    a.click()

    URL.revokeObjectURL(url)
  },

  clearAllConversations: () => {
    if (confirm("Are you sure you want to clear all conversations?")) {
      localStorage.removeItem("chatConversations")
      location.reload()
    }
  },
}